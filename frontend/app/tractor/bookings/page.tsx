"use client";

import { useEffect, useState } from "react";
import {
  AUTH_REQUIRED as TRACTOR_AUTH_REQUIRED,
  fetchTractorProfile,
  setTractorAvailability,
} from "@/lib/tractor";
import {
  AUTH_REQUIRED as BOOKING_AUTH_REQUIRED,
  listMyTractorBookings,
  respondToTractorBooking,
} from "@/lib/tractorBooking";
import { TractorBooking, TractorBookingStatus } from "@/types";
import styles from "./bookings.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: TractorBooking[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

type AvailabilityState =
  | { kind: "loading" }
  | { kind: "hidden" } // no tractor profile yet, or failed to load — toggle just isn't shown
  | { kind: "ready"; isAvailable: boolean; updating: boolean };

const STATUS_OPTIONS: Array<{ label: string; value: TractorBookingStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function TractorBookingsPage() {
  const [statusFilter, setStatusFilter] = useState<TractorBookingStatus | "">("");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [availability, setAvailabilityState] = useState<AvailabilityState>({
    kind: "loading",
  });

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

    if (result === BOOKING_AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status: httpStatus, body } = result;

    if (httpStatus === 200 && body.success) {
      setState({ kind: "results", items: body.data, pagination: body.pagination });
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

  async function loadAvailability() {
    let result: Awaited<ReturnType<typeof fetchTractorProfile>>;
    try {
      result = await fetchTractorProfile();
    } catch {
      setAvailabilityState({ kind: "hidden" });
      return;
    }

    if (result === TRACTOR_AUTH_REQUIRED) {
      setAvailabilityState({ kind: "hidden" });
      return;
    }

    const { status, body } = result;
    if (status === 200 && body.success) {
      setAvailabilityState({
        kind: "ready",
        isAvailable: body.data.isAvailable,
        updating: false,
      });
    } else {
      setAvailabilityState({ kind: "hidden" });
    }
  }

  useEffect(() => {
    load(1, statusFilter);
    // Re-runs whenever the status filter changes; page always resets to 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    loadAvailability();
  }, []);

  async function handleToggleAvailability() {
    if (availability.kind !== "ready") return;

    const next = !availability.isAvailable;
    setAvailabilityState({ ...availability, updating: true });

    let result: Awaited<ReturnType<typeof setTractorAvailability>>;
    try {
      result = await setTractorAvailability(next);
    } catch {
      setAvailabilityState({ ...availability, updating: false });
      return;
    }

    if (result === TRACTOR_AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;
    if (status === 200 && body.success) {
      setAvailabilityState({
        kind: "ready",
        isAvailable: body.data.isAvailable,
        updating: false,
      });
    } else {
      setAvailabilityState({ ...availability, updating: false });
    }
  }

  async function handleRespond(id: string, action: "ACCEPT" | "REJECT") {
    setRespondingId(id);

    let result: Awaited<ReturnType<typeof respondToTractorBooking>>;
    try {
      result = await respondToTractorBooking(id, action);
    } catch {
      setRespondingId(null);
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    setRespondingId(null);

    if (result === BOOKING_AUTH_REQUIRED) {
      setState({ kind: "authRequired" });
      return;
    }

    const { status: httpStatus } = result;

    if (httpStatus === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    // Refresh the current view regardless of outcome, so status/errors
    // from the backend (e.g. already-answered booking) surface naturally.
    if (state.kind === "results") {
      await load(state.pagination.page, statusFilter);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <h1 className={styles.title}>Tractor Bookings</h1>
        <p className={styles.subtitle}>
          Review booking requests from farmers and accept or reject them.
        </p>

        {availability.kind === "ready" && (
          <div className={styles.availabilityCard}>
            <div>
              <span className={styles.availabilityLabel}>
                {availability.isAvailable ? "Available for hire" : "Not available"}
              </span>
              <span className={styles.availabilityHint}>
                Farmers only see you in search while you&apos;re available.
              </span>
            </div>
            <button
              type="button"
              className={`${styles.toggleButton} ${
                availability.isAvailable ? styles.toggleButtonOn : styles.toggleButtonOff
              }`}
              disabled={availability.updating}
              onClick={handleToggleAvailability}
            >
              {availability.updating
                ? "Updating…"
                : availability.isAvailable
                ? "Mark unavailable"
                : "Mark available"}
            </button>
          </div>
        )}

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
            <p>You need to be logged in as a tractor owner to view your bookings.</p>
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
                  No tractor bookings {statusFilter ? "with this status " : ""}yet. Make
                  sure you&apos;re marked available so farmers can find you.
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
                          {booking.farmer.fullName}
                          {booking.farmer.farmerProfile
                            ? ` · ${booking.farmer.farmerProfile.mobile}`
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

                    {booking.status === "PENDING" && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.acceptButton}
                          disabled={respondingId === booking.id}
                          onClick={() => handleRespond(booking.id, "ACCEPT")}
                        >
                          {respondingId === booking.id ? "Saving…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={respondingId === booking.id}
                          onClick={() => handleRespond(booking.id, "REJECT")}
                        >
                          {respondingId === booking.id ? "Saving…" : "Reject"}
                        </button>
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
