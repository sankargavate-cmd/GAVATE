"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED as LABOUR_AUTH_REQUIRED, fetchLabourById } from "@/lib/labour";
import { AUTH_REQUIRED as REQUEST_AUTH_REQUIRED, createWorkRequest } from "@/lib/workRequest";
import RatingSummary from "@/components/rating/RatingSummary";
import { LabourProfile, WorkRequestFieldErrors, WorkRequestFormInput } from "@/types";
import styles from "./labour-profile.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: LabourProfile };

interface RequestForm {
  workType: string;
  workDate: string;
  location: string;
  wage: string;
  message: string;
}

const EMPTY_FORM: RequestForm = {
  workType: "",
  workDate: "",
  location: "",
  wage: "",
  message: "",
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string; fieldErrors?: WorkRequestFieldErrors };

// Mirrors isFieldErrors in app/farmer/produce/page.tsx — narrows the
// untyped `details` field of a failed API response before trusting its
// shape.
function isFieldErrors(details: unknown): details is WorkRequestFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function FarmerLabourProfilePage() {
  const params = useParams<{ id: string }>();

  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });

      let result: Awaited<ReturnType<typeof fetchLabourById>>;
      try {
        result = await fetchLabourById(params.id);
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

      if (result === LABOUR_AUTH_REQUIRED) {
        setState({ kind: "authRequired" });
        return;
      }

      const { status, body } = result;

      if (status === 200 && body.success) {
        setState({ kind: "ready", profile: body.data });
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
        message: !body.success ? body.message : "Couldn't load this profile.",
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind !== "ready") return;

    setSubmitState({ kind: "submitting" });

    const input: WorkRequestFormInput = {
      labourId: state.profile.userId,
      workType: form.workType.trim(),
      workDate: form.workDate,
      location: form.location.trim(),
      wage: Number(form.wage),
      message: form.message.trim() || undefined,
    };

    let result: Awaited<ReturnType<typeof createWorkRequest>>;
    try {
      result = await createWorkRequest(input);
    } catch {
      setSubmitState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    if (result === REQUEST_AUTH_REQUIRED) {
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

    setSubmitState({ kind: "error", message: "Couldn't send the work request." });
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/farmer/labour-search" className={styles.backLink}>
          ← Back to search
        </Link>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading profile…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to view this profile.</p>
          </div>
        )}

        {state.kind === "notFound" && (
          <div className={styles.centerState}>
            <p>This labour listing isn&apos;t available anymore.</p>
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
                    {state.profile.village}, {state.profile.taluka}
                  </div>
                  <div className={styles.detailDistrict}>
                    {state.profile.district}, {state.profile.state}
                  </div>
                </div>
                <div className={styles.wageBadge}>
                  <span>Daily wage</span>₹{state.profile.dailyWage.toLocaleString("en-IN")}
                </div>
              </div>

              {state.profile.skills.length > 0 && (
                <div className={styles.chipRow}>
                  {state.profile.skills.map((skill) => (
                    <span key={skill} className={styles.chip}>
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Experience</span>
                  <span className={styles.detailValue}>
                    {state.profile.experienceYears !== null
                      ? `${state.profile.experienceYears} yr${
                          state.profile.experienceYears === 1 ? "" : "s"
                        }`
                      : "Not specified"}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Mobile</span>
                  <span className={styles.detailValue}>{state.profile.mobile}</span>
                </div>
                <div className={`${styles.detailItem} ${styles.full}`}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>{state.profile.address}</span>
                </div>
              </div>

              <span className={styles.verifiedTag}>✓ Verified</span>
            </div>

            <RatingSummary userId={state.profile.userId} targetType="LABOUR" />

            {submitState.kind === "success" ? (
              <div className={styles.successBanner}>
                Work request sent! You can track its status from{" "}
                <Link href="/farmer/work-requests">My Work Requests</Link>.
              </div>
            ) : (
              <form className={styles.card} onSubmit={handleSubmit}>
                <div className={styles.formTitle}>Send Work Request</div>

                {submitState.kind === "error" && (
                  <div className={styles.errorBanner}>{submitState.message}</div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label htmlFor="workType">Work type</label>
                    <input
                      id="workType"
                      type="text"
                      placeholder="Harvesting"
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
                    <label htmlFor="workDate">Work date</label>
                    <input
                      id="workDate"
                      type="date"
                      required
                      value={form.workDate}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, workDate: e.target.value }))
                      }
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.workDate && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.workDate[0]}
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
                    <label htmlFor="wage">Offered wage (₹)</label>
                    <input
                      id="wage"
                      type="number"
                      min={1}
                      required
                      value={form.wage}
                      onChange={(e) => setForm((prev) => ({ ...prev, wage: e.target.value }))}
                    />
                    {submitState.kind === "error" && submitState.fieldErrors?.wage && (
                      <span className={styles.fieldError}>
                        {submitState.fieldErrors.wage[0]}
                      </span>
                    )}
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="message">Message (optional)</label>
                    <textarea
                      id="message"
                      placeholder="Any instructions for the labourer"
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
                    {submitState.kind === "submitting" ? "Sending…" : "Send Work Request"}
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
