"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AUTH_REQUIRED, approveLabour, fetchPendingLabour, rejectLabour } from "@/lib/adminLabour";
import { getStoredRole, getStoredToken } from "@/lib/auth";
import { AdminLabourProfile } from "@/types";
import styles from "./labour-verification.module.css";

const PAGE_SIZE = 10;

type Guard = "checking" | "noToken" | "forbidden" | "ok";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: AdminLabourProfile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface Toast {
  tone: "success" | "error";
  message: string;
}

function statusLabel(status: AdminLabourProfile["verificationStatus"]): string {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending review";
}

function statusClass(
  status: AdminLabourProfile["verificationStatus"]
): string {
  if (status === "APPROVED") return styles.statusApproved;
  if (status === "REJECTED") return styles.statusRejected;
  return styles.statusPending;
}

export default function AdminLabourVerificationPage() {
  const [guard, setGuard] = useState<Guard>("checking");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [toast, setToast] = useState<Toast | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setGuard("noToken");
      return;
    }
    const role = getStoredRole();
    if (role !== "ADMIN") {
      setGuard("forbidden");
      return;
    }
    setGuard("ok");
  }, []);

  async function loadPage(page: number) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof fetchPendingLabour>>;
    try {
      result = await fetchPendingLabour(page, PAGE_SIZE);
    } catch {
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "results", items: body.data, pagination: body.pagination });
      return;
    }

    if (status === 401) {
      setGuard("noToken");
      return;
    }

    if (status === 403) {
      setGuard("forbidden");
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load pending labour profiles.",
    });
  }

  useEffect(() => {
    if (guard === "ok") {
      loadPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard]);

  function removeFromList(id: string) {
    setState((prev) => {
      if (prev.kind !== "results") return prev;
      const items = prev.items.filter((item) => item.id !== id);
      return { ...prev, items };
    });
  }

  async function handleApprove(profile: AdminLabourProfile) {
    setActioningId(profile.id);
    setToast(null);

    let result: Awaited<ReturnType<typeof approveLabour>>;
    try {
      result = await approveLabour(profile.id);
    } catch {
      setActioningId(null);
      setToast({ tone: "error", message: "Couldn't reach the server. Please try again." });
      return;
    }

    setActioningId(null);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      removeFromList(profile.id);
      setToast({
        tone: "success",
        message: `${profile.user.fullName} was approved.`,
      });
      return;
    }

    if (status === 401) {
      setGuard("noToken");
      return;
    }

    if (status === 403) {
      setGuard("forbidden");
      return;
    }

    setToast({
      tone: "error",
      message: !body.success ? body.message : "Couldn't approve this profile.",
    });
  }

  function openReject(id: string) {
    setToast(null);
    setRejectingId(id);
    setRejectReason("");
    setRejectError(null);
  }

  function closeReject() {
    setRejectingId(null);
    setRejectReason("");
    setRejectError(null);
  }

  async function handleConfirmReject(profile: AdminLabourProfile) {
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setRejectError("Please give a reason of at least 5 characters.");
      return;
    }

    setActioningId(profile.id);
    setRejectError(null);

    let result: Awaited<ReturnType<typeof rejectLabour>>;
    try {
      result = await rejectLabour(profile.id, reason);
    } catch {
      setActioningId(null);
      setRejectError("Couldn't reach the server. Please try again.");
      return;
    }

    setActioningId(null);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      removeFromList(profile.id);
      closeReject();
      setToast({
        tone: "success",
        message: `${profile.user.fullName} was rejected.`,
      });
      return;
    }

    if (status === 401) {
      setGuard("noToken");
      return;
    }

    if (status === 403) {
      setGuard("forbidden");
      return;
    }

    setRejectError(!body.success ? body.message : "Couldn't reject this profile.");
  }

  if (guard === "checking") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
          </div>
        </div>
      </main>
    );
  }

  if (guard === "noToken") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.centerState}>
            <p>You need to be logged in as an admin to view this page.</p>
            <Link href="/auth" className={styles.primaryButton}>
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (guard === "forbidden") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.centerState}>
            <p>Only admin accounts can access Labour verification.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi Admin</div>
        <h1 className={styles.title}>Labour Verification</h1>
        <p className={styles.subtitle}>
          Review labour profiles awaiting approval before they appear in farmer search.
        </p>

        {toast && (
          <div
            className={
              toast.tone === "success" ? styles.successBanner : styles.errorBanner
            }
          >
            {toast.message}
          </div>
        )}

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading pending labour profiles…</span>
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
              {state.pagination.total} profile
              {state.pagination.total === 1 ? "" : "s"} awaiting review
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No pending labour profiles right now. You&apos;re all caught up.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((profile) => (
                  <div key={profile.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.name}>{profile.user.fullName}</div>
                        <div className={styles.email}>{profile.user.email}</div>
                      </div>
                      <span className={`${styles.statusBadge} ${statusClass(profile.verificationStatus)}`}>
                        {statusLabel(profile.verificationStatus)}
                      </span>
                    </div>

                    <div className={styles.detailGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Location</span>
                        <span>
                          {profile.village}, {profile.taluka}, {profile.district}, {profile.state}
                        </span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Daily wage</span>
                        <span>₹{profile.dailyWage.toLocaleString("en-IN")}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Mobile</span>
                        <span>{profile.mobile}</span>
                      </div>
                      {profile.experienceYears !== null && (
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Experience</span>
                          <span>
                            {profile.experienceYears} yr
                            {profile.experienceYears === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    </div>

                    {profile.skills.length > 0 && (
                      <div className={styles.chipRow}>
                        {profile.skills.map((skill) => (
                          <span key={skill} className={styles.chip}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {rejectingId === profile.id ? (
                      <div className={styles.rejectForm}>
                        <label htmlFor={`reason-${profile.id}`}>Reason for rejection</label>
                        <textarea
                          id={`reason-${profile.id}`}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Uploaded documents don't match profile details"
                          rows={3}
                        />
                        {rejectError && <div className={styles.inlineError}>{rejectError}</div>}
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => handleConfirmReject(profile)}
                            disabled={actioningId === profile.id}
                          >
                            {actioningId === profile.id ? "Rejecting…" : "Confirm reject"}
                          </button>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={closeReject}
                            disabled={actioningId === profile.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => handleApprove(profile)}
                          disabled={actioningId === profile.id}
                        >
                          {actioningId === profile.id ? "Approving…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => openReject(profile.id)}
                          disabled={actioningId === profile.id}
                        >
                          Reject
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
                  onClick={() => loadPage(state.pagination.page - 1)}
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
                  onClick={() => loadPage(state.pagination.page + 1)}
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
