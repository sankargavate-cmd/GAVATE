import { Prisma, Role, TractorBookingStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { notifySafely } from "./notification.service";
import { assertTractorOwnerVerified } from "./tractorVerification.service";
import {
  CreateTractorBookingInput,
  ListTractorBookingsQuery,
  RespondTractorBookingInput,
} from "../validators/tractorBooking.validator";

const TRACTOR_NOT_FOUND_MESSAGE = "Tractor owner not found or is not currently available";
const BOOKING_NOT_FOUND_MESSAGE = "Tractor booking not found";
const NOT_CANCELLABLE_MESSAGE =
  "Only pending or accepted tractor bookings can be cancelled";
const ALREADY_OCCURRED_MESSAGE =
  "This tractor booking's scheduled date has already passed and can no longer be cancelled";
const NOT_RESPONDABLE_MESSAGE = "Only pending tractor bookings can be responded to";

// Shared shape for every response this module sends — enough of each side
// (farmer/tractor owner) for the other party to know who they're dealing
// with, mirrors WORK_REQUEST_SELECT in workRequest.service.ts.
const TRACTOR_BOOKING_SELECT = {
  id: true,
  farmerId: true,
  tractorOwnerId: true,
  workType: true,
  bookingDate: true,
  location: true,
  rateType: true,
  rate: true,
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
  tractorOwner: {
    select: {
      id: true,
      fullName: true,
      tractorProfile: {
        select: {
          mobile: true,
          tractorType: true,
          model: true,
          ratePerHour: true,
          ratePerDay: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
        },
      },
    },
  },
} satisfies Prisma.TractorBookingSelect;

export type TractorBookingResult = Prisma.TractorBookingGetPayload<{
  select: typeof TRACTOR_BOOKING_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a tractor booking from the calling farmer to a specific tractor
 * owner. The target must exist, be a TRACTOR_OWNER-role user, and have an
 * admin-verified TractorProfile — the same visibility rule the
 * farmer-facing search/getById endpoints already enforce
 * (tractor.service.ts), so a farmer can only ever book a tractor owner
 * they could actually find through search.
 */
export async function createTractorBooking(
  farmerId: string,
  input: CreateTractorBookingInput
): Promise<TractorBookingResult> {
  const tractorOwnerUser = await prisma.user.findUnique({
    where: { id: input.tractorOwnerId },
    select: { id: true, role: true, tractorProfile: { select: { isVerified: true } } },
  });

  if (
    !tractorOwnerUser ||
    tractorOwnerUser.role !== Role.TRACTOR_OWNER ||
    !tractorOwnerUser.tractorProfile?.isVerified
  ) {
    throw new AppError(TRACTOR_NOT_FOUND_MESSAGE, 404);
  }

  // KYC verification gate (Step 29) — beyond the admin-approved profile
  // check above, the tractor owner must also have every required KYC
  // document APPROVED before a farmer can book them, so an unverified
  // provider cannot provide the service. Checked last (after existence/
  // profile checks) so a farmer targeting a nonexistent or unverified-
  // profile owner still gets that more specific 404 first.
  await assertTractorOwnerVerified(input.tractorOwnerId);

  const created = await prisma.tractorBooking.create({
    data: {
      farmerId,
      tractorOwnerId: input.tractorOwnerId,
      workType: input.workType,
      bookingDate: input.bookingDate,
      location: input.location,
      rateType: input.rateType,
      rate: input.rate,
      message: input.message,
    },
    select: TRACTOR_BOOKING_SELECT,
  });

  // Notify the tractor owner of the new booking request. Never exposes
  // rate/location/mobile — just enough to send the recipient to the
  // booking itself.
  await notifySafely({
    recipientId: created.tractorOwnerId,
    type: "TRACTOR_BOOKING",
    title: "New Tractor Booking Request",
    message: `${created.farmer.fullName} sent you a tractor booking request for ${created.workType}.`,
    relatedEntityType: "TRACTOR_BOOKING",
    relatedEntityId: created.id,
  });

  return created;
}

/**
 * Lists tractor bookings the calling farmer has sent, most recent first.
 */
export async function listSentTractorBookings(
  farmerId: string,
  query: ListTractorBookingsQuery
): Promise<PaginatedResult<TractorBookingResult>> {
  const { status, page, limit } = query;
  const where: Prisma.TractorBookingWhereInput = {
    farmerId,
    ...(status ? { status } : {}),
  };

  return paginateTractorBookings(where, page, limit);
}

/**
 * Lists tractor bookings the calling tractor owner has received, most
 * recent first.
 */
export async function listReceivedTractorBookings(
  tractorOwnerId: string,
  query: ListTractorBookingsQuery
): Promise<PaginatedResult<TractorBookingResult>> {
  const { status, page, limit } = query;
  const where: Prisma.TractorBookingWhereInput = {
    tractorOwnerId,
    ...(status ? { status } : {}),
  };

  return paginateTractorBookings(where, page, limit);
}

async function paginateTractorBookings(
  where: Prisma.TractorBookingWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<TractorBookingResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.tractorBooking.findMany({
      where,
      select: TRACTOR_BOOKING_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tractorBooking.count({ where }),
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
 * Fetches a single tractor booking the caller is party to, as either the
 * farmer who sent it or the tractor owner who received it. 404s (rather
 * than 403) if it belongs to neither side, so this endpoint can't be used
 * to probe which booking ids exist.
 */
export async function getOwnTractorBookingById(
  userId: string,
  role: Role,
  id: string
): Promise<TractorBookingResult> {
  const where: Prisma.TractorBookingWhereInput =
    role === Role.FARMER ? { id, farmerId: userId } : { id, tractorOwnerId: userId };

  const booking = await prisma.tractorBooking.findFirst({
    where,
    select: TRACTOR_BOOKING_SELECT,
  });

  if (!booking) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  return booking;
}

/**
 * Cancels one of the calling farmer's own bookings. Allowed from PENDING
 * or ACCEPTED (a farmer may need to call off a tractor that was already
 * accepted); 409 if it's already REJECTED or CANCELLED, since those are
 * terminal states this action can't move on from.
 *
 * Step 44 — an ACCEPTED booking whose bookingDate has already passed is
 * no longer cancellable: payment can only ever be initiated once a
 * booking is ACCEPTED (see tractorBookingPayment.service.ts), and once
 * the scheduled date has passed the tractor owner has plausibly already
 * done the work, so cancelling at that point would only serve to
 * manufacture refund eligibility (cashfreePayment.service.ts's
 * initiateRefund gates purely on status === CANCELLED) for work that was
 * actually completed. Mirrors the exact same "bookingDate > now" signal
 * rating.service.ts's resolveRateableEngagement already uses to decide
 * whether an ACCEPTED booking counts as done. PENDING has no date
 * restriction — nothing has been accepted or paid for yet, so
 * withdrawing a stale, unanswered booking is always safe.
 */
export async function cancelTractorBooking(
  farmerId: string,
  id: string
): Promise<TractorBookingResult> {
  const existing = await prisma.tractorBooking.findFirst({
    where: { id, farmerId },
    select: { id: true, status: true, bookingDate: true },
  });

  if (!existing) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  if (
    existing.status !== TractorBookingStatus.PENDING &&
    existing.status !== TractorBookingStatus.ACCEPTED
  ) {
    throw new AppError(NOT_CANCELLABLE_MESSAGE, 409);
  }

  if (existing.status === TractorBookingStatus.ACCEPTED && existing.bookingDate <= new Date()) {
    throw new AppError(ALREADY_OCCURRED_MESSAGE, 409);
  }

  return prisma.tractorBooking.update({
    where: { id },
    data: { status: TractorBookingStatus.CANCELLED, cancelledAt: new Date() },
    select: TRACTOR_BOOKING_SELECT,
  });
}

/**
 * The calling tractor owner's response (accept/reject) to one of their
 * own received bookings. Only valid from PENDING — 409 otherwise, since a
 * booking can only be responded to once.
 */
export async function respondToTractorBooking(
  tractorOwnerId: string,
  id: string,
  input: RespondTractorBookingInput
): Promise<TractorBookingResult> {
  const existing = await prisma.tractorBooking.findFirst({
    where: { id, tractorOwnerId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status !== TractorBookingStatus.PENDING) {
    throw new AppError(NOT_RESPONDABLE_MESSAGE, 409);
  }

  // KYC verification gate (Step 29) — only checked on ACCEPT, since
  // rejecting a booking doesn't provide any service. Guards against a
  // tractor owner's verification lapsing (e.g. a previously-approved
  // document later reset) between when a booking was sent and when they
  // respond to it.
  if (input.action === "ACCEPT") {
    await assertTractorOwnerVerified(tractorOwnerId);
  }

  const nextStatus =
    input.action === "ACCEPT"
      ? TractorBookingStatus.ACCEPTED
      : TractorBookingStatus.REJECTED;

  const updated = await prisma.tractorBooking.update({
    where: { id },
    data: { status: nextStatus, respondedAt: new Date() },
    select: TRACTOR_BOOKING_SELECT,
  });

  // Notify the farmer of the tractor owner's response.
  await notifySafely({
    recipientId: updated.farmerId,
    type: "TRACTOR_BOOKING",
    title: input.action === "ACCEPT" ? "Tractor Booking Accepted" : "Tractor Booking Rejected",
    message:
      input.action === "ACCEPT"
        ? `${updated.tractorOwner.fullName} accepted your tractor booking request.`
        : `${updated.tractorOwner.fullName} rejected your tractor booking request.`,
    relatedEntityType: "TRACTOR_BOOKING",
    relatedEntityId: updated.id,
  });

  return updated;
}
