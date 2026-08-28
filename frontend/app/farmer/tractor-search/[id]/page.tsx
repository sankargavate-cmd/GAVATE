"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  AUTH_REQUIRED as TRACTOR_AUTH_REQUIRED,
  fetchTractorAvailability,
  fetchTractorById,
} from "@/lib/tractor";
import {
  AUTH_REQUIRED as BOOKING_AUTH_REQUIRED,
  createTractorBooking,
} from "@/lib/tractorBooking";
import RatingSummary from "@/components/rating/RatingSummary";
import {
  TractorBookingFieldErrors,
  TractorBookingFormInput,
  TractorProfile,
  TractorRateType,
} from "@/types";
import styles from "./tractor-profile.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: TractorProfile };

type AvailabilityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked"; isAvailable: boolean }
  | { kind: "unknown" };

interface RequestForm {
  workType: string;
  bookingDate: string;
  location: string;
  rateType: TractorRateType;
  rate: string;
  message: string;
}

const EMPTY_FORM: RequestForm = {
  workType: "",
  bookingDate: "",
  location: "",
  rateType: "HOURLY",
  rate: "",
  message: "",
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fieldErrors?: TractorBookingFieldErrors };

// Mirrors isFieldErrors in app/farmer/labour-search/[id]/page.tsx — narrows
// the untyped `details` field of a failed API response before trusting its
// shape.
function isFieldErrors(details: unknown): details is TractorBookingFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function FarmerTractorDetailsPage() {
  const params = useParams<{ id: string }>();

  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "idle" });
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });

      let result: Awaited<ReturnType<typeof fetchTractorById>>;
      try {
        result = await fetchTractorById(params.id);
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

      if (result === TRACTOR_AUTH_REQUIRED) {
        setState({ kind: "authRequired" });
        return;
      }

      const { status, body } = result;

      if (status === 200 && body.success) {
        setState({ kind: "ready", profile: body.data });
        // Seed the booking form's rate/rateType with whichever rate the
        // owner actually publishes, so the field isn't left at a default
        // that doesn't apply to this listing.
        setForm((prev) => ({
          ...prev,
          rateType: body.data.ratePerHour !== null ? "HOURLY" : "DAILY",
          rate:
            body.data.ratePerHour !== null
              ? String(body.data.ratePerHour)
              : body.data.ratePerDay !== null
              ? String(body.data.ratePerDay)
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

    let result: Awaited<ReturnType<typeof fetchTractorAvailability>>;
    try {
      result = await fetchTractorAvailability(params.id);
    } catch {
      setAvailability({ kind: "unknown" });
      return;
    }

    if (result === TRACTOR_AUTH_REQUIRED) {
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

    const input: TractorBookingFormInput = {
      tractorOwnerId: state.profile.userId,
      workType: form.workType.trim(),
      bookingDate: form.bookingDate,
      location: form.location.trim(),
      rateType: form.rateType,
      rate: Number(form.rate),
      message: form.message.trim() || undefined,
    };

    let result: Awaited<ReturnType<typeof createTractorBooking>>;
    try {
      result = await createTractorBooking(input);
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

    setSubmitState({ kind: "error", message: "Couldn't send the tractor booking." });
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/farmer/tractor-search" className={styles.backLink}>
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
            <p>This tractor listing isn&apos;t available anymore.</p>
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
                    {state.profile.tractorType} · {state.profile.model}
                  </div>
                  <div className={styles.detailDistrict}>
                    {state.profile.village}, {state.profile.taluka},{" "}
                    {state.profile.district}, {state.profile.state}
                  </div>
                </div>
                <div className={styles.wageBadge}>
                  <span>Rate</span>
                  {state.profile.ratePerHour !== null && (
                    <div>₹{state.profile.ratePerHour.toLocaleString("en-IN")}/hr</div>
                  )}
                  {state.profile.ratePerDay !== null && (
                    <div>₹{state.profile.ratePerDay.toLocaleString("en-IN")}/day</div>
                  )}
                </div>
              </div>

              <div className={styles.detailGrid}>
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

            <RatingSummary userId={state.profile.userId} targetType="TRACTOR" />

            {availability.kind === "checked" && !availability.isAvailable && (
              <div className={styles.warningBanner}>
                This tractor owner has marked themselves unavailable right now. You can
                still send a booking request, but they may not be able to accept it
                immediately.
              </div>
            )}

            {submitState.kind === "success" ? (
              <div className={styles.successBanner}>
                Booking request sent! You can track its status from{" "}
                <Link href="/farmer/tractor-bookings">My Tractor Bookings</Link>.
              </div>
            ) : (
              <form className={styles.card} onSubmit={handleSubmit}>
                <div className={styles.formTitle}>Request a Booking</div>

                {submitState.kind === "error" && (
                  <div className={styles.errorBanner}>{submitState.message}</div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label htmlFor="workType">Work type</label>
                    <input
                      id="workType"
                      type="text"
                      placeholder="Ploughing"
                      required
                      value={form.workType}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, workType: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.workType && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.workType[0]}
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
                    <label htmlFor="location">Location</label>
                    <input
                      id="location"
                      type="text"
                      placeholder="Field address / village"
                      required
                      value={form.location}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, location: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.location && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.location[0]}
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
                          rateType: e.target.value as TractorRateType,
                        }))
                      }
                    >
                      <option value="HOURLY">Hourly</option>
                      <option value="DAILY">Daily</option>
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
                      placeholder="Any instructions for the tractor owner"
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
