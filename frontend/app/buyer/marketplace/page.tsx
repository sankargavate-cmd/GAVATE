"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, searchProduceListings } from "@/lib/produce";
import {
  PRODUCE_UNIT_LABELS,
  PRODUCE_UNITS,
  ProduceSearchFilters,
  ProduceUnit,
  PublicProduceListing,
} from "@/types";
import styles from "./marketplace.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: PublicProduceListing[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface FilterForm {
  crop: string;
  location: string;
  unit: ProduceUnit | "";
  minPrice: string;
  maxPrice: string;
}

const EMPTY_FILTERS: FilterForm = {
  crop: "",
  location: "",
  unit: "",
  minPrice: "",
  maxPrice: "",
};

function toApiFilters(form: FilterForm, page: number): ProduceSearchFilters {
  return {
    crop: form.crop.trim() || undefined,
    location: form.location.trim() || undefined,
    unit: form.unit || undefined,
    minPrice: form.minPrice.trim() !== "" ? Number(form.minPrice) : undefined,
    maxPrice: form.maxPrice.trim() !== "" ? Number(form.maxPrice) : undefined,
    page,
    limit: 10,
  };
}

export default function BuyerMarketplacePage() {
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  async function runSearch(filters: ProduceSearchFilters) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof searchProduceListings>>;
    try {
      result = await searchProduceListings(filters);
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

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "results", items: body.data, pagination: body.pagination });
      return;
    }

    if (status === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load produce listings.",
    });
  }

  useEffect(() => {
    runSearch(toApiFilters(EMPTY_FILTERS, 1));
    // Runs once on mount to show an initial unfiltered page of results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(toApiFilters(form, 1));
  }

  function handleReset() {
    setForm(EMPTY_FILTERS);
    runSearch(toApiFilters(EMPTY_FILTERS, 1));
  }

  function goToPage(page: number) {
    runSearch(toApiFilters(form, page));
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <h1 className={styles.title}>Produce Marketplace</h1>
        <p className={styles.subtitle}>
          Browse fresh produce listed by verified farmers near you.
        </p>

        <form className={styles.filterCard} onSubmit={handleSubmit}>
          <div className={styles.filterGrid}>
            <div className={styles.field}>
              <label htmlFor="crop">Crop</label>
              <input
                id="crop"
                type="text"
                placeholder="Onion, Wheat…"
                value={form.crop}
                onChange={(e) => setForm((prev) => ({ ...prev, crop: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="location">Location</label>
              <input
                id="location"
                type="text"
                placeholder="Pune, Maharashtra"
                value={form.location}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, location: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="unit">Unit</label>
              <select
                id="unit"
                value={form.unit}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, unit: e.target.value as ProduceUnit | "" }))
                }
              >
                <option value="">Any</option>
                {PRODUCE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCE_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="minPrice">Min price (₹)</label>
              <input
                id="minPrice"
                type="number"
                min={0}
                value={form.minPrice}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, minPrice: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="maxPrice">Max price (₹)</label>
              <input
                id="maxPrice"
                type="number"
                min={0}
                value={form.maxPrice}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, maxPrice: e.target.value }))
                }
              />
            </div>
          </div>
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Search
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              Clear filters
            </button>
          </div>
        </form>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading produce listings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a buyer to browse the marketplace.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className={styles.centerState}>
            <div className={styles.errorBanner}>{state.message}</div>
          </div>
        )}

        {state.kind === "results" && (
          <>
            <p className={styles.resultMeta}>
              {state.pagination.total} listing{state.pagination.total === 1 ? "" : "s"}{" "}
              from verified farmers
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No produce match these filters yet. Try widening your search.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/buyer/marketplace/${listing.id}`}
                    className={styles.resultCard}
                  >
                    <div className={styles.resultHeader}>
                      <div>
                        <div className={styles.resultCrop}>{listing.crop}</div>
                        <div className={styles.resultLocation}>{listing.location}</div>
                      </div>
                      <div className={styles.priceBadge}>
                        <span>Price / {PRODUCE_UNIT_LABELS[listing.unit]}</span>₹
                        {listing.price.toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div className={styles.resultFooter}>
                      <span className={styles.verifiedTag}>✓ Verified farmer</span>
                      <span>
                        {listing.quantity.toLocaleString("en-IN")}{" "}
                        {PRODUCE_UNIT_LABELS[listing.unit]} available
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {state.pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page <= 1}
                  onClick={() => goToPage(state.pagination.page - 1)}
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
                  onClick={() => goToPage(state.pagination.page + 1)}
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
