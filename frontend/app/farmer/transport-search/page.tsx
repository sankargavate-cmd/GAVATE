"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, searchTransportProviders } from "@/lib/transport";
import {
  CAPACITY_UNITS,
  CapacityUnit,
  TransportProfile,
  TransportRateType,
  TransportSearchFilters,
} from "@/types";
import styles from "./transport-search.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: TransportProfile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface FilterForm {
  vehicleType: string;
  state: string;
  district: string;
  capacityUnit: CapacityUnit | "";
  minCapacity: string;
  maxCapacity: string;
  rateType: TransportRateType | "";
  minRate: string;
  maxRate: string;
}

const EMPTY_FILTERS: FilterForm = {
  vehicleType: "",
  state: "",
  district: "",
  capacityUnit: "",
  minCapacity: "",
  maxCapacity: "",
  rateType: "",
  minRate: "",
  maxRate: "",
};

function toApiFilters(form: FilterForm, page: number): TransportSearchFilters {
  return {
    vehicleType: form.vehicleType.trim() || undefined,
    state: form.state.trim() || undefined,
    district: form.district.trim() || undefined,
    capacityUnit: form.capacityUnit || undefined,
    minCapacity: form.minCapacity.trim() !== "" ? Number(form.minCapacity) : undefined,
    maxCapacity: form.maxCapacity.trim() !== "" ? Number(form.maxCapacity) : undefined,
    rateType: form.rateType || undefined,
    minRate: form.minRate.trim() !== "" ? Number(form.minRate) : undefined,
    maxRate: form.maxRate.trim() !== "" ? Number(form.maxRate) : undefined,
    page,
    limit: 10,
  };
}

function rateLabel(transport: TransportProfile): string {
  if (transport.ratePerKm !== null && transport.ratePerTrip !== null) {
    return `₹${transport.ratePerKm.toLocaleString("en-IN")}/km · ₹${transport.ratePerTrip.toLocaleString(
      "en-IN"
    )}/trip`;
  }
  if (transport.ratePerKm !== null) {
    return `₹${transport.ratePerKm.toLocaleString("en-IN")}/km`;
  }
  if (transport.ratePerTrip !== null) {
    return `₹${transport.ratePerTrip.toLocaleString("en-IN")}/trip`;
  }
  return "Rate on request";
}

export default function FarmerTransportSearchPage() {
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  async function runSearch(filters: TransportSearchFilters) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof searchTransportProviders>>;
    try {
      result = await searchTransportProviders(filters);
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
      message: !body.success ? body.message : "Couldn't load transport listings.",
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
        <h1 className={styles.title}>Find Transport</h1>
        <p className={styles.subtitle}>
          Browse verified transport providers who are currently available for hire.
        </p>

        <form className={styles.filterCard} onSubmit={handleSubmit}>
          <div className={styles.filterGrid}>
            <div className={styles.field}>
              <label htmlFor="vehicleType">Vehicle type</label>
              <input
                id="vehicleType"
                type="text"
                placeholder="Mini Truck, Tempo"
                value={form.vehicleType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, vehicleType: e.target.value }))
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
              <label htmlFor="capacityUnit">Capacity unit</label>
              <select
                id="capacityUnit"
                value={form.capacityUnit}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    capacityUnit: e.target.value as CapacityUnit | "",
                  }))
                }
              >
                <option value="">Any</option>
                {CAPACITY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="minCapacity">Min capacity</label>
              <input
                id="minCapacity"
                type="number"
                min={0}
                value={form.minCapacity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, minCapacity: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="maxCapacity">Max capacity</label>
              <input
                id="maxCapacity"
                type="number"
                min={0}
                value={form.maxCapacity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, maxCapacity: e.target.value }))
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
                    rateType: e.target.value as TransportRateType | "",
                  }))
                }
              >
                <option value="">Any</option>
                <option value="PER_KM">Per km</option>
                <option value="PER_TRIP">Per trip</option>
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
            <span>Loading transport listings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to search for transport.</p>
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
              {state.pagination.total} verified transport providers available
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No transport providers match these filters yet. Try widening your search.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((transport) => (
                  <div key={transport.id} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div>
                        <div className={styles.resultLocation}>
                          {transport.village}, {transport.taluka}
                        </div>
                        <div className={styles.resultDistrict}>
                          {transport.district}, {transport.state}
                        </div>
                      </div>
                      <div className={styles.wageBadge}>
                        <span>Rate</span>
                        {rateLabel(transport)}
                      </div>
                    </div>

                    <div className={styles.chipRow}>
                      <span className={styles.chip}>{transport.vehicleType}</span>
                      <span className={styles.chip}>
                        {transport.capacity.toLocaleString("en-IN")} {transport.capacityUnit}
                      </span>
                    </div>

                    <div className={styles.resultFooter}>
                      <span className={styles.verifiedTag}>✓ Verified</span>
                      <span>{transport.mobile}</span>
                    </div>

                    <Link
                      href={`/farmer/transport-search/${transport.id}`}
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
