"use client";

import { useEffect, useState } from "react";
import {
  AUTH_REQUIRED,
  cancelTransportBooking,
  listMyTransportBookings,
} from "@/lib/transportBooking";
import { AUTH_REQUIRED as RATING_AUTH_REQUIRED, listGivenRatings } from "@/lib/rating";
import RatingWidget from "@/components/rating/RatingWidget";
import { Rating, TransportBooking, TransportBookingStatus } from "@/types";
import styles from "./transport-bookings.module.css";

// Mirrors resolveRateableEngagement's TRANSPORT branch in the backend's
// rating.service.ts: a transport booking only counts as "completed" (and
// thus rateable) once it's ACCEPTED and its scheduled date has passed.
function isRateable(booking: TransportBooking): boolean {
  return booking.status === "ACCEPTED" && new Date(booking.bookingDate) <= new Date();
}

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: TransportBooking[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

const STATUS_OPTIONS: Array<{ label: string; value: TransportBookingStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function FarmerTransportBookingsPage() {
  const [statusFilter, setStatusFilter] = useState<TransportBookingStatus | "">("");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Ratings the farmer has already left, keyed by transportBookingId —
  // fetched separately from the list above so an existing rating renders
  // as a read-only summary instead of the "Rate" button (duplicate
  // prevention).
  const [givenRatings, setGivenRatings] = useState<Map<string, Rating>>(new Map());

  async function loadGivenRatings() {
    let result: Awaited<ReturnType<typeof listGivenRatings>>;
    try {
      result = await listGivenRatings({ targetType: "TRANSPORT", limit: 50 });
    } catch {
      return; // Non-critical: the Rate button just won't know about existing ratings yet.
    }

    if (result === RATING_AUTH_REQUIRED) return;

    const { status: httpStatus, body } = result;
    if (httpStatus === 200 && body.success) {
      const map = new Map<string, Rating>();
      for (const rating of body.data) {
        if (rating.transportBookingId) {
          map.set(rating.transportBookingId, rating);
        }
      }
      setGivenRatings(map);
    }
  }

  async function load(page: number, status: TransportBookingStatus | "") {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof listMyTransportBookings>>;
    try {
      result = await listMyTransportBookings({
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
      message: !body.success ? body.message : "Couldn't load your transport bookings.",
    });
  }

  useEffect(() => {
    load(1, statusFilter);
    // Re-runs whenever the status filter changes; page always resets to 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCancel(id: string) {
    setCancellingId(id);

    let result: Awaited<ReturnType<typeof cancelTransportBooking>>;
    try {
      result = await cancelTransportBooking(id);
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
        <h1 className={styles.title}>My Transport Bookings</h1>
        <p className={styles.subtitle}>
          Track the transport bookings you&apos;ve requested, and cancel any you no longer
          need.
        </p>

        <div className={styles.filterRow}>
          <label htmlFor="statusFilter">Status</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TransportBookingStatus | "")}
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
            <span>Loading transport bookings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to view your transport bookings.</p>
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
                  No transport bookings {statusFilter ? "with this status " : ""}yet. Find
                  a transport provider and send a booking request to get started.
                </p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((booking) => (
                  <div key={booking.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.workType}>{booking.goodsType}</div>
                        <div className={styles.counterparty}>
                          {booking.transportProvider.fullName}
                          {booking.transportProvider.transportProfile
                            ? ` · ${booking.transportProvider.transportProfile.vehicleType} · ${booking.transportProvider.transportProfile.mobile}`
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
                        {booking.rateType === "PER_KM" ? "/km" : "/trip"}
                      </div>
                      <div>
                        <strong>Pickup:</strong> {booking.pickupLocation}
                      </div>
                      <div>
                        <strong>Drop:</strong> {booking.dropLocation}
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
                          targetType="TRANSPORT"
                          referenceId={booking.id}
                          rateeName={booking.transportProvider.fullName}
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
