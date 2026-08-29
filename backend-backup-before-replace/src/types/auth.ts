import { Role } from "@prisma/client";

/**
 * Shape of the authenticated user attached to `req.user` by requireAuth.
 * Derived directly from the JWT payload — no DB round-trip on every
 * request. Reused by requireRole and by any future Farmer/Labour/Buyer/
 * Tractor/Admin route that needs to know who's calling.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
