import { Prisma, Role, TransportBookingStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { notifySafely } from "./notification.service";
import { assertTransportProviderVerified } from "./transportVerification.service";
import {
  CreateTransportBookingInput,
  ListTransportBookingsQuery,
  RespondTransportBookingInput,
} from "../validators/transportBooking.validator";

const TRANSPORT_PROVIDER_NOT_FOUND_MESSAGE =
  "Transport provider not found or is not currently available";
const BOOKING_NOT_FOUND_MESSAGE = "Transport booking not found";
const NOT_CANCELLABLE_MESSAGE =
  "Only pending or accepted transport bookings can be cancelled";
const ALREADY_OCCURRED_MESSAGE =
  "This transport booking's scheduled date has already passed and can no longer be cancelled";
const NOT_RESPONDABLE_MESSAGE = "Only pending transport bookings can be responded to";

// Shared shape for every response this module sends — enough of each side
// (farmer/transport provider) for the other party to know who they're
// dealing with, mirrors TRACTOR_BOOKING_SELECT in tractorBooking.service.ts.
const TRANSPORT_BOOKING_SELECT = {
  id: true,
  farmerId: true,
  transportProviderId: true,
  goodsType: true,
  pickupLocation: true,
  dropLocation: true,
  bookingDate: true,
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
  transportProvider: {
    select: {
      id: true,
      fullName: true,
      transportProfile: {
        select: {
          mobile: true,
          vehicleType: true,
          vehicleNumber: true,
          capacity: true,
          capacityUnit: true,
          ratePerKm: true,
          ratePerTrip: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
        },
      },
    },
  },
} satisfies Prisma.TransportBookingSelect;

export type TransportBookingResult = Prisma.TransportBookingGetPayload<{
  select: typeof TRANSPORT_BOOKING_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a transport booking from the calling farmer to a specific
 * transport provider. The target must exist, be a TRANSPORT_PROVIDER-role
 * user, and have an admin-verified TransportProfile — the same visibility
 * rule the farmer-facing search/getById endpoints already enforce
 * (transport.service.ts), so a farmer can only ever book a transport
 * provider they could actually find through search.
 */
export async function createTransportBooking(
  farmerId: string,
  input: CreateTransportBookingInput
): Promise<TransportBookingResult> {
  const transportProviderUser = await prisma.user.findUnique({
    where: { id: input.transportProviderId },
    select: { id: true, role: true, transportProfile: { select: { isVerified: true } } },
  });

  if (
    !transportProviderUser ||
    transportProviderUser.role !== Role.TRANSPORT_PROVIDER ||
    !transportProviderUser.transportProfile?.isVerified
  ) {
    throw new AppError(TRANSPORT_PROVIDER_NOT_FOUND_MESSAGE, 404);
  }

  // KYC verification gate (Step 29) — beyond the admin-approved profile
  // check above, the transport provider must also have every required
  // KYC document APPROVED before a farmer can book them, so an
  // unverified provider cannot provide the service. Checked last (after
  // existence/profile checks) so a farmer targeting a nonexistent or
  // unverified-profile provider still gets that more specific 404 first.
  await assertTransportProviderVerified(input.transportProviderId);

  const created = await prisma.transportBooking.create({
    data: {
      farmerId,
      transportProviderId: input.transportProviderId,
      goodsType: input.goodsType,
      pickupLocation: input.pickupLocation,
      dropLocation: input.dropLocation,
      bookingDate: input.bookingDate,
      rateType: input.rateType,
      rate: input.rate,
      message: input.message,
    },
    select: TRANSPORT_BOOKING_SELECT,
  });

  // Notify the transport provider of the new booking request. Never
  // exposes rate/locations/mobile — just enough to send the recipient to
  // the booking itself.
  await notifySafely({
    recipientId: created.transportProviderId,
    type: "TRANSPORT_BOOKING",
    title: "New Transport Booking Request",
    message: `${created.farmer.fullName} sent you a transport booking request for ${created.goodsType}.`,
    relatedEntityType: "TRANSPORT_BOOKING",
    relatedEntityId: created.id,
  });

  return created;
}

/**
 * Lists transport bookings the calling farmer has sent, most recent first.
 */
export async function listSentTransportBookings(
  farmerId: string,
  query: ListTransportBookingsQuery
): Promise<PaginatedResult<TransportBookingResult>> {
  const { status, page, limit } = query;
  const where: Prisma.TransportBookingWhereInput = {
    farmerId,
    ...(status ? { status } : {}),
  };

  return paginateTransportBookings(where, page, limit);
}

/**
 * Lists transport bookings the calling transport provider has received,
 * most recent first.
 */
export async function listReceivedTransportBookings(
  transportProviderId: string,
  query: ListTransportBookingsQuery
): Promise<PaginatedResult<TransportBookingResult>> {
  const { status, page, limit } = query;
  const where: Prisma.TransportBookingWhereInput = {
    transportProviderId,
    ...(status ? { status } : {}),
  };

  return paginateTransportBookings(where, page, limit);
}

async function paginateTransportBookings(
  where: Prisma.TransportBookingWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<TransportBookingResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.transportBooking.findMany({
      where,
      select: TRANSPORT_BOOKING_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transportBooking.count({ where }),
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
 * Fetches a single transport booking the caller is party to, as either the
 * farmer who sent it or the transport provider who received it. 404s
 * (rather than 403) if it belongs to neither side, so this endpoint can't
 * be used to probe which booking ids exist.
 */
export async function getOwnTransportBookingById(
  userId: string,
  role: Role,
  id: string
): Promise<TransportBookingResult> {
  const where: Prisma.TransportBookingWhereInput =
    role === Role.FARMER ? { id, farmerId: userId } : { id, transportProviderId: userId };

  const booking = await prisma.transportBooking.findFirst({
    where,
    select: TRANSPORT_BOOKING_SELECT,
  });

  if (!booking) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  return booking;
}

/**
 * Cancels one of the calling farmer's own bookings. Allowed from PENDING
 * or ACCEPTED (a farmer may need to call off transport that was already
 * accepted); 409 if it's already REJECTED or CANCELLED, since those are
 * terminal states this action can't move on from.
 *
 * Step 44 — an ACCEPTED booking whose bookingDate has already passed is
 * no longer cancellable: payment can only ever be initiated once a
 * booking is ACCEPTED (see transportBookingPayment.service.ts), and once
 * the scheduled date has passed the transport provider has plausibly
 * already done the work, so cancelling at that point would only serve to
 * manufacture refund eligibility (cashfreePayment.service.ts's
 * initiateRefund gates purely on status === CANCELLED) for work that was
 * actually completed. Mirrors the exact same "bookingDate > now" signal
 * rating.service.ts's resolveRateableEngagement already uses to decide
 * whether an ACCEPTED booking counts as done. PENDING has no date
 * restriction — nothing has been accepted or paid for yet, so
 * withdrawing a stale, unanswered booking is always safe.
 */
export async function cancelTransportBooking(
  farmerId: string,
  id: string
): Promise<TransportBookingResult> {
  const existing = await prisma.transportBooking.findFirst({
    where: { id, farmerId },
    select: { id: true, status: true, bookingDate: true },
  });

  if (!existing) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  if (
    existing.status !== TransportBookingStatus.PENDING &&
    existing.status !== TransportBookingStatus.ACCEPTED
  ) {
    throw new AppError(NOT_CANCELLABLE_MESSAGE, 409);
  }

  if (existing.status === TransportBookingStatus.ACCEPTED && existing.bookingDate <= new Date()) {
    throw new AppError(ALREADY_OCCURRED_MESSAGE, 409);
  }

  return prisma.transportBooking.update({
    where: { id },
    data: { status: TransportBookingStatus.CANCELLED, cancelledAt: new Date() },
    select: TRANSPORT_BOOKING_SELECT,
  });
}

/**
 * The calling transport provider's response (accept/reject) to one of
 * their own received bookings. Only valid from PENDING — 409 otherwise,
 * since a booking can only be responded to once.
 */
export async function respondToTransportBooking(
  transportProviderId: string,
  id: string,
  input: RespondTransportBookingInput
): Promise<TransportBookingResult> {
  const existing = await prisma.transportBooking.findFirst({
    where: { id, transportProviderId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(BOOKING_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status !== TransportBookingStatus.PENDING) {
    throw new AppError(NOT_RESPONDABLE_MESSAGE, 409);
  }

  // KYC verification gate (Step 29) — only checked on ACCEPT, since
  // rejecting a booking doesn't provide any service. Guards against a
  // transport provider's verification lapsing (e.g. a previously-approved
  // document later reset) between when a booking was sent and when they
  // respond to it.
  if (input.action === "ACCEPT") {
    await assertTransportProviderVerified(transportProviderId);
  }

  const nextStatus =
    input.action === "ACCEPT"
      ? TransportBookingStatus.ACCEPTED
      : TransportBookingStatus.REJECTED;

  const updated = await prisma.transportBooking.update({
    where: { id },
    data: { status: nextStatus, respondedAt: new Date() },
    select: TRANSPORT_BOOKING_SELECT,
  });

  // Notify the farmer of the transport provider's response.
  await notifySafely({
    recipientId: updated.farmerId,
    type: "TRANSPORT_BOOKING",
    title: input.action === "ACCEPT" ? "Transport Booking Accepted" : "Transport Booking Rejected",
    message:
      input.action === "ACCEPT"
        ? `${updated.transportProvider.fullName} accepted your transport booking request.`
        : `${updated.transportProvider.fullName} rejected your transport booking request.`,
    relatedEntityType: "TRANSPORT_BOOKING",
    relatedEntityId: updated.id,
  });

  return updated;
}
