"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, searchTractors } from "@/lib/tractor";
import { TractorProfile, TractorRateType, TractorSearchFilters } from "@/types";
import styles from "./tractor-search.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: TractorProfile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface FilterForm {
  tractorType: string;
  state: string;
  district: string;
  rateType: TractorRateType | "";
  minRate: string;
  maxRate: string;
}

const EMPTY_FILTERS: FilterForm = {
  tractorType: "",
  state: "",
  district: "",
  rateType: "",
  minRate: "",
  maxRate: "",
};

function toApiFilters(form: FilterForm, page: number): TractorSearchFilters {
  return {
    tractorType: form.tractorType.trim() || undefined,
    state: form.state.trim() || undefined,
    district: form.district.trim() || undefined,
    rateType: form.rateType || undefined,
    minRate: form.minRate.trim() !== "" ? Number(form.minRate) : undefined,
    maxRate: form.maxRate.trim() !== "" ? Number(form.maxRate) : undefined,
    page,
    limit: 10,
  };
}

function rateLabel(tractor: TractorProfile): string {
  if (tractor.ratePerHour !== null && tractor.ratePerDay !== null) {
    return `₹${tractor.ratePerHour.toLocaleString("en-IN")}/hr · ₹${tractor.ratePerDay.toLocaleString(
      "en-IN"
    )}/day`;
  }
  if (tractor.ratePerHour !== null) {
    return `₹${tractor.ratePerHour.toLocaleString("en-IN")}/hr`;
  }
  if (tractor.ratePerDay !== null) {
    return `₹${tractor.ratePerDay.toLocaleString("en-IN")}/day`;
  }
  return "Rate on request";
}

export default function FarmerTractorSearchPage() {
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  async function runSearch(filters: TractorSearchFilters) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof searchTractors>>;
    try {
      result = await searchTractors(filters);
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
      message: !body.success ? body.message : "Couldn't load tractor listings.",
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
        <h1 className={styles.title}>Find a Tractor</h1>
        <p className={styles.subtitle}>
          Browse verified tractor owners who are currently available for hire.
        </p>

        <form className={styles.filterCard} onSubmit={handleSubmit}>
          <div className={styles.filterGrid}>
            <div className={styles.field}>
              <label htmlFor="tractorType">Tractor type</label>
              <input
                id="tractorType"
                type="text"
                placeholder="4WD, Mini Tractor"
                value={form.tractorType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tractorType: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="state">State</label>
              <input
                id="state"
                type="text"
                placeholder="Maharashtra"
                value={form.state}
                onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="district">District</label>
              <input
                id="district"
                type="text"
                placeholder="Pune"
                value={form.district}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, district: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="rateType">Rate type</label>
              <select
                id="rateType"
                value={form.rateType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    rateType: e.target.value as TractorRateType | "",
                  }))
                }
              >
                <option value="">Any</option>
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="minRate">Min rate (₹)</label>
              <input
                id="minRate"
                type="number"
                min={0}
                value={form.minRate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, minRate: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="maxRate">Max rate (₹)</label>
              <input
                id="maxRate"
                type="number"
                min={0}
                value={form.maxRate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, maxRate: e.target.value }))
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
            <span>Loading tractor listings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to search for tractors.</p>
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
              {state.pagination.total} verified tractors available
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No tractors match these filters yet. Try widening your search.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((tractor) => (
                  <div key={tractor.id} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div>
                        <div className={styles.resultLocation}>
                          {tractor.village}, {tractor.taluka}
                        </div>
                        <div className={styles.resultDistrict}>
                          {tractor.district}, {tractor.state}
                        </div>
                      </div>
                      <div className={styles.wageBadge}>
                        <span>Rate</span>
                        {rateLabel(tractor)}
                      </div>
                    </div>

                    <div className={styles.chipRow}>
                      <span className={styles.chip}>{tractor.tractorType}</span>
                      <span className={styles.chip}>{tractor.model}</span>
                    </div>

                    <div className={styles.resultFooter}>
                      <span className={styles.verifiedTag}>✓ Verified</span>
                      <span>{tractor.mobile}</span>
                    </div>

                    <Link
                      href={`/farmer/tractor-search/${tractor.id}`}
                      className={styles.primaryButton}
                    >
                      View details & book
                    </Link>
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
