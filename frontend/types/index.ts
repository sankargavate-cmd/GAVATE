// Shared frontend types go here as features are built.

/** Mirrors the backend's FARMER_PROFILE_SELECT shape (farmer.service.ts). */
export interface FarmerProfile {
  id: string;
  userId: string;
  profilePhoto: string | null;
  mobile: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  farmingExperience: number;
  // Admin-verification outcome (Step 17) — read-only, set only via the
  // admin verification workflow. Mirrors LabourProfile.isVerified.
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a farmer profile, as sent on create (POST) and
 * update (PUT). Matches createFarmerProfileSchema on the backend. */
export interface FarmerProfileFormInput {
  profilePhoto?: string;
  mobile: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude?: number;
  longitude?: number;
  farmingExperience: number;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type FarmerProfileFieldErrors = Partial<
  Record<keyof FarmerProfileFormInput, string[]>
>;

/** Mirrors the backend's Role enum (backend/prisma/schema.prisma). */
export type Role =
  | "FARMER"
  | "LABOUR"
  | "TRACTOR_OWNER"
  | "MACHINERY_PROVIDER"
  | "BUYER"
  | "TRANSPORT_PROVIDER"
  | "ADMIN"
  | "SUPER_ADMIN";

/** Mirrors the backend's SAFE_USER_SELECT shape (auth.service.ts) —
 * passwordHash is never included. */
export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  preferredLanguage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors the backend's LoginResult (auth.service.ts). */
export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

/** Matches signupSchema on the backend. */
export interface SignupFormInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  preferredLanguage: string;
}

/** Matches loginSchema on the backend. */
export interface LoginFormInput {
  email: string;
  password: string;
}

export type SignupFieldErrors = Partial<Record<keyof SignupFormInput, string[]>>;
export type LoginFieldErrors = Partial<Record<keyof LoginFormInput, string[]>>;

/** Mirrors the backend's LABOUR_PROFILE_SELECT shape (labour.service.ts). */
export interface LabourProfile {
  id: string;
  userId: string;
  profilePhoto: string | null;
  mobile: string;
  skills: string[];
  experienceYears: number | null;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  dailyWage: number;
  isAvailable: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a labour profile, as sent on create (POST) and
 * update (PUT). Matches createLabourProfileSchema on the backend.
 * isVerified is deliberately absent — only an admin workflow sets it. */
export interface LabourProfileFormInput {
  profilePhoto?: string;
  mobile: string;
  skills: string[];
  experienceYears?: number;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude?: number;
  longitude?: number;
  dailyWage: number;
  isAvailable?: boolean;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type LabourProfileFieldErrors = Partial<
  Record<keyof LabourProfileFormInput, string[]>
>;

/** Matches searchLabourQuerySchema on the backend — all optional, sent as
 * query string params. */
export interface LabourSearchFilters {
  skills?: string[];
  state?: string;
  district?: string;
  minWage?: number;
  maxWage?: number;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /labour/search. */
export interface LabourSearchResult {
  items: LabourProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Admin Labour Verification (Step 14) ---

/** Mirrors the backend's VerificationStatus enum (backend/prisma/schema.prisma). */
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

/** The owning user's public info, as nested by the backend's
 * ADMIN_LABOUR_PROFILE_SELECT (adminLabour.service.ts). */
export interface AdminLabourProfileUser {
  id: string;
  fullName: string;
  email: string;
}

/** Mirrors the backend's ADMIN_LABOUR_PROFILE_SELECT shape
 * (adminLabour.service.ts) — the admin-facing view of a labour profile,
 * with verification metadata and the owner's name/email attached. */
export interface AdminLabourProfile {
  id: string;
  userId: string;
  profilePhoto: string | null;
  mobile: string;
  skills: string[];
  experienceYears: number | null;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  dailyWage: number;
  isAvailable: boolean;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  verifiedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  user: AdminLabourProfileUser;
}

/** Mirrors the paginated envelope returned by GET /admin/labour/pending. */
export interface AdminLabourPendingResult {
  items: AdminLabourProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Super Admin: Admin Management (Step 16) ---

/** Mirrors the backend's ADMIN_PERMISSIONS allow-list
 * (backend/src/constants/adminPermissions.ts). Kept in sync by hand since
 * there is no GET endpoint exposing this list; extend both together. */
export const ADMIN_PERMISSIONS = [
  "LABOUR_VERIFICATION_VIEW",
  "LABOUR_VERIFICATION_APPROVE",
  "LABOUR_VERIFICATION_REJECT",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Human-readable labels for each grantable permission, for checkbox UI. */
export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  LABOUR_VERIFICATION_VIEW: "View labour verification queue",
  LABOUR_VERIFICATION_APPROVE: "Approve labour profiles",
  LABOUR_VERIFICATION_REJECT: "Reject labour profiles",
};

/** Mirrors the backend's AdminProfile model, as nested by
 * ADMIN_WITH_PROFILE_SELECT (adminManagement.service.ts). */
export interface AdminProfile {
  id: string;
  permissions: AdminPermission[];
  mustChangePassword: boolean;
  createdByAdminId: string | null;
  removedAt: string | null;
  removedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors the backend's ADMIN_WITH_PROFILE_SELECT shape
 * (adminManagement.service.ts) — an ADMIN-role user plus its nested
 * AdminProfile. passwordHash is never included. */
export interface AdminWithProfile {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  preferredLanguage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  adminProfile: AdminProfile | null;
}

/** Status filter accepted by GET /super-admin/admins (listAdminsQuerySchema). */
export type AdminStatusFilter = "all" | "active" | "deactivated" | "removed";

/** Matches createAdminSchema on the backend
 * (adminManagement.validator.ts). */
export interface CreateAdminFormInput {
  fullName: string;
  email: string;
  password: string;
  preferredLanguage: string;
  permissions: AdminPermission[];
}

export type CreateAdminFieldErrors = Partial<
  Record<keyof CreateAdminFormInput, string[]>
>;

/** Matches resetAdminPasswordSchema on the backend — newPassword is
 * optional; omitting it makes the backend generate one and return it once. */
export interface ResetAdminPasswordFormInput {
  newPassword?: string;
}

/** Mirrors the data shape returned by PATCH
 * /super-admin/admins/:id/reset-password (adminManagement.controller.ts). */
export interface ResetAdminPasswordResult {
  admin: AdminWithProfile;
  temporaryPassword: string;
}

/** Mirrors the paginated envelope returned by GET /super-admin/admins. */
export interface AdminListResult {
  items: AdminWithProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Admin Farmer Verification (Step 17) ---

/** The owning user's public info, as nested by the backend's
 * ADMIN_FARMER_PROFILE_SELECT (adminFarmer.service.ts). Mirrors
 * AdminLabourProfileUser. */
export interface AdminFarmerProfileUser {
  id: string;
  fullName: string;
  email: string;
}

/** Mirrors the backend's ADMIN_FARMER_PROFILE_SELECT shape
 * (adminFarmer.service.ts) — the admin-facing view of a farmer profile,
 * with verification metadata and the owner's name/email attached. Mirrors
 * AdminLabourProfile. */
export interface AdminFarmerProfile {
  id: string;
  userId: string;
  profilePhoto: string | null;
  mobile: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  farmingExperience: number;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
  verifiedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  user: AdminFarmerProfileUser;
}

/** Mirrors the paginated envelope returned by GET /admin/farmers/pending. */
export interface AdminFarmerPendingResult {
  items: AdminFarmerProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Produce Marketplace (Step 18) ---

/** Mirrors the backend's ProduceUnit enum (backend/prisma/schema.prisma). */
export type ProduceUnit = "KG" | "QUINTAL" | "TON" | "DOZEN" | "LITRE" | "PIECE";

export const PRODUCE_UNITS: ProduceUnit[] = [
  "KG",
  "QUINTAL",
  "TON",
  "DOZEN",
  "LITRE",
  "PIECE",
];

/** Human-readable labels for each unit, for select/option UI. */
export const PRODUCE_UNIT_LABELS: Record<ProduceUnit, string> = {
  KG: "Kilogram (kg)",
  QUINTAL: "Quintal",
  TON: "Ton",
  DOZEN: "Dozen",
  LITRE: "Litre",
  PIECE: "Piece",
};

/** Mirrors the backend's PRODUCE_LISTING_SELECT shape (produce.service.ts)
 * — the farmer's own view of a listing (full detail, no farmer info
 * needed since the caller already knows it's their own). */
export interface ProduceListing {
  id: string;
  farmerId: string;
  crop: string;
  quantity: number;
  unit: ProduceUnit;
  price: number;
  location: string;
  description: string | null;
  photos: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a produce listing, as sent on create (POST) and
 * update (PUT). Matches createProduceListingSchema on the backend. */
export interface ProduceListingFormInput {
  crop: string;
  quantity: number;
  unit: ProduceUnit;
  price: number;
  location: string;
  description?: string;
  photos?: string[];
  isActive?: boolean;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type ProduceListingFieldErrors = Partial<
  Record<keyof ProduceListingFormInput, string[]>
>;

/** Mirrors the paginated envelope returned by GET /produce/listings. */
export interface ProduceListingsResult {
  items: ProduceListing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** The owning farmer's public info, as nested by the backend's
 * PUBLIC_PRODUCE_LISTING_SELECT (produce.service.ts) — just enough for a
 * buyer to decide whether to reach out. */
export interface PublicProduceListingFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's PUBLIC_PRODUCE_LISTING_SELECT shape
 * (produce.service.ts) — the buyer-facing view of a verified, active
 * listing, with the owning farmer's contact info attached. */
export interface PublicProduceListing {
  id: string;
  crop: string;
  quantity: number;
  unit: ProduceUnit;
  price: number;
  location: string;
  description: string | null;
  photos: string[];
  createdAt: string;
  updatedAt: string;
  farmer: PublicProduceListingFarmer;
}

/** Matches searchProduceQuerySchema on the backend — all optional, sent as
 * query string params. */
export interface ProduceSearchFilters {
  crop?: string;
  location?: string;
  unit?: ProduceUnit;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /produce/search. */
export interface ProduceSearchResult {
  items: PublicProduceListing[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Labour Hiring (Step 19) ---

/** Mirrors the backend's WorkRequestStatus enum (backend/prisma/schema.prisma). */
export type WorkRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

/** Matches createWorkRequestSchema on the backend
 * (workRequest.validator.ts). workDate is sent as an ISO date string. */
export interface WorkRequestFormInput {
  labourId: string;
  workType: string;
  workDate: string;
  location: string;
  wage: number;
  message?: string;
}

export type WorkRequestFieldErrors = Partial<
  Record<keyof WorkRequestFormInput, string[]>
>;

/** The farmer side of a work request, as nested by the backend's
 * WORK_REQUEST_SELECT (workRequest.service.ts). */
export interface WorkRequestFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** The labour side of a work request, as nested by the backend's
 * WORK_REQUEST_SELECT (workRequest.service.ts). */
export interface WorkRequestLabour {
  id: string;
  fullName: string;
  labourProfile: {
    mobile: string;
    skills: string[];
    dailyWage: number;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's WORK_REQUEST_SELECT shape (workRequest.service.ts)
 * — returned to both the farmer who sent it and the labour user who
 * received it. */
export interface WorkRequest {
  id: string;
  farmerId: string;
  labourId: string;
  workType: string;
  workDate: string;
  location: string;
  wage: number;
  message: string | null;
  status: WorkRequestStatus;
  respondedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  farmer: WorkRequestFarmer;
  labour: WorkRequestLabour;
}

/** Matches listWorkRequestsQuerySchema on the backend — all optional,
 * sent as query string params. */
export interface WorkRequestListFilters {
  status?: WorkRequestStatus;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /work-requests. */
export interface WorkRequestListResult {
  items: WorkRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Tractor Hiring (Step 20) ---

/** Common tractor types for the create/edit form's suggestions — the
 * backend field (tractorType) is free text (mirrors LabourProfile.skills
 * being free text), so this is UI convenience only, not an enum. */
export const TRACTOR_TYPES = [
  "Mini Tractor",
  "2WD",
  "4WD",
  "Utility Tractor",
  "Orchard Tractor",
  "Row Crop Tractor",
  "Garden Tractor",
  "Rotavator-fitted",
] as const;

/** Mirrors the backend's TRACTOR_PROFILE_SELECT shape (tractor.service.ts). */
export interface TractorProfile {
  id: string;
  userId: string;
  photos: string[];
  mobile: string;
  tractorType: string;
  model: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  ratePerHour: number | null;
  ratePerDay: number | null;
  isAvailable: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a tractor profile, as sent on create (POST) and
 * update (PUT). Matches createTractorProfileSchema on the backend.
 * isVerified is deliberately absent — only an admin workflow sets it. */
export interface TractorProfileFormInput {
  photos?: string[];
  mobile: string;
  tractorType: string;
  model: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude?: number;
  longitude?: number;
  ratePerHour?: number;
  ratePerDay?: number;
  isAvailable?: boolean;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type TractorProfileFieldErrors = Partial<
  Record<keyof TractorProfileFormInput, string[]>
>;

/** Matches searchTractorQuerySchema on the backend — all optional, sent
 * as query string params. */
export interface TractorSearchFilters {
  tractorType?: string;
  state?: string;
  district?: string;
  rateType?: "HOURLY" | "DAILY";
  minRate?: number;
  maxRate?: number;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /tractors/search. */
export interface TractorSearchResult {
  items: TractorProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Mirrors the shape returned by GET /tractors/:id/availability
 * (tractor.service.ts getTractorAvailability). */
export interface TractorAvailability {
  id: string;
  isAvailable: boolean;
}

// --- Tractor Bookings (Step 20) ---

/** Mirrors the backend's TractorBookingStatus enum (backend/prisma/schema.prisma). */
export type TractorBookingStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

/** Mirrors the backend's TractorRateType enum (backend/prisma/schema.prisma). */
export type TractorRateType = "HOURLY" | "DAILY";

/** Matches createTractorBookingSchema on the backend
 * (tractorBooking.validator.ts). bookingDate is sent as an ISO date string. */
export interface TractorBookingFormInput {
  tractorOwnerId: string;
  workType: string;
  bookingDate: string;
  location: string;
  rateType: TractorRateType;
  rate: number;
  message?: string;
}

export type TractorBookingFieldErrors = Partial<
  Record<keyof TractorBookingFormInput, string[]>
>;

/** The farmer side of a tractor booking, as nested by the backend's
 * TRACTOR_BOOKING_SELECT (tractorBooking.service.ts). */
export interface TractorBookingFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** The tractor owner side of a tractor booking, as nested by the backend's
 * TRACTOR_BOOKING_SELECT (tractorBooking.service.ts). */
export interface TractorBookingTractorOwner {
  id: string;
  fullName: string;
  tractorProfile: {
    mobile: string;
    tractorType: string;
    model: string;
    ratePerHour: number | null;
    ratePerDay: number | null;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's TRACTOR_BOOKING_SELECT shape
 * (tractorBooking.service.ts) — returned to both the farmer who sent it
 * and the tractor owner who received it. */
export interface TractorBooking {
  id: string;
  farmerId: string;
  tractorOwnerId: string;
  workType: string;
  bookingDate: string;
  location: string;
  rateType: TractorRateType;
  rate: number;
  message: string | null;
  status: TractorBookingStatus;
  respondedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  farmer: TractorBookingFarmer;
  tractorOwner: TractorBookingTractorOwner;
}

/** Matches listTractorBookingsQuerySchema on the backend — all optional,
 * sent as query string params. */
export interface TractorBookingListFilters {
  status?: TractorBookingStatus;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /tractor-bookings. */
export interface TractorBookingListResult {
  items: TractorBooking[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Transport Hiring (Step 21) ---

/** Common vehicle types for the create/edit form's suggestions — the
 * backend field (vehicleType) is free text (mirrors TractorProfile.tractorType
 * being free text), so this is UI convenience only, not an enum. */
export const VEHICLE_TYPES = [
  "Mini Truck",
  "Pickup Truck",
  "Tempo",
  "Container Truck",
  "Tractor Trolley",
  "Open Truck",
  "Refrigerated Truck",
  "Trailer",
] as const;

/** Mirrors the backend's CapacityUnit enum (backend/prisma/schema.prisma). */
export type CapacityUnit = "KG" | "QUINTAL" | "TON";

export const CAPACITY_UNITS: CapacityUnit[] = ["KG", "QUINTAL", "TON"];

/** Human-readable labels for each unit, for select/option UI. */
export const CAPACITY_UNIT_LABELS: Record<CapacityUnit, string> = {
  KG: "Kilogram (kg)",
  QUINTAL: "Quintal",
  TON: "Ton",
};

/** Mirrors the backend's TRANSPORT_PROFILE_SELECT shape
 * (transport.service.ts). */
export interface TransportProfile {
  id: string;
  userId: string;
  photos: string[];
  mobile: string;
  vehicleType: string;
  vehicleNumber: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  ratePerKm: number | null;
  ratePerTrip: number | null;
  isAvailable: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Editable fields of a transport profile, as sent on create (POST) and
 * update (PUT). Matches createTransportProfileSchema on the backend.
 * isVerified is deliberately absent — only an admin workflow sets it. */
export interface TransportProfileFormInput {
  photos?: string[];
  mobile: string;
  vehicleType: string;
  vehicleNumber: string;
  capacity: number;
  capacityUnit: CapacityUnit;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude?: number;
  longitude?: number;
  ratePerKm?: number;
  ratePerTrip?: number;
  isAvailable?: boolean;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type TransportProfileFieldErrors = Partial<
  Record<keyof TransportProfileFormInput, string[]>
>;

/** Matches searchTransportQuerySchema on the backend — all optional, sent
 * as query string params. */
export interface TransportSearchFilters {
  vehicleType?: string;
  state?: string;
  district?: string;
  capacityUnit?: CapacityUnit;
  minCapacity?: number;
  maxCapacity?: number;
  rateType?: "PER_KM" | "PER_TRIP";
  minRate?: number;
  maxRate?: number;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /transport/search. */
export interface TransportSearchResult {
  items: TransportProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Mirrors the shape returned by GET /transport/:id/availability
 * (transport.service.ts getTransportAvailability). */
export interface TransportAvailability {
  id: string;
  isAvailable: boolean;
}

// --- Transport Bookings (Step 21) ---

/** Mirrors the backend's TransportBookingStatus enum (backend/prisma/schema.prisma). */
export type TransportBookingStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";

/** Mirrors the backend's TransportRateType enum (backend/prisma/schema.prisma). */
export type TransportRateType = "PER_KM" | "PER_TRIP";

/** Matches createTransportBookingSchema on the backend
 * (transportBooking.validator.ts). bookingDate is sent as an ISO date
 * string. */
export interface TransportBookingFormInput {
  transportProviderId: string;
  goodsType: string;
  pickupLocation: string;
  dropLocation: string;
  bookingDate: string;
  rateType: TransportRateType;
  rate: number;
  message?: string;
}

export type TransportBookingFieldErrors = Partial<
  Record<keyof TransportBookingFormInput, string[]>
>;

/** The farmer side of a transport booking, as nested by the backend's
 * TRANSPORT_BOOKING_SELECT (transportBooking.service.ts). */
export interface TransportBookingFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** The transport provider side of a transport booking, as nested by the
 * backend's TRANSPORT_BOOKING_SELECT (transportBooking.service.ts). */
export interface TransportBookingProvider {
  id: string;
  fullName: string;
  transportProfile: {
    mobile: string;
    vehicleType: string;
    vehicleNumber: string;
    capacity: number;
    capacityUnit: CapacityUnit;
    ratePerKm: number | null;
    ratePerTrip: number | null;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's TRANSPORT_BOOKING_SELECT shape
 * (transportBooking.service.ts) — returned to both the farmer who sent it
 * and the transport provider who received it. */
export interface TransportBooking {
  id: string;
  farmerId: string;
  transportProviderId: string;
  goodsType: string;
  pickupLocation: string;
  dropLocation: string;
  bookingDate: string;
  rateType: TransportRateType;
  rate: number;
  message: string | null;
  status: TransportBookingStatus;
  respondedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  farmer: TransportBookingFarmer;
  transportProvider: TransportBookingProvider;
}

/** Matches listTransportBookingsQuerySchema on the backend — all optional,
 * sent as query string params. */
export interface TransportBookingListFilters {
  status?: TransportBookingStatus;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /transport-bookings. */
export interface TransportBookingListResult {
  items: TransportBooking[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Produce Offers (Step 22) ---

/** Mirrors the backend's OfferStatus enum (backend/prisma/schema.prisma). */
export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

/** Matches createProduceOfferSchema on the backend (POST /produce-offers). */
export interface ProduceOfferFormInput {
  listingId: string;
  offerPrice: number;
  quantity: number;
  message?: string;
}

/** Per-field validation errors, as returned in the `details` field of a
 * failed API response (zod's `flatten().fieldErrors`). */
export type ProduceOfferFieldErrors = Partial<
  Record<keyof ProduceOfferFormInput, string[]>
>;

/** The listing an offer was made against, as nested by the backend's
 * PRODUCE_OFFER_SELECT (produceOffer.service.ts) — just enough context to
 * show alongside the offer without a second fetch. */
export interface ProduceOfferListing {
  id: string;
  crop: string;
  quantity: number;
  unit: ProduceUnit;
  price: number;
  location: string;
  isActive: boolean;
}

/** The buyer's identity, as nested by the backend's PRODUCE_OFFER_SELECT.
 * BUYER-role users have no profile model in this schema, so this is just
 * fullName + email. */
export interface ProduceOfferBuyer {
  id: string;
  fullName: string;
  email: string;
}

/** The farmer's identity, as nested by the backend's PRODUCE_OFFER_SELECT
 * — mirrors TransportBookingFarmer in shape. */
export interface ProduceOfferFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's PRODUCE_OFFER_SELECT shape
 * (produceOffer.service.ts) — the shared view of an offer returned to
 * both the buyer who made it and the farmer who received it. */
export interface ProduceOffer {
  id: string;
  listingId: string;
  buyerId: string;
  farmerId: string;
  offerPrice: number;
  quantity: number;
  message: string | null;
  status: OfferStatus;
  respondedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: ProduceOfferListing;
  buyer: ProduceOfferBuyer;
  farmer: ProduceOfferFarmer;
}

/** Matches listProduceOffersQuerySchema on the backend — all optional,
 * sent as query string params. */
export interface ProduceOfferListFilters {
  status?: OfferStatus;
  listingId?: string;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /produce-offers. */
export interface ProduceOfferListResult {
  items: ProduceOffer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Orders (Step 23) ---

/** Mirrors the backend's OrderStatus enum (backend/prisma/schema.prisma).
 * The forward path is PENDING -> CONFIRMED -> READY -> PICKUP ->
 * DELIVERED -> COMPLETED; CANCELLED is reachable only from PENDING or
 * CONFIRMED. */
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "READY"
  | "PICKUP"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

/** Display labels for OrderStatus, in forward-path order. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  READY: "Ready for pickup",
  PICKUP: "Picked up",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** The listing an order originated from, as nested by the backend's
 * ORDER_SELECT (order.service.ts) — just enough context to show alongside
 * the order without a second fetch. */
export interface OrderListing {
  id: string;
  location: string;
  photos: string[];
}

/** The buyer's identity, as nested by the backend's ORDER_SELECT.
 * BUYER-role users have no profile model in this schema, so this is just
 * fullName + email. Mirrors ProduceOfferBuyer. */
export interface OrderBuyer {
  id: string;
  fullName: string;
  email: string;
}

/** The farmer's identity, as nested by the backend's ORDER_SELECT —
 * mirrors ProduceOfferFarmer in shape. */
export interface OrderFarmer {
  id: string;
  fullName: string;
  farmerProfile: {
    mobile: string;
    village: string;
    taluka: string;
    district: string;
    state: string;
  } | null;
}

/** Mirrors the backend's ORDER_SELECT shape (order.service.ts) — the
 * shared view of an order returned to both the buyer who made it and the
 * farmer who received it. */
export interface Order {
  id: string;
  offerId: string;
  listingId: string;
  buyerId: string;
  farmerId: string;
  crop: string;
  quantity: number;
  unit: ProduceUnit;
  pricePerUnit: number;
  totalAmount: number;
  status: OrderStatus;
  confirmedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  listing: OrderListing;
  buyer: OrderBuyer;
  farmer: OrderFarmer;
}

/** Mirrors the backend's ORDER_HISTORY_SELECT shape (order.service.ts) —
 * one row per status transition, oldest first. */
export interface OrderHistoryEntry {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  changedBy: {
    id: string;
    fullName: string;
    role: string;
  };
}

/** Matches listOrdersQuerySchema on the backend — all optional, sent as
 * query string params. */
export interface OrderListFilters {
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /orders. */
export interface OrderListResult {
  items: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Ratings (Step 25a) ---

/** Mirrors the backend's RatingTargetType enum (backend/prisma/schema.prisma). */
export type RatingTargetType = "LABOUR" | "TRACTOR" | "TRANSPORT" | "BUYER";

/** Matches createRatingSchema on the backend (rating.validator.ts).
 * referenceId is a WorkRequest, TractorBooking, TransportBooking, or
 * Order id depending on targetType (backend resolves which one). */
export interface CreateRatingFormInput {
  targetType: RatingTargetType;
  referenceId: string;
  rating: number;
  review?: string;
}

export type CreateRatingFieldErrors = Partial<
  Record<keyof CreateRatingFormInput, string[]>
>;

/** Matches updateRatingSchema on the backend — targetType/referenceId are
 * immutable once a rating exists, so only rating/review are editable. */
export interface UpdateRatingFormInput {
  rating?: number;
  review?: string;
}

export type UpdateRatingFieldErrors = Partial<
  Record<keyof UpdateRatingFormInput, string[]>
>;

/** The rater's identity, as nested by the backend's RATING_SELECT
 * (rating.service.ts). */
export interface RatingRater {
  id: string;
  fullName: string;
}

/** The ratee's identity, as nested by the backend's RATING_SELECT
 * (rating.service.ts). */
export interface RatingRatee {
  id: string;
  fullName: string;
  role: Role;
}

/** Mirrors the backend's RATING_SELECT shape (rating.service.ts) — the
 * shared view of a rating returned to both the rater and the ratee.
 * Exactly one of workRequestId/tractorBookingId/transportBookingId/orderId
 * is set, matching targetType. */
export interface Rating {
  id: string;
  raterId: string;
  rateeId: string;
  targetType: RatingTargetType;
  workRequestId: string | null;
  tractorBookingId: string | null;
  transportBookingId: string | null;
  orderId: string | null;
  rating: number;
  review: string | null;
  createdAt: string;
  updatedAt: string;
  rater: RatingRater;
  ratee: RatingRatee;
}

/** Matches listRatingsQuerySchema on the backend — used for both "given"
 * and "received" rating lists, and the public rating-summary query. */
export interface RatingListFilters {
  targetType?: RatingTargetType;
  page?: number;
  limit?: number;
}

/** Mirrors the paginated envelope returned by GET /ratings/given and
 * GET /ratings/received. */
export interface RatingListResult {
  items: Rating[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Mirrors the shape returned by GET /ratings/user/:userId
 * (rating.controller.ts getUserRatingSummary) — a ratee's public
 * summary + review list. averageRating is null (not 0) when ratingCount
 * is 0, so "no ratings yet" stays distinguishable from "rated 0". */
export interface RatingSummaryResult {
  averageRating: number | null;
  ratingCount: number;
  reviews: Rating[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
