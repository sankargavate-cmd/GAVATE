import { AuthenticatedUser } from "./auth";

// Augments Express's Request type globally so `req.user` is available and
// correctly typed in every controller/middleware after requireAuth runs,
// without needing a cast at each call site.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      // Populated only for requests under /payments/cashfree (see
      // app.ts's express.json `verify` callback) — the exact raw bytes
      // Cashfree sent, needed because webhook signature verification
      // must HMAC the raw body, not the re-serialized parsed JSON
      // (Content-Type/whitespace/decimal differences would break the
      // signature). Undefined for every other route.
      rawBody?: Buffer;
    }
  }
}

export {};
