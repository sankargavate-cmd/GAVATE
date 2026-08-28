"use client";

import { useEffect, useState } from "react";
import {
  AUTH_REQUIRED,
  cancelTractorBooking,
  listMyTractorBookings,
} from "@/lib/tractorBooking";
import { AUTH_REQUIRED as RATING_AUTH_REQUIRED, listGivenRatings } from "@/lib/rating";
import RatingWidget from "@/components/rating/RatingWidget";
import { Rating, TractorBooking, TractorBookingStatus } from "@/types";
import styles from "./tractor-bookings.module.css";

// Mirrors resolveRateableEngagement's TRACTOR branch in the backend's
// rating.service.ts: a tractor booking only counts as "completed" (and
// thus rateable) once it's ACCEPTED and its scheduled date has passed.
function isRateable(booking: TractorBooking): boolean {
  return booking.status === "ACCEPTED" && new Date(booking.bookingDate) <= new Date();
}

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: TractorBooking[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

const STATUS_OPTIONS: Array<{ label: string; value: TractorBookingStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function FarmerTractorBookingsPage() {
  const [statusFilter, setStatusFilter] = useState<TractorBookingStatus | "">("");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Ratings the farmer has already left, keyed by tractorBookingId — fetched
  // separately from the list above so an existing rating renders as a
  // read-only summary instead of the "Rate" button (duplicate prevention).
  const [givenRatings, setGivenRatings] = useState<Map<string, Rating>>(new Map());

  async function loadGivenRatings() {
    let result: Awaited<ReturnType<typeof listGivenRatings>>;
    try {
      result = await listGivenRatings({ targetType: "TRACTOR", limit: 50 });
    } catch {
      return; // Non-critical: the Rate button just won't know about existing ratings yet.
    }

    if (result === RATING_AUTH_REQUIRED) return;

    const { status: httpStatus, body } = result;
    if (httpStatus === 200 && body.success) {
      const map = new Map<string, Rating>();
      for (const rating of body.data) {
        if (rating.tractorBookingId) {
          map.set(rating.tractorBookingId, rating);
        }
      }
      setGivenRatings(map);
    }
  }

  async function load(page: number, status: TractorBookingStatus | "") {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof listMyTractorBookings>>;
    try {
      result = await listMyTractorBookings({
        status: status || undefined,
        page,
        limit: 10,
      });
    } catch {
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    if (result === AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status: httpStatus, body } = result;

    if (httpStatus === 200 && body.success) {
      setState({ kind: "results", items: body.data, pagination: body.pagination });
      loadGivenRatings();
      return;
    }

    if (httpStatus === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load your tractor bookings.",
    });
  }

  useEffect(() => {
    load(1, statusFilter);
    // Re-runs whenever the status filter changes; page always resets to 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCancel(id: string) {
    setCancellingId(id);

    let result: Awaited<ReturnType<typeof cancelTractorBooking>>;
    try {
      result = await cancelTractorBooking(id);
    } catch {
      setCancellingId(null);
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    setCancellingId(null);

    if (result === AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status: httpStatus } = result;

    if (httpStatus === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    // Refresh the current view regardless of outcome, so status/errors
    // from the backend (e.g. already-terminal booking) surface naturally.
    if (state.kind === "results") {
      await load(state.pagination.page, statusFilter);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <h1 className={styles.title}>My Tractor Bookings</h1>
        <p className={styles.subtitle}>
          Track the tractor bookings you&apos;ve requested, and cancel any you no longer
          need.
        </p>

        <div className={styles.filterRow}>
          <label htmlFor="statusFilter">Status</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TractorBookingStatus | "")}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading tractor bookings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to view your tractor bookings.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className={styles.centerState}>
            <div className={styles.errorBanner}>{state.message}</div>
          </div>
        )}

        {state.kind === "results" && (
          <>
            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>
                  No tractor bookings {statusFilter ? "with this status " : ""}yet. Find
                  a tractor and send a booking request to get started.
                </p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((booking) => (
                  <div key={booking.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.workType}>{booking.workType}</div>
                        <div className={styles.counterparty}>
                          {booking.tractorOwner.fullName}
                          {booking.tractorOwner.tractorProfile
                            ? ` · ${booking.tractorOwner.tractorProfile.tractorType} · ${booking.tractorOwner.tractorProfile.mobile}`
                            : ""}
                        </div>
                      </div>
                      <span className={`${styles.badge} ${styles[`badge${booking.status}`]}`}>
                        {booking.status}
                      </span>
                    </div>

                    <div className={styles.detailGrid}>
                      <div>
                        <strong>Date:</strong>{" "}
                        {new Date(booking.bookingDate).toLocaleDateString("en-IN")}
                      </div>
                      <div>
                        <strong>Rate:</strong> ₹{booking.rate.toLocaleString("en-IN")}{" "}
                        {booking.rateType === "HOURLY" ? "/hr" : "/day"}
                      </div>
                      <div>
                        <strong>Location:</strong> {booking.location}
                      </div>
                    </div>

                    {booking.message && (
                      <div className={styles.message}>{booking.message}</div>
                    )}

                    {(booking.status === "PENDING" || booking.status === "ACCEPTED") && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          disabled={cancellingId === booking.id}
                          onClick={() => handleCancel(booking.id)}
                        >
                          {cancellingId === booking.id ? "Cancelling…" : "Cancel booking"}
                        </button>
                      </div>
                    )}

                    {isRateable(booking) && (
                      <div className={styles.ratingSection}>
                        <RatingWidget
                          targetType="TRACTOR"
                          referenceId={booking.id}
                          rateeName={booking.tractorOwner.fullName}
                          existingRating={givenRatings.get(booking.id) ?? null}
                          onRatingSubmitted={(rating) =>
                            setGivenRatings((prev) => new Map(prev).set(booking.id, rating))
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {state.pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page <= 1}
                  onClick={() => load(state.pagination.page - 1, statusFilter)}
                >
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {state.pagination.page} of {state.pagination.totalPages}
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page >= state.pagination.totalPages}
                  onClick={() => load(state.pagination.page + 1, statusFilter)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
