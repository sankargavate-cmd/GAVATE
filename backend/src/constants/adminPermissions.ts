// Fixed, application-enforced allow-list of permission strings a
// SUPER_ADMIN can grant to an ADMIN via assignPermissions. Intentionally
// small and scoped to features that already exist — extend this list as
// new admin-manageable modules are built, rather than accepting arbitrary
// strings from the client.
//
// Admin-management itself (create/activate/deactivate/remove/reset
// password/assign permissions) is deliberately NOT a grantable permission
// here: only the SUPER_ADMIN role can do that, enforced by requireRole,
// not by a permission flag an admin could theoretically be given.
export const ADMIN_PERMISSIONS = [
  "LABOUR_VERIFICATION_VIEW",
  "LABOUR_VERIFICATION_APPROVE",
  "LABOUR_VERIFICATION_REJECT",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
