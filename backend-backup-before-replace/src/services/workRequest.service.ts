import { Prisma, Role, WorkRequestStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { notifySafely } from "./notification.service";
import {
  CreateWorkRequestInput,
  ListWorkRequestsQuery,
  RespondWorkRequestInput,
} from "../validators/workRequest.validator";

const LABOUR_NOT_FOUND_MESSAGE = "Labour not found or is not currently available";
const REQUEST_NOT_FOUND_MESSAGE = "Work request not found";
const NOT_CANCELLABLE_MESSAGE =
  "Only pending or accepted work requests can be cancelled";
const ALREADY_OCCURRED_MESSAGE =
  "This work request's scheduled date has already passed and can no longer be cancelled";
const NOT_RESPONDABLE_MESSAGE = "Only pending work requests can be responded to";

// Shared shape for every response this module sends — enough of each side
// (farmer/labour) for the other party to know who they're dealing with,
// mirroring PublicProduceListingFarmer in produce.service.ts.
const WORK_REQUEST_SELECT = {
  id: true,
  farmerId: true,
  labourId: true,
  workType: true,
  workDate: true,
  location: true,
  wage: true,
  message: true,
  status: true,
  respondedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  farmer: {
    select: {
      id: true,
      fullName: true,
      farmerProfile: {
        select: {
          mobile: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
        },
      },
    },
  },
  labour: {
    select: {
      id: true,
      fullName: true,
      labourProfile: {
        select: {
          mobile: true,
          skills: true,
          dailyWage: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
        },
      },
    },
  },
} satisfies Prisma.WorkRequestSelect;

export type WorkRequestResult = Prisma.WorkRequestGetPayload<{
  select: typeof WORK_REQUEST_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a work request from the calling farmer to a specific labour
 * user. The target must exist, be a LABOUR-role user, and have an
 * admin-verified LabourProfile — the same visibility rule the farmer-facing
 * search/getById endpoints already enforce (labour.service.ts), so a
 * farmer can only ever request work from labour they could actually find
 * through search.
 */
export async function createWorkRequest(
  farmerId: string,
  input: CreateWorkRequestInput
): Promise<WorkRequestResult> {
  const labourUser = await prisma.user.findUnique({
    where: { id: input.labourId },
    select: { id: true, role: true, labourProfile: { select: { isVerified: true } } },
  });

  if (
    !labourUser ||
    labourUser.role !== Role.LABOUR ||
    !labourUser.labourProfile?.isVerified
  ) {
    throw new AppError(LABOUR_NOT_FOUND_MESSAGE, 404);
  }

  const created = await prisma.workRequest.create({
    data: {
      farmerId,
      labourId: input.labourId,
      workType: input.workType,
      workDate: input.workDate,
      location: input.location,
      wage: input.wage,
      message: input.message,
    },
    select: WORK_REQUEST_SELECT,
  });

  // Notify the labour user they've received a new work request. Never
  // exposes wage/location/mobile — just enough to send the recipient to
  // the request itself.
  await notifySafely({
    recipientId: created.labourId,
    type: "WORK_REQUEST",
    title: "New Work Request",
    message: `${created.farmer.fullName} sent you a work request for ${created.workType}.`,
    relatedEntityType: "WORK_REQUEST",
    relatedEntityId: created.id,
  });

  return created;
}

/**
 * Lists work requests the calling farmer has sent, most recent first.
 */
export async function listSentWorkRequests(
  farmerId: string,
  query: ListWorkRequestsQuery
): Promise<PaginatedResult<WorkRequestResult>> {
  const { status, page, limit } = query;
  const where: Prisma.WorkRequestWhereInput = {
    farmerId,
    ...(status ? { status } : {}),
  };

  return paginateWorkRequests(where, page, limit);
}

/**
 * Lists work requests the calling labour user has received, most recent
 * first.
 */
export async function listReceivedWorkRequests(
  labourId: string,
  query: ListWorkRequestsQuery
): Promise<PaginatedResult<WorkRequestResult>> {
  const { status, page, limit } = query;
  const where: Prisma.WorkRequestWhereInput = {
    labourId,
    ...(status ? { status } : {}),
  };

  return paginateWorkRequests(where, page, limit);
}

async function paginateWorkRequests(
  where: Prisma.WorkRequestWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<WorkRequestResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.workRequest.findMany({
      where,
      select: WORK_REQUEST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.workRequest.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Fetches a single work request the caller is party to, as either the
 * farmer who sent it or the labour user who received it. 404s (rather
 * than 403) if it belongs to neither side, so this endpoint can't be used
 * to probe which request ids exist.
 */
export async function getOwnWorkRequestById(
  userId: string,
  role: Role,
  id: string
): Promise<WorkRequestResult> {
  const where: Prisma.WorkRequestWhereInput =
    role === Role.FARMER ? { id, farmerId: userId } : { id, labourId: userId };

  const request = await prisma.workRequest.findFirst({
    where,
    select: WORK_REQUEST_SELECT,
  });

  if (!request) {
    throw new AppError(REQUEST_NOT_FOUND_MESSAGE, 404);
  }

  return request;
}

/**
 * Cancels one of the calling farmer's own requests. Allowed from PENDING
 * or ACCEPTED (a farmer may need to call off work that was already
 * accepted); 409 if it's already REJECTED or CANCELLED, since those are
 * terminal states this action can't move on from.
 *
 * Step 44 — an ACCEPTED request whose workDate has already passed is no
 * longer cancellable: payment can only ever be initiated once a request
 * is ACCEPTED (see workRequestPayment.service.ts), and once the scheduled
 * date has passed the labour has plausibly already done the work, so
 * cancelling at that point would only serve to manufacture refund
 * eligibility (cashfreePayment.service.ts's initiateRefund gates purely
 * on status === CANCELLED) for work that was actually completed. Mirrors
 * the exact same "workDate > now" signal rating.service.ts's
 * resolveRateableEngagement already uses to decide whether an ACCEPTED
 * request counts as done. PENDING has no date restriction — nothing has
 * been accepted or paid for yet, so withdrawing a stale, unanswered
 * request is always safe.
 */
export async function cancelWorkRequest(
  farmerId: string,
  id: string
): Promise<WorkRequestResult> {
  const existing = await prisma.workRequest.findFirst({
    where: { id, farmerId },
    select: { id: true, status: true, workDate: true },
  });

  if (!existing) {
    throw new AppError(REQUEST_NOT_FOUND_MESSAGE, 404);
  }

  if (
    existing.status !== WorkRequestStatus.PENDING &&
    existing.status !== WorkRequestStatus.ACCEPTED
  ) {
    throw new AppError(NOT_CANCELLABLE_MESSAGE, 409);
  }

  if (existing.status === WorkRequestStatus.ACCEPTED && existing.workDate <= new Date()) {
    throw new AppError(ALREADY_OCCURRED_MESSAGE, 409);
  }

  return prisma.workRequest.update({
    where: { id },
    data: { status: WorkRequestStatus.CANCELLED, cancelledAt: new Date() },
    select: WORK_REQUEST_SELECT,
  });
}

/**
 * The calling labour user's response (accept/reject) to one of their own
 * received requests. Only valid from PENDING — 409 otherwise, since a
 * request can only be responded to once.
 */
export async function respondToWorkRequest(
  labourId: string,
  id: string,
  input: RespondWorkRequestInput
): Promise<WorkRequestResult> {
  const existing = await prisma.workRequest.findFirst({
    where: { id, labourId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(REQUEST_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status !== WorkRequestStatus.PENDING) {
    throw new AppError(NOT_RESPONDABLE_MESSAGE, 409);
  }

  const nextStatus =
    input.action === "ACCEPT" ? WorkRequestStatus.ACCEPTED : WorkRequestStatus.REJECTED;

  const updated = await prisma.workRequest.update({
    where: { id },
    data: { status: nextStatus, respondedAt: new Date() },
    select: WORK_REQUEST_SELECT,
  });

  // Notify the farmer of the labour user's response.
  await notifySafely({
    recipientId: updated.farmerId,
    type: "WORK_REQUEST",
    title: input.action === "ACCEPT" ? "Work Request Accepted" : "Work Request Rejected",
    message:
      input.action === "ACCEPT"
        ? `${updated.labour.fullName} accepted your work request.`
        : `${updated.labour.fullName} rejected your work request.`,
    relatedEntityType: "WORK_REQUEST",
    relatedEntityId: updated.id,
  });

  return updated;
}
