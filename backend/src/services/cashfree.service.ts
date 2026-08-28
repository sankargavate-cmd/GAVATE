import crypto from "crypto";
import { cashfreeConfig } from "../config/cashfree";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";

/**
 * Thin wrapper around Cashfree's Payment Gateway REST API (Step 35 —
 * integration foundation). Deliberately calls the REST endpoints
 * directly with the platform's built-in `fetch` (Node >=18, see
 * package.json engines) rather than pulling in the `cashfree-pg` SDK —
 * this keeps the dependency surface unchanged (no new package.json
 * entries) while still following Cashfree's current official API
 * exactly: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
 *
 * Nothing in this file ever logs or returns `cashfreeConfig.clientSecret`
 * — it is only ever placed in the outgoing `x-client-secret` header.
 */

export interface CashfreeCustomerDetails {
  customer_id: string;
  customer_phone: string;
  customer_name?: string;
  customer_email?: string;
}

export interface CashfreeCreateOrderRequest {
  order_id: string;
  order_amount: number;
  order_currency: string;
  customer_details: CashfreeCustomerDetails;
  order_meta?: {
    return_url?: string;
    notify_url?: string;
  };
}

export interface CashfreeOrderEntity {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
  order_expiry_time?: string;
}

interface CashfreeErrorBody {
  message?: string;
  code?: string;
  type?: string;
}

/**
 * Step 46 — thrown instead of a plain AppError whenever Cashfree returns
 * a non-2xx response, so a caller that needs to react to *which* Cashfree
 * error occurred (not just "it failed") can do so without re-parsing
 * `message`. Everything AppError already gives callers/errorHandler
 * (statusCode, details, HTTP response shape) is unchanged — this only
 * adds Cashfree's own machine-readable `code`/`type` alongside it. Only
 * one caller inspects these today (createCashfreeOrderForPayment's
 * `order_already_exists` recovery below); every other call site keeps
 * treating this exactly like the AppError it extends.
 */
export class CashfreeApiError extends AppError {
  public readonly cashfreeCode?: string;
  public readonly cashfreeType?: string;

  constructor(message: string, statusCode: number, cashfreeCode?: string, cashfreeType?: string) {
    super(message, statusCode);
    this.cashfreeCode = cashfreeCode;
    this.cashfreeType = cashfreeType;
    Object.setPrototypeOf(this, CashfreeApiError.prototype);
  }
}

// Shape of the payload Cashfree POSTs to the webhook endpoint. Only the
// fields this app actually reads are declared — Cashfree's real payload
// has many more (customer_details, payment_method, ...), all of which
// pass through untouched. See
// https://www.cashfree.com/docs/api-reference/payments/latest/orders/create#callbacks
// `data.refund` (Step 41) covers the separate REFUND_STATUS_WEBHOOK
// event type Cashfree sends for refund lifecycle updates — a different
// `type` value and payload shape from the payment webhook above, handled
// as its own branch in cashfreePayment.service.ts.
export interface CashfreeWebhookPayload {
  type?: string;
  event_time?: string;
  data?: {
    order?: {
      order_id?: string;
    };
    payment?: {
      cf_payment_id?: string;
      payment_status?: string;
    };
    refund?: {
      refund_id?: string;
      cf_refund_id?: string;
      order_id?: string;
      refund_status?: string;
    };
  };
}

// Step 41 — Refunds. Request/response shapes for Cashfree's Refunds API:
// https://www.cashfree.com/docs/api-reference/payments/latest/refunds/create
export interface CashfreeCreateRefundRequest {
  refund_id: string;
  refund_amount: number;
  refund_note?: string;
}

export interface CashfreeRefundEntity {
  cf_refund_id?: string;
  refund_id: string;
  order_id: string;
  refund_amount: number;
  refund_status: string;
  refund_note?: string;
}

function cashfreeHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-version": cashfreeConfig.apiVersion,
    "x-client-id": cashfreeConfig.clientId,
    "x-client-secret": cashfreeConfig.clientSecret,
  };
}

/**
 * Shared response handling for both calls below — Cashfree returns a
 * JSON error body (BadRequestError/AuthenticationError/etc. — see
 * Cashfree's OpenAPI spec) on non-2xx responses, which we surface as an
 * AppError without ever including the request headers (so a secret
 * never ends up in a thrown error's message/details).
 */
async function parseCashfreeResponse<T>(response: Response, action: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & CashfreeErrorBody;

  if (!response.ok) {
    logger.error(`Cashfree ${action} failed`, {
      status: response.status,
      code: body?.code,
      type: body?.type,
    });
    throw new CashfreeApiError(
      body?.message || `Cashfree ${action} failed`,
      // Surface Cashfree's own 4xx as a 502 (this app's fault for
      // upstream integration purposes) unless it's clearly a caller
      // input problem already validated by our own Zod schema — kept
      // simple/conservative for this foundation step.
      response.status >= 500 ? 502 : 400,
      body?.code,
      body?.type
    );
  }

  return body;
}

/**
 * Creates a Cashfree order and returns the `payment_session_id` a
 * (future) checkout UI would use to open Cashfree's hosted checkout.
 * Never called with anything read from a client-supplied "status" —
 * amount/currency always come from this app's own Payment record (see
 * cashfreePayment.service.ts), never from the request body.
 */
export async function createCashfreeOrder(
  payload: CashfreeCreateOrderRequest
): Promise<CashfreeOrderEntity> {
  const response = await fetch(`${cashfreeConfig.baseUrl}/orders`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify(payload),
  });

  return parseCashfreeResponse<CashfreeOrderEntity>(response, "create order");
}

/**
 * Fetches an order's current state directly from Cashfree's server —
 * the basis for the "check payment status" endpoint. This is the
 * server-side source of truth this app trusts; a client's own claim
 * about payment success is never trusted anywhere in this module.
 */
export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrderEntity> {
  const response = await fetch(
    `${cashfreeConfig.baseUrl}/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: cashfreeHeaders(),
    }
  );

  return parseCashfreeResponse<CashfreeOrderEntity>(response, "fetch order");
}

/**
 * Creates a refund against an existing (paid) Cashfree order. Never
 * called with a client-supplied amount — `refund_amount` always comes
 * from this app's own Payment record (see
 * cashfreePayment.service.ts's initiateRefund), mirroring
 * createCashfreeOrder's identical "amount always server-side" rule
 * above. `refund_id` is this app's own deterministic id
 * (`rf-<paymentId>`, set by the caller), which doubles as Cashfree's own
 * idempotency key for this endpoint — retrying the same refund_id
 * against Cashfree is itself a safe no-op on their side, on top of this
 * app's own refundStatus guard.
 */
export async function createCashfreeRefund(
  orderId: string,
  payload: CashfreeCreateRefundRequest
): Promise<CashfreeRefundEntity> {
  const response = await fetch(
    `${cashfreeConfig.baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`,
    {
      method: "POST",
      headers: cashfreeHeaders(),
      body: JSON.stringify(payload),
    }
  );

  return parseCashfreeResponse<CashfreeRefundEntity>(response, "create refund");
}

/**
 * Fetches a refund's current state directly from Cashfree's server — the
 * basis for the manual "check refund status" endpoint, same
 * server-is-truth reasoning as fetchCashfreeOrder above.
 */
export async function fetchCashfreeRefund(
  orderId: string,
  refundId: string
): Promise<CashfreeRefundEntity> {
  const response = await fetch(
    `${cashfreeConfig.baseUrl}/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(
      refundId
    )}`,
    {
      method: "GET",
      headers: cashfreeHeaders(),
    }
  );

  return parseCashfreeResponse<CashfreeRefundEntity>(response, "fetch refund");
}

/**
 * Verifies a Cashfree webhook's authenticity per Cashfree's official
 * mechanism: HMAC-SHA256(timestamp + rawBody, client_secret),
 * base64-encoded, compared against the `x-webhook-signature` header. See
 * https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification
 *
 * Deliberately takes the raw request Buffer (not the parsed body) —
 * re-serializing JSON can alter whitespace/decimal formatting and break
 * the signature (Cashfree's own webhook docs call this out explicitly).
 * Uses a timing-safe comparison to avoid leaking the correct signature
 * one byte at a time via response-time differences.
 */
export function verifyCashfreeWebhookSignature(
  rawBody: Buffer,
  timestamp: string,
  signature: string
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", cashfreeConfig.clientSecret)
    .update(timestamp + rawBody.toString("utf8"))
    .digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");

  // timingSafeEqual throws if lengths differ, which would otherwise leak
  // signature length information via an exception instead of a clean
  // false — guard explicitly.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
