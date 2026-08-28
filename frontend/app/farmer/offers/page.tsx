"use client";

import { useEffect, useState } from "react";
import {
  AUTH_REQUIRED,
  listMyProduceOffers,
  respondToProduceOffer,
} from "@/lib/produceOffer";
import { OfferStatus, PRODUCE_UNIT_LABELS, ProduceOffer } from "@/types";
import styles from "./offers.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: ProduceOffer[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

const STATUS_OPTIONS: Array<{ label: string; value: OfferStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Withdrawn", value: "WITHDRAWN" },
];

export default function FarmerOffersPage() {
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "">("");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function load(page: number, status: OfferStatus | "") {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof listMyProduceOffers>>;
    try {
      result = await listMyProduceOffers({ status: status || undefined, page, limit: 10 });
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
      return;
    }

    if (httpStatus === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load your offers.",
    });
  }

  useEffect(() => {
    load(1, statusFilter);
    // Re-runs whenever the status filter changes; page always resets to 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleRespond(id: string, action: "ACCEPT" | "REJECT") {
    setRespondingId(id);

    let result: Awaited<ReturnType<typeof respondToProduceOffer>>;
    try {
      result = await respondToProduceOffer(id, action);
    } catch {
      setRespondingId(null);
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    setRespondingId(null);

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
    // from the backend (e.g. already-answered offer) surface naturally.
    if (state.kind === "results") {
      await load(state.pagination.page, statusFilter);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <h1 className={styles.title}>Produce Offers</h1>
        <p className={styles.subtitle}>
          Review offers buyers have made on your produce listings, and accept or reject
          them.
        </p>

        <div className={styles.filterRow}>
          <label htmlFor="statusFilter">Status</label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OfferStatus | "")}
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
            <span>Loading offers…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to view offers on your produce.</p>
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
                  No offers {statusFilter ? "with this status " : ""}yet. Offers buyers
                  make on your listings will show up here.
                </p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((offer) => (
                  <div key={offer.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.crop}>{offer.listing.crop}</div>
                        <div className={styles.counterparty}>
                          {offer.buyer.fullName} · {offer.buyer.email}
                        </div>
                      </div>
                      <span className={`${styles.badge} ${styles[`badge${offer.status}`]}`}>
                        {offer.status}
                      </span>
                    </div>

                    <div className={styles.detailGrid}>
                      <div>
                        <strong>Offer price:</strong> ₹{offer.offerPrice.toLocaleString("en-IN")}{" "}
                        / {PRODUCE_UNIT_LABELS[offer.listing.unit]}
                      </div>
                      <div>
                        <strong>Quantity:</strong> {offer.quantity.toLocaleString("en-IN")}{" "}
                        {PRODUCE_UNIT_LABELS[offer.listing.unit]}
                      </div>
                      <div>
                        <strong>Your listed price:</strong> ₹
                        {offer.listing.price.toLocaleString("en-IN")} /{" "}
                        {PRODUCE_UNIT_LABELS[offer.listing.unit]}
                      </div>
                      <div>
                        <strong>Available:</strong>{" "}
                        {offer.listing.quantity.toLocaleString("en-IN")}{" "}
                        {PRODUCE_UNIT_LABELS[offer.listing.unit]}
                      </div>
                    </div>

                    {offer.message && <div className={styles.message}>{offer.message}</div>}

                    {offer.status === "PENDING" && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.acceptButton}
                          disabled={respondingId === offer.id}
                          onClick={() => handleRespond(offer.id, "ACCEPT")}
                        >
                          {respondingId === offer.id ? "Saving…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={respondingId === offer.id}
                          onClick={() => handleRespond(offer.id, "REJECT")}
                        >
                          {respondingId === offer.id ? "Saving…" : "Reject"}
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
