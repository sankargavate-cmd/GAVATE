"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  activateAdmin,
  AUTH_REQUIRED,
  deactivateAdmin,
  listAdmins,
} from "@/lib/superAdminAdmins";
import { getStoredRole, getStoredToken } from "@/lib/auth";
import { AdminStatusFilter, AdminWithProfile } from "@/types";
import styles from "./admins.module.css";

const PAGE_SIZE = 10;

type Guard = "checking" | "noToken" | "forbidden" | "ok";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "results";
      items: AdminWithProfile[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

interface Toast {
  tone: "success" | "error";
  message: string;
}

const FILTERS: { value: AdminStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
  { value: "removed", label: "Removed" },
];

function statusOf(admin: AdminWithProfile): "active" | "deactivated" | "removed" {
  if (admin.adminProfile?.removedAt) return "removed";
  if (!admin.isActive) return "deactivated";
  return "active";
}

function statusLabel(status: "active" | "deactivated" | "removed"): string {
  if (status === "active") return "Active";
  if (status === "removed") return "Removed";
  return "Deactivated";
}

function statusClass(status: "active" | "deactivated" | "removed"): string {
  if (status === "active") return styles.statusActive;
  if (status === "removed") return styles.statusRemoved;
  return styles.statusInactive;
}

export default function SuperAdminAdminsListPage() {
  const [guard, setGuard] = useState<Guard>("checking");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [filter, setFilter] = useState<AdminStatusFilter>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setGuard("noToken");
      return;
    }
    const role = getStoredRole();
    if (role !== "SUPER_ADMIN") {
      setGuard("forbidden");
      return;
    }
    setGuard("ok");
  }, []);

  async function loadPage(page: number, status: AdminStatusFilter) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof listAdmins>>;
    try {
      result = await listAdmins(page, PAGE_SIZE, status);
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

    const { status: httpStatus, body } = result;

    if (httpStatus === 200 && body.success) {
      setState({ kind: "results", items: body.data, pagination: body.pagination });
      return;
    }

    if (httpStatus === 401) {
      setGuard("noToken");
      return;
    }

    if (httpStatus === 403) {
      setGuard("forbidden");
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load admins.",
    });
  }

  useEffect(() => {
    if (guard === "ok") {
      loadPage(1, filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, filter]);

  function patchItem(id: string, updated: AdminWithProfile) {
    setState((prev) => {
      if (prev.kind !== "results") return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === id ? updated : item)),
      };
    });
  }

  async function handleToggleActive(admin: AdminWithProfile) {
    const currentlyActive = admin.isActive;
    setActioningId(admin.id);
    setToast(null);

    let result: Awaited<ReturnType<typeof activateAdmin>>;
    try {
      result = currentlyActive
        ? await deactivateAdmin(admin.id)
        : await activateAdmin(admin.id);
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
      patchItem(admin.id, body.data);
      setToast({
        tone: "success",
        message: currentlyActive
          ? `${admin.fullName} was deactivated.`
          : `${admin.fullName} was activated.`,
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
      message: !body.success ? body.message : "Couldn't update this admin.",
    });
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
            <p>You need to be logged in as a super admin to view this page.</p>
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
            <p>Only super admin accounts can access Admin management.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.eyebrow}>Shetkari Sathi Super Admin</div>
            <h1 className={styles.title}>Admins</h1>
            <p className={styles.subtitle}>
              Create, review, and manage access for admin accounts.
            </p>
          </div>
          <Link href="/super-admin/admins/new" className={styles.primaryButton}>
            + Create admin
          </Link>
        </div>

        {toast && (
          <div className={toast.tone === "success" ? styles.successBanner : styles.errorBanner}>
            {toast.message}
          </div>
        )}

        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.filterChip} ${
                filter === f.value ? styles.filterChipActive : ""
              }`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading admins…</span>
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
              {state.pagination.total} admin{state.pagination.total === 1 ? "" : "s"}
            </p>

            {state.items.length === 0 ? (
              <div className={styles.centerState}>
                <p>No admins match this filter.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((admin) => {
                  const status = statusOf(admin);
                  const removed = status === "removed";
                  return (
                    <div key={admin.id} className={styles.card}>
                      <Link
                        href={`/super-admin/admins/${admin.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className={styles.cardHeader}>
                          <div>
                            <div className={styles.name}>{admin.fullName}</div>
                            <div className={styles.email}>{admin.email}</div>
                          </div>
                          <span className={`${styles.statusBadge} ${statusClass(status)}`}>
                            {statusLabel(status)}
                          </span>
                        </div>
                        {admin.adminProfile && admin.adminProfile.permissions.length > 0 && (
                          <div className={styles.metaRow}>
                            {admin.adminProfile.permissions.map((p) => (
                              <span key={p} className={styles.chip}>
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>

                      {!removed && (
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={admin.isActive ? styles.secondaryButton : styles.primaryButton}
                            onClick={() => handleToggleActive(admin)}
                            disabled={actioningId === admin.id}
                          >
                            {actioningId === admin.id
                              ? "Working…"
                              : admin.isActive
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                          <Link
                            href={`/super-admin/admins/${admin.id}`}
                            className={styles.secondaryButton}
                          >
                            Manage
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {state.pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page <= 1}
                  onClick={() => loadPage(state.pagination.page - 1, filter)}
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
                  onClick={() => loadPage(state.pagination.page + 1, filter)}
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
