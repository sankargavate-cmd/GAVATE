import { OfferStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { assertBuyerVerified } from "./buyerVerification.service";
import { notifySafely } from "./notification.service";
import { createOrderFromAcceptedOffer } from "./order.service";
import {
  CreateProduceOfferInput,
  ListProduceOffersQuery,
  RespondProduceOfferInput,
} from "../validators/produceOffer.validator";

const LISTING_NOT_FOUND_MESSAGE =
  "Produce listing not found or is no longer available";
const OFFER_NOT_FOUND_MESSAGE = "Produce offer not found";
const NOT_WITHDRAWABLE_MESSAGE = "Only pending produce offers can be withdrawn";
const NOT_RESPONDABLE_MESSAGE = "Only pending produce offers can be responded to";
const QUANTITY_EXCEEDS_MESSAGE =
  "Offer quantity cannot exceed the listing's available quantity";

// Shared shape for every response this module sends — enough of each side
// (buyer/farmer) for the other party to know who they're dealing with,
// plus the listing the offer was made against. Mirrors
// TRANSPORT_BOOKING_SELECT in transportBooking.service.ts.
const PRODUCE_OFFER_SELECT = {
  id: true,
  listingId: true,
  buyerId: true,
  farmerId: true,
  offerPrice: true,
  quantity: true,
  message: true,
  status: true,
  respondedAt: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      crop: true,
      quantity: true,
      unit: true,
      price: true,
      location: true,
      isActive: true,
    },
  },
  // BUYER-role users have no profile model in this schema (unlike Farmer/
  // Labour/Tractor/Transport), so fullName + email is all there is to show
  // on the farmer-facing side of an offer.
  buyer: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
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
} satisfies Prisma.ProduceOfferSelect;

export type ProduceOfferResult = Prisma.ProduceOfferGetPayload<{
  select: typeof PRODUCE_OFFER_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Same visibility rule the buyer-facing search/getById endpoints already
// enforce (produce.service.ts) — a buyer can only ever offer on a listing
// they could actually find through search. Centralized here so it can't
// drift from produce.service.ts's own copy.
const VERIFIED_AND_ACTIVE_WHERE: Prisma.ProduceListingWhereInput = {
  isActive: true,
  farmer: { farmerProfile: { isVerified: true } },
};

/**
 * Creates an offer from the calling buyer on a specific produce listing.
 * The listing must currently be visible to buyers (admin-verified farmer
 * + active), and the offered quantity cannot exceed what the listing
 * currently has available.
 */
export async function createProduceOffer(
  buyerId: string,
  input: CreateProduceOfferInput
): Promise<ProduceOfferResult> {
  // Buyer-verification gate (Step 28) — a buyer must have all required
  // KYC documents APPROVED before they can send an offer, the entry
  // point into this app's buy-side marketplace flow. Checked before the
  // listing lookup so an unverified buyer gets one clear reason for the
  // rejection rather than a listing-not-found red herring if they also
  // guessed a bad listingId.
  await assertBuyerVerified(buyerId);

  const listing = await prisma.produceListing.findFirst({
    where: { id: input.listingId, ...VERIFIED_AND_ACTIVE_WHERE },
    select: { id: true, farmerId: true, quantity: true },
  });

  if (!listing) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  if (input.quantity > listing.quantity) {
    throw new AppError(QUANTITY_EXCEEDS_MESSAGE, 400);
  }

  const created = await prisma.produceOffer.create({
    data: {
      listingId: listing.id,
      buyerId,
      farmerId: listing.farmerId,
      offerPrice: input.offerPrice,
      quantity: input.quantity,
      message: input.message,
    },
    select: PRODUCE_OFFER_SELECT,
  });

  // Notify the farmer of the new buyer offer. Never exposes offerPrice/
  // quantity/buyer contact info — just enough to send the recipient to
  // the offer itself.
  await notifySafely({
    recipientId: created.farmerId,
    type: "PRODUCE_OFFER",
    title: "New Produce Offer",
    message: `${created.buyer.fullName} made an offer on your ${created.listing.crop} listing.`,
    relatedEntityType: "PRODUCE_OFFER",
    relatedEntityId: created.id,
  });

  return created;
}

/**
 * Lists offers the calling buyer has sent, most recent first.
 */
export async function listSentProduceOffers(
  buyerId: string,
  query: ListProduceOffersQuery
): Promise<PaginatedResult<ProduceOfferResult>> {
  const { status, listingId, page, limit } = query;
  const where: Prisma.ProduceOfferWhereInput = {
    buyerId,
    ...(status ? { status } : {}),
    ...(listingId ? { listingId } : {}),
  };

  return paginateProduceOffers(where, page, limit);
}

/**
 * Lists offers the calling farmer has received across all of their
 * listings (or, when listingId is supplied, just that one), most recent
 * first.
 */
export async function listReceivedProduceOffers(
  farmerId: string,
  query: ListProduceOffersQuery
): Promise<PaginatedResult<ProduceOfferResult>> {
  const { status, listingId, page, limit } = query;
  const where: Prisma.ProduceOfferWhereInput = {
    farmerId,
    ...(status ? { status } : {}),
    ...(listingId ? { listingId } : {}),
  };

  return paginateProduceOffers(where, page, limit);
}

async function paginateProduceOffers(
  where: Prisma.ProduceOfferWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<ProduceOfferResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.produceOffer.findMany({
      where,
      select: PRODUCE_OFFER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.produceOffer.count({ where }),
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
 * Fetches a single offer the caller is party to, as either the buyer who
 * made it or the farmer who received it. 404s (rather than 403) if it
 * belongs to neither side, so this endpoint can't be used to probe which
 * offer ids exist.
 */
export async function getOwnProduceOfferById(
  userId: string,
  role: Role,
  id: string
): Promise<ProduceOfferResult> {
  const where: Prisma.ProduceOfferWhereInput =
    role === Role.BUYER ? { id, buyerId: userId } : { id, farmerId: userId };

  const offer = await prisma.produceOffer.findFirst({
    where,
    select: PRODUCE_OFFER_SELECT,
  });

  if (!offer) {
    throw new AppError(OFFER_NOT_FOUND_MESSAGE, 404);
  }

  return offer;
}

/**
 * Withdraws one of the calling buyer's own offers. Only valid from
 * PENDING — 409 otherwise, since an already-answered or already-withdrawn
 * offer is a terminal (or farmer-decided) state this action can't move on
 * from.
 */
export async function withdrawProduceOffer(
  buyerId: string,
  id: string
): Promise<ProduceOfferResult> {
  const existing = await prisma.produceOffer.findFirst({
    where: { id, buyerId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(OFFER_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status !== OfferStatus.PENDING) {
    throw new AppError(NOT_WITHDRAWABLE_MESSAGE, 409);
  }

  return prisma.produceOffer.update({
    where: { id },
    data: { status: OfferStatus.WITHDRAWN, withdrawnAt: new Date() },
    select: PRODUCE_OFFER_SELECT,
  });
}

/**
 * The calling farmer's response (accept/reject) to one of their own
 * received offers. Only valid from PENDING — 409 otherwise, since an
 * offer can only be responded to once.
 *
 * ACCEPT additionally creates the resulting Order (Step 23), atomically
 * with the offer's own status update — see order.service.ts's
 * createOrderFromAcceptedOffer. A farmer's REJECT never creates one.
 */
export async function respondToProduceOffer(
  farmerId: string,
  id: string,
  input: RespondProduceOfferInput
): Promise<ProduceOfferResult> {
  const existing = await prisma.produceOffer.findFirst({
    where: { id, farmerId },
    select: {
      id: true,
      status: true,
      listingId: true,
      buyerId: true,
      farmerId: true,
      offerPrice: true,
      quantity: true,
    },
  });

  if (!existing) {
    throw new AppError(OFFER_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status !== OfferStatus.PENDING) {
    throw new AppError(NOT_RESPONDABLE_MESSAGE, 409);
  }

  if (input.action === "REJECT") {
    const updated = await prisma.produceOffer.update({
      where: { id },
      data: { status: OfferStatus.REJECTED, respondedAt: new Date() },
      select: PRODUCE_OFFER_SELECT,
    });

    // Notify the buyer their offer was rejected.
    await notifySafely({
      recipientId: updated.buyerId,
      type: "PRODUCE_OFFER",
      title: "Offer Rejected",
      message: `Your offer on ${updated.listing.crop} was rejected by the farmer.`,
      relatedEntityType: "PRODUCE_OFFER",
      relatedEntityId: updated.id,
    });

    return updated;
  }

  const updatedOffer = await prisma.$transaction(async (tx) => {
    const updated = await tx.produceOffer.update({
      where: { id },
      data: { status: OfferStatus.ACCEPTED, respondedAt: new Date() },
      select: PRODUCE_OFFER_SELECT,
    });

    await createOrderFromAcceptedOffer(tx, existing, farmerId);

    return updated;
  });

  // Notify the buyer their offer was accepted. Sent after the transaction
  // commits, so the notification never fires for an order that failed to
  // create.
  await notifySafely({
    recipientId: updatedOffer.buyerId,
    type: "PRODUCE_OFFER",
    title: "Offer Accepted",
    message: `Your offer on ${updatedOffer.listing.crop} was accepted by the farmer.`,
    relatedEntityType: "PRODUCE_OFFER",
    relatedEntityId: updatedOffer.id,
  });

  return updatedOffer;
}
