import { OrderStatus } from "@/types";

/** Which role(s) can trigger each order's next forward-path step, and
 * what that step is. Mirrors ORDER_TRANSITIONS in
 * backend/src/services/order.service.ts exactly — kept here purely to
 * decide which action buttons to render; the backend is still the source
 * of truth and re-checks this on every request. */
const ORDER_TRANSITIONS: Partial<
  Record<OrderStatus, { next: OrderStatus; allowedRoles: Array<"BUYER" | "FARMER">; label: string }>
> = {
  PENDING: { next: "CONFIRMED", allowedRoles: ["FARMER"], label: "Confirm order" },
  CONFIRMED: { next: "READY", allowedRoles: ["FARMER"], label: "Mark ready for pickup" },
  READY: { next: "PICKUP", allowedRoles: ["FARMER", "BUYER"], label: "Mark picked up" },
  PICKUP: { next: "DELIVERED", allowedRoles: ["FARMER", "BUYER"], label: "Mark delivered" },
  DELIVERED: { next: "COMPLETED", allowedRoles: ["BUYER"], label: "Mark completed" },
};

/** Statuses from which an order can still be cancelled. Mirrors
 * CANCELLABLE_STATUSES in order.service.ts. */
const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED"];

/** Returns the next-step action available to this role for an order
 * currently at `status`, or null if there is none (either the order is
 * terminal, or this role isn't the one who triggers the next step). */
export function getNextAction(
  status: OrderStatus,
  role: "BUYER" | "FARMER"
): { next: OrderStatus; label: string } | null {
  const transition = ORDER_TRANSITIONS[status];
  if (!transition || !transition.allowedRoles.includes(role)) {
    return null;
  }
  return { next: transition.next, label: transition.label };
}

/** Whether an order at `status` can still be cancelled (by either
 * party). */
export function isCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}
