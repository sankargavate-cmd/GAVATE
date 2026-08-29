import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import * as cashfreePaymentService from "./cashfreePayment.service";
import { ListAdminPaymentsQuery } from "../validators/adminPayment.validator";
import { PaginatedResult } from "./labour.service";

const PAYMENT_NOT_FOUND_MESSAGE = "Payment not found";

/**
 * Admin Payment Dashboard & Reconciliation (Step 42).
 *
 * Built on top of the existing Payment model/lifecycle from Step 34
 * (payment.service.ts) and the Step 41 refund fields. Two of the three
 * gaps this module fills are pure admin *visibility*: every existing
 * payment.service.ts read (getMyPayments, getPaymentById) is
 * unconditionally scoped to the calling user's own userId, so there was
 * previously no way for an admin to see payments across all users —
 * listAllPayments/getPaymentByIdForAdmin below add no new Payment field
 * and no new write path of their own. The third, reconcilePayment,
 * delegates entirely to cashfreePaymentService.reconcilePaymentForAdmin
 * (Step 42) to re-check a payment/refund against Cashfree's own server —
 * it introduces no new Cashfree API call or status-mapping logic here;
 * see that function's doc comment for the actual reconciliation rules.
 */

// Admin-facing projection — everything payment.service.ts's own
// PAYMENT_SELECT already exposes to a payer, plus a slice of the payer's
// own User row (id/fullName/email/role) so the dashboard can render
// "user/payer" without a second lookup. Never selects passwordHash or
// any other User field, and — same as PAYMENT_SELECT — never selects a
// Cashfree secret/credential/signature, since none is ever stored on
// Payment or User in the first place; there is nothing on this model to
// accidentally leak.
const ADMIN_PAYMENT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  currency: true,
  purpose: true,
  relatedEntityType: true,
  relatedEntityId: true,
  gatewayName: true,
  gatewayReferenceId: true,
  gatewayPaymentId: true,
  status: true,
  failureReason: true,
  refundStatus: true,
  refundAmount: true,
  refundReason: true,
  gatewayRefundId: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.PaymentSelect;

export type AdminPaymentResult = Prisma.PaymentGetPayload<{
  select: typeof ADMIN_PAYMENT_SELECT;
}>;

/**
 * Builds the shared Prisma where-clause for both listAllPayments and any
 * future admin export/count that needs the exact same filter set. Every
 * filter is additive (AND'd together) and optional — omitting all of
 * them (the default) matches every payment for every user, which is the
 * core requirement: admin visibility is never restricted the way
 * payment.service.ts's userId-scoped reads are.
 */
function buildAdminPaymentWhere(
  query: ListAdminPaymentsQuery
): Prisma.PaymentWhereInput {
  const {
    status,
    purpose,
    relatedEntityType,
    refundStatus,
    userId,
    gatewayReferenceId,
    gatewayPaymentId,
    dateFrom,
    dateTo,
  } = query;

  return {
    ...(status ? { status } : {}),
    ...(purpose ? { purpose } : {}),
    ...(relatedEntityType ? { relatedEntityType } : {}),
    ...(refundStatus ? { refundStatus } : {}),
    ...(userId ? { userId } : {}),
    ...(gatewayReferenceId
      ? { gatewayReferenceId: { contains: gatewayReferenceId, mode: "insensitive" } }
      : {}),
    ...(gatewayPaymentId
      ? { gatewayPaymentId: { contains: gatewayPaymentId, mode: "insensitive" } }
      : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
  };
}

/**
 * Paginated list of payments across ALL users, most recent first —
 * the admin-only counterpart to payment.service.ts's getMyPayments,
 * which is permanently scoped to a single caller. Supports the full
 * filter set from Requirements: status, purpose, relatedEntityType,
 * date range, userId, and a gateway reference/payment id lookup, plus
 * refundStatus since refund reconciliation is this step's other stated
 * goal. Mirrors listPendingFarmerProfiles' $transaction pagination
 * pattern exactly.
 */
export async function listAllPayments(
  query: ListAdminPaymentsQuery
): Promise<PaginatedResult<AdminPaymentResult>> {
  const { page, limit } = query;
  const where = buildAdminPaymentWhere(query);

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      select: ADMIN_PAYMENT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
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
 * Fetches a single payment by id for the admin dashboard — unlike
 * payment.service.ts's getPaymentById, this is intentionally NOT scoped
 * to any particular userId, since an admin must be able to open any
 * payment's detail view regardless of who made it. 404s identically to
 * a nonexistent id when the payment truly doesn't exist, mirroring
 * every other *_NOT_FOUND pattern in this codebase.
 */
export async function getPaymentByIdForAdmin(id: string): Promise<AdminPaymentResult> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: ADMIN_PAYMENT_SELECT,
  });

  if (!payment) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE, 404);
  }

  return payment;
}

/**
 * Reconciles a payment (and, if applicable, its refund) against
 * Cashfree's own server-side status — backs
 * `POST /api/v1/admin/payments/:id/reconcile`. Delegates entirely to
 * cashfreePaymentService.reconcilePaymentForAdmin (Step 42), which reuses
 * the exact same Cashfree API calls, status mapping, and
 * duplicate/out-of-order guards as the existing user-facing
 * checkCashfreePaymentStatus/checkCashfreeRefundStatus — nothing here
 * re-implements any Cashfree logic, and a payment already locked at
 * SUCCESS/REFUNDED is never downgraded (see that function's doc
 * comment). 404s (via getPaymentByIdUnscoped) if the payment doesn't
 * exist at all. Never trusts any client-supplied status: the only input
 * is the payment id from the URL, and the record is only ever updated
 * according to what Cashfree's server actually returns.
 */
export async function reconcilePayment(id: string): Promise<AdminPaymentResult> {
  await cashfreePaymentService.reconcilePaymentForAdmin(id);
  return getPaymentByIdForAdmin(id);
}
