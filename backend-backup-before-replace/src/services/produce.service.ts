import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  CreateProduceListingInput,
  ListOwnProduceQuery,
  SearchProduceQuery,
  UpdateProduceListingInput,
} from "../validators/produce.validator";

const LISTING_NOT_FOUND_MESSAGE = "Produce listing not found";
const PUBLIC_LISTING_NOT_FOUND_MESSAGE =
  "Produce listing not found or is no longer available";

// Full shape — used for the farmer's own listings (create/get/update/delete).
const PRODUCE_LISTING_SELECT = {
  id: true,
  farmerId: true,
  crop: true,
  quantity: true,
  unit: true,
  price: true,
  location: true,
  description: true,
  photos: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProduceListingSelect;

export type ProduceListingResult = Prisma.ProduceListingGetPayload<{
  select: typeof PRODUCE_LISTING_SELECT;
}>;

// Buyer-facing shape — adds just enough of the owning farmer's identity
// and location to let a buyer decide whether to reach out, without
// exposing anything beyond what FarmerProfile already treats as
// discoverable (mirrors the farmer fields shown in labour search results).
const PUBLIC_PRODUCE_LISTING_SELECT = {
  id: true,
  crop: true,
  quantity: true,
  unit: true,
  price: true,
  location: true,
  description: true,
  photos: true,
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
} satisfies Prisma.ProduceListingSelect;

export type PublicProduceListingResult = Prisma.ProduceListingGetPayload<{
  select: typeof PUBLIC_PRODUCE_LISTING_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Every buyer-facing query (search + single listing) is scoped to both of
// these — a listing only becomes visible once the farmer who owns it has
// been admin-verified (Step 17), and only while the farmer has marked it
// active. Centralized here so search and getById can never drift apart.
const VERIFIED_AND_ACTIVE_WHERE: Prisma.ProduceListingWhereInput = {
  isActive: true,
  farmer: { farmerProfile: { isVerified: true } },
};

/**
 * Creates a produce listing owned by the given farmer. A farmer may have
 * any number of listings, so unlike FarmerProfile/LabourProfile this is
 * never a 409 "already exists" — every call creates a new row.
 */
export async function createProduceListing(
  farmerId: string,
  input: CreateProduceListingInput
): Promise<ProduceListingResult> {
  return prisma.produceListing.create({
    data: {
      farmerId,
      ...input,
    },
    select: PRODUCE_LISTING_SELECT,
  });
}

/**
 * Lists the calling farmer's own listings (active and inactive), most
 * recently updated first.
 */
export async function listOwnProduceListings(
  farmerId: string,
  query: ListOwnProduceQuery
): Promise<PaginatedResult<ProduceListingResult>> {
  const { page, limit } = query;
  const where: Prisma.ProduceListingWhereInput = { farmerId };

  const [items, total] = await prisma.$transaction([
    prisma.produceListing.findMany({
      where,
      select: PRODUCE_LISTING_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.produceListing.count({ where }),
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
 * Fetches one of the calling farmer's own listings by id. 404s (rather than
 * 403) if it belongs to someone else, so this endpoint can't be used to
 * probe which listing ids exist.
 */
export async function getOwnProduceListingById(
  farmerId: string,
  id: string
): Promise<ProduceListingResult> {
  const listing = await prisma.produceListing.findFirst({
    where: { id, farmerId },
    select: PRODUCE_LISTING_SELECT,
  });

  if (!listing) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return listing;
}

/**
 * Partially updates one of the calling farmer's own listings. 404 if it
 * doesn't exist or belongs to someone else.
 */
export async function updateProduceListing(
  farmerId: string,
  id: string,
  input: UpdateProduceListingInput
): Promise<ProduceListingResult> {
  const existing = await prisma.produceListing.findFirst({
    where: { id, farmerId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.produceListing.update({
    where: { id },
    data: input,
    select: PRODUCE_LISTING_SELECT,
  });
}

/**
 * Deletes one of the calling farmer's own listings. 404 if it doesn't
 * exist or belongs to someone else.
 */
export async function deleteProduceListing(farmerId: string, id: string): Promise<void> {
  const existing = await prisma.produceListing.findFirst({
    where: { id, farmerId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  await prisma.produceListing.delete({ where: { id } });
}

/**
 * Buyer-facing search. Always scoped to VERIFIED_AND_ACTIVE_WHERE — buyers
 * only ever see listings from admin-verified farmers that are currently
 * active, regardless of what filters they pass in. Mirrors
 * searchVerifiedLabour in labour.service.ts.
 */
export async function searchVerifiedProduceListings(
  query: SearchProduceQuery
): Promise<PaginatedResult<PublicProduceListingResult>> {
  const { crop, location, unit, minPrice, maxPrice, page, limit } = query;

  const where: Prisma.ProduceListingWhereInput = {
    ...VERIFIED_AND_ACTIVE_WHERE,
    ...(crop ? { crop: { contains: crop, mode: "insensitive" } } : {}),
    ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
    ...(unit ? { unit } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined
      ? {
          price: {
            ...(minPrice !== undefined ? { gte: minPrice } : {}),
            ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.produceListing.findMany({
      where,
      select: PUBLIC_PRODUCE_LISTING_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.produceListing.count({ where }),
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
 * Buyer-facing single-listing view, used for the "contact farmer" detail
 * screen. Scoped the same way as search — an inactive or unverified
 * listing 404s here too, so this endpoint can't be used to peek at
 * listings the search endpoint would otherwise hide.
 */
export async function getVerifiedProduceListingById(
  id: string
): Promise<PublicProduceListingResult> {
  const listing = await prisma.produceListing.findFirst({
    where: { id, ...VERIFIED_AND_ACTIVE_WHERE },
    select: PUBLIC_PRODUCE_LISTING_SELECT,
  });

  if (!listing) {
    throw new AppError(PUBLIC_LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return listing;
}
