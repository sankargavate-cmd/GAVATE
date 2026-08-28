"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  AUTH_REQUIRED as TRANSPORT_AUTH_REQUIRED,
  fetchTransportAvailability,
  fetchTransportById,
} from "@/lib/transport";
import {
  AUTH_REQUIRED as BOOKING_AUTH_REQUIRED,
  createTransportBooking,
} from "@/lib/transportBooking";
import RatingSummary from "@/components/rating/RatingSummary";
import {
  TransportBookingFieldErrors,
  TransportBookingFormInput,
  TransportProfile,
  TransportRateType,
} from "@/types";
import styles from "./transport-profile.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: TransportProfile };

type AvailabilityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked"; isAvailable: boolean }
  | { kind: "unknown" };

interface RequestForm {
  goodsType: string;
  bookingDate: string;
  pickupLocation: string;
  dropLocation: string;
  rateType: TransportRateType;
  rate: string;
  message: string;
}

const EMPTY_FORM: RequestForm = {
  goodsType: "",
  bookingDate: "",
  pickupLocation: "",
  dropLocation: "",
  rateType: "PER_KM",
  rate: "",
  message: "",
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fieldErrors?: TransportBookingFieldErrors };

// Mirrors isFieldErrors in app/farmer/tractor-search/[id]/page.tsx —
// narrows the untyped `details` field of a failed API response before
// trusting its shape.
function isFieldErrors(details: unknown): details is TransportBookingFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function FarmerTransportDetailsPage() {
  const params = useParams<{ id: string }>();

  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "idle" });
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });

      let result: Awaited<ReturnType<typeof fetchTransportById>>;
      try {
        result = await fetchTransportById(params.id);
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "Couldn't reach the server. Check your connection and try again.",
          });
        }
        return;
      }

      if (cancelled) return;

      if (result === TRANSPORT_AUTH_REQUIRED) {
        setState({ kind: "authRequired" });
        return;
      }

      const { status, body } = result;

      if (status === 200 && body.success) {
        setState({ kind: "ready", profile: body.data });
        // Seed the booking form's rate/rateType with whichever rate the
        // provider actually publishes, so the field isn't left at a
        // default that doesn't apply to this listing.
        setForm((prev) => ({
          ...prev,
          rateType: body.data.ratePerKm !== null ? "PER_KM" : "PER_TRIP",
          rate:
            body.data.ratePerKm !== null
              ? String(body.data.ratePerKm)
              : body.data.ratePerTrip !== null
              ? String(body.data.ratePerTrip)
              : "",
        }));
        return;
      }

      if (status === 401) {
        setState({ kind: "authRequired" });
        return;
      }

      if (status === 404) {
        setState({ kind: "notFound" });
        return;
      }

      setState({
        kind: "error",
        message: !body.success ? body.message : "Couldn't load this listing.",
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleCheckAvailability() {
    setAvailability({ kind: "checking" });

    let result: Awaited<ReturnType<typeof fetchTransportAvailability>>;
    try {
      result = await fetchTransportAvailability(params.id);
    } catch {
      setAvailability({ kind: "unknown" });
      return;
    }

    if (result === TRANSPORT_AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;
    if (status === 200 && body.success) {
      setAvailability({ kind: "checked", isAvailable: body.data.isAvailable });
    } else {
      setAvailability({ kind: "unknown" });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready") return;

    setSubmitState({ kind: "submitting" });

    const input: TransportBookingFormInput = {
      transportProviderId: state.profile.userId,
      goodsType: form.goodsType.trim(),
      pickupLocation: form.pickupLocation.trim(),
      dropLocation: form.dropLocation.trim(),
      bookingDate: form.bookingDate,
      rateType: form.rateType,
      rate: Number(form.rate),
      message: form.message.trim() || undefined,
    };

    let result: Awaited<ReturnType<typeof createTransportBooking>>;
    try {
      result = await createTransportBooking(input);
    } catch {
      setSubmitState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    if (result === BOOKING_AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      setSubmitState({ kind: "success" });
      setForm(EMPTY_FORM);
      return;
    }

    if (status === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    if (!body.success) {
      setSubmitState({
        kind: "error",
        message: body.message,
        fieldErrors: isFieldErrors(body.details) ? body.details : undefined,
      });
      return;
    }

    setSubmitState({ kind: "error", message: "Couldn't send the transport booking." });
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/farmer/transport-search" className={styles.backLink}>
          ← Back to search
        </Link>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading listing…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to view this listing.</p>
          </div>
        )}

        {state.kind === "notFound" && (
          <div className={styles.centerState}>
            <p>This transport listing isn&apos;t available anymore.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className={styles.centerState}>
            <div className={styles.errorBanner}>{state.message}</div>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div className={styles.card}>
              <div className={styles.detailHeader}>
                <div>
                  <div className={styles.detailLocation}>
                    {state.profile.vehicleType} · {state.profile.vehicleNumber}
                  </div>
                  <div className={styles.detailDistrict}>
                    {state.profile.village}, {state.profile.taluka},{" "}
                    {state.profile.district}, {state.profile.state}
                  </div>
                </div>
                <div className={styles.wageBadge}>
                  <span>Rate</span>
                  {state.profile.ratePerKm !== null && (
                    <div>₹{state.profile.ratePerKm.toLocaleString("en-IN")}/km</div>
                  )}
                  {state.profile.ratePerTrip !== null && (
                    <div>₹{state.profile.ratePerTrip.toLocaleString("en-IN")}/trip</div>
                  )}
                </div>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Capacity</span>
                  <span className={styles.detailValue}>
                    {state.profile.capacity.toLocaleString("en-IN")}{" "}
                    {state.profile.capacityUnit}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Mobile</span>
                  <span className={styles.detailValue}>{state.profile.mobile}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Availability</span>
                  <span className={styles.detailValue}>
                    {availability.kind === "idle" && (
                      <>
                        {state.profile.isAvailable ? "Available" : "Not available"}{" "}
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={handleCheckAvailability}
                        >
                          Check now
                        </button>
                      </>
                    )}
                    {availability.kind === "checking" && "Checking…"}
                    {availability.kind === "checked" &&
                      (availability.isAvailable
                        ? "Available right now"
                        : "Currently not available")}
                    {availability.kind === "unknown" && "Couldn't check right now"}
                  </span>
                </div>
                <div className={`${styles.detailItem} ${styles.full}`}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>{state.profile.address}</span>
                </div>
              </div>

              <span className={styles.verifiedTag}>✓ Verified</span>
            </div>

            <RatingSummary userId={state.profile.userId} targetType="TRANSPORT" />

            {availability.kind === "checked" && !availability.isAvailable && (
              <div className={styles.warningBanner}>
                This transport provider has marked themselves unavailable right now. You can
                still send a booking request, but they may not be able to accept it
                immediately.
              </div>
            )}

            {submitState.kind === "success" ? (
              <div className={styles.successBanner}>
                Booking request sent! You can track its status from{" "}
                <Link href="/farmer/transport-bookings">My Transport Bookings</Link>.
              </div>
            ) : (
              <form className={styles.card} onSubmit={handleSubmit}>
                <div className={styles.formTitle}>Request a Booking</div>

                {submitState.kind === "error" && (
                  <div className={styles.errorBanner}>{submitState.message}</div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label htmlFor="goodsType">Goods type</label>
                    <input
                      id="goodsType"
                      type="text"
                      placeholder="Produce transport"
                      required
                      value={form.goodsType}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, goodsType: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.goodsType && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.goodsType[0]}
                      </span>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="bookingDate">Booking date</label>
                    <input
                      id="bookingDate"
                      type="date"
                      required
                      value={form.bookingDate}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, bookingDate: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" &&
                      submitState.fieldErrors?.bookingDate && (
                        <span className={styles.fieldError}>
                          {submitState.fieldErrors.bookingDate[0]}
                        </span>
                      )}
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="pickupLocation">Pickup location</label>
                    <input
                      id="pickupLocation"
                      type="text"
                      placeholder="Farm / village address"
                      required
                      value={form.pickupLocation}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, pickupLocation: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" &&
                      submitState.fieldErrors?.pickupLocation && (
                        <span className={styles.fieldError}>
                          {submitState.fieldErrors.pickupLocation[0]}
                        </span>
                      )}
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="dropLocation">Drop location</label>
                    <input
                      id="dropLocation"
                      type="text"
                      placeholder="Market / mandi address"
                      required
                      value={form.dropLocation}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, dropLocation: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" &&
                      submitState.fieldErrors?.dropLocation && (
                        <span className={styles.fieldError}>
                          {submitState.fieldErrors.dropLocation[0]}
                        </span>
                      )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="rateType">Rate type</label>
                    <select
                      id="rateType"
                      value={form.rateType}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          rateType: e.target.value as TransportRateType,
                        }))
                      }
                    >
                      <option value="PER_KM">Per km</option>
                      <option value="PER_TRIP">Per trip</option>
                    </select>
                    {submitState.kind === "error" && submitState.fieldErrors?.rateType && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.rateType[0]}
                      </span>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="rate">Agreed rate (₹)</label>
                    <input
                      id="rate"
                      type="number"
                      min={1}
                      required
                      value={form.rate}
                      onChange={(e) => setForm((prev) => ({ ...prev, rate: e.target.value }))}
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.rate && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.rate[0]}
                      </span>
                    )}
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="message">Message (optional)</label>
                    <textarea
                      id="message"
                      placeholder="Any instructions for the transport provider"
                      value={form.message}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, message: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={submitState.kind === "submitting"}
                  >
                    {submitState.kind === "submitting" ? "Sending…" : "Send Booking Request"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
