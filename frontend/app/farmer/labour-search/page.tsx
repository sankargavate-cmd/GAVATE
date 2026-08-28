"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, searchLabour } from "@/lib/labour";
import { LabourProfile, LabourSearchFilters } from "@/types";
import styles from "./labour-search.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: LabourProfile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface FilterForm {
  skills: string;
  state: string;
  district: string;
  minWage: string;
  maxWage: string;
}

const EMPTY_FILTERS: FilterForm = {
  skills: "",
  state: "",
  district: "",
  minWage: "",
  maxWage: "",
};

function toApiFilters(form: FilterForm, page: number): LabourSearchFilters {
  return {
    skills: form.skills.trim()
      ? form.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    state: form.state.trim() || undefined,
    district: form.district.trim() || undefined,
    minWage: form.minWage.trim() !== "" ? Number(form.minWage) : undefined,
    maxWage: form.maxWage.trim() !== "" ? Number(form.maxWage) : undefined,
    page,
    limit: 10,
  };
}

export default function FarmerLabourSearchPage() {
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  async function runSearch(filters: LabourSearchFilters) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof searchLabour>>;
    try {
      result = await searchLabour(filters);
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
      message: !body.success ? body.message : "Couldn't load labour listings.",
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
        <h1 className={styles.title}>Find Labour</h1>
        <p className={styles.subtitle}>
          Browse verified labour who are currently available for work.
        </p>

        <form className={styles.filterCard} onSubmit={handleSubmit}>
          <div className={styles.filterGrid}>
            <div className={styles.field}>
              <label htmlFor="skills">Skills</label>
              <input
                id="skills"
                type="text"
                placeholder="harvesting, weeding"
                value={form.skills}
                onChange={(e) => setForm((prev) => ({ ...prev, skills: e.target.value }))}
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
              <label htmlFor="minWage">Min daily wage (₹)</label>
              <input
                id="minWage"
                type="number"
                min={0}
                value={form.minWage}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, minWage: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="maxWage">Max daily wage (₹)</label>
              <input
                id="maxWage"
                type="number"
                min={0}
                value={form.maxWage}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, maxWage: e.target.value }))
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
            <span>Loading labour listings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to search for labour.</p>
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
              {state.pagination.total} verified labour available
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No labour match these filters yet. Try widening your search.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((labour) => (
                  <div key={labour.id} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div>
                        <div className={styles.resultLocation}>
                          {labour.village}, {labour.taluka}
                        </div>
                        <div className={styles.resultDistrict}>
                          {labour.district}, {labour.state}
                        </div>
                      </div>
                      <div className={styles.wageBadge}>
                        <span>Daily wage</span>₹
                        {labour.dailyWage.toLocaleString("en-IN")}
                      </div>
                    </div>

                    {labour.skills.length > 0 && (
                      <div className={styles.chipRow}>
                        {labour.skills.map((skill) => (
                          <span key={skill} className={styles.chip}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={styles.resultFooter}>
                      <span className={styles.verifiedTag}>✓ Verified</span>
                      {labour.experienceYears !== null && (
                        <span>
                          {labour.experienceYears} yr
                          {labour.experienceYears === 1 ? "" : "s"} experience
                        </span>
                      )}
                      <span>{labour.mobile}</span>
                    </div>

                    <Link
                      href={`/farmer/labour-search/${labour.id}`}
                      className={styles.primaryButton}
                    >
                      View profile & send request
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
