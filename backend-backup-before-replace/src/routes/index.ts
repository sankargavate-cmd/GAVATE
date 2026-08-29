import { Router } from "express";
import { getHealth } from "../controllers/health.controller";
import adminDocumentRoutes from "./adminDocument.routes";
import adminFarmerRoutes from "./adminFarmer.routes";
import adminLabourRoutes from "./adminLabour.routes";
import adminPaymentRoutes from "./adminPayment.routes";
import authRoutes from "./auth.routes";
import buyerRoutes from "./buyer.routes";
import buyerVerificationRoutes from "./buyerVerification.routes";
import documentRoutes from "./document.routes";
import farmerRoutes from "./farmer.routes";
import labourRoutes from "./labour.routes";
import locationRoutes from "./location.routes";
import notificationRoutes from "./notification.routes";
import orderRoutes from "./order.routes";
import paymentRoutes from "./payment.routes";
import paymentWebhookRoutes from "./paymentWebhook.routes";
import produceRoutes from "./produce.routes";
import produceOfferRoutes from "./produceOffer.routes";
import ratingRoutes from "./rating.routes";
import superAdminAdminsRoutes from "./superAdminAdmins.routes";
import tractorRoutes from "./tractor.routes";
import tractorBookingRoutes from "./tractorBooking.routes";
import tractorVerificationRoutes from "./tractorVerification.routes";
import transportRoutes from "./transport.routes";
import transportBookingRoutes from "./transportBooking.routes";
import transportVerificationRoutes from "./transportVerification.routes";
import workRequestRoutes from "./workRequest.routes";

const router = Router();

router.get("/health", getHealth);

router.use("/auth", authRoutes);
router.use("/farmers", farmerRoutes);
router.use("/labour", labourRoutes);
router.use("/users/location", locationRoutes);
router.use("/produce", produceRoutes);
router.use("/produce-offers", produceOfferRoutes);
router.use("/orders", orderRoutes);
router.use("/work-requests", workRequestRoutes);
router.use("/tractors", tractorRoutes);
router.use("/tractor-bookings", tractorBookingRoutes);
router.use("/transport", transportRoutes);
router.use("/transport-bookings", transportBookingRoutes);
router.use("/ratings", ratingRoutes);
router.use("/notifications", notificationRoutes);
// Mounted BEFORE /payments, and matched first: paymentRoutes applies
// requireAuth to every request under /payments (see payment.routes.ts),
// which would otherwise reject Cashfree's unauthenticated webhook calls
// before they ever reached a route inside that router.
router.use("/payments/cashfree", paymentWebhookRoutes);
router.use("/payments", paymentRoutes);
router.use("/documents", documentRoutes);
router.use("/buyers", buyerVerificationRoutes);
router.use("/buyers", buyerRoutes);
router.use("/tractor-owners", tractorVerificationRoutes);
router.use("/transport-providers", transportVerificationRoutes);
router.use("/admin/labour", adminLabourRoutes);
router.use("/admin/farmers", adminFarmerRoutes);
router.use("/admin/documents", adminDocumentRoutes);
// Step 42: Admin Payment Dashboard & Reconciliation — read-only,
// admin-only visibility across ALL users' payments. Mounted after
// /payments above so this never interferes with that router's own
// requireAuth-only (no role restriction) routes.
router.use("/admin/payments", adminPaymentRoutes);
router.use("/super-admin/admins", superAdminAdminsRoutes);

export default router;
