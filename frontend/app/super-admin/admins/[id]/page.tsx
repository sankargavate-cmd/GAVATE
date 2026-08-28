"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  activateAdmin,
  assignPermissions,
  AUTH_REQUIRED,
  deactivateAdmin,
  getAdmin,
  removeAdmin,
  resetAdminPassword,
} from "@/lib/superAdminAdmins";
import { getStoredRole, getStoredToken } from "@/lib/auth";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  AdminPermission,
  AdminWithProfile,
} from "@/types";
import styles from "../admins.module.css";

type Guard = "checking" | "noToken" | "forbidden" | "ok";

type ViewState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; admin: AdminWithProfile };

interface Toast {
  tone: "success" | "error";
  message: string;
}

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [guard, setGuard] = useState<Guard>("checking");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedPermissions, setSelectedPermissions] = useState<AdminPermission[]>([]);
  const [permissionsDirty, setPermissionsDirty] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"generate" | "custom">("generate");
  const [customPassword, setCustomPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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

  async function load() {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof getAdmin>>;
    try {
      result = await getAdmin(id);
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
      setState({ kind: "loaded", admin: body.data });
      setSelectedPermissions(body.data.adminProfile?.permissions ?? []);
      setPermissionsDirty(false);
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

    if (status === 404) {
      setState({ kind: "notFound" });
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load this admin.",
    });
  }

  useEffect(() => {
    if (guard === "ok") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, id]);

  async function handleToggleActive(admin: AdminWithProfile) {
    setBusy(true);
    setToast(null);

    let result: Awaited<ReturnType<typeof activateAdmin>>;
    try {
      result = admin.isActive ? await deactivateAdmin(admin.id) : await activateAdmin(admin.id);
    } catch {
      setBusy(false);
      setToast({ tone: "error", message: "Couldn't reach the server. Please try again." });
      return;
    }

    setBusy(false);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "loaded", admin: body.data });
      setToast({
        tone: "success",
        message: admin.isActive ? "Admin deactivated." : "Admin activated.",
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

    setToast({ tone: "error", message: !body.success ? body.message : "Couldn't update this admin." });
  }

  async function handleRemove(admin: AdminWithProfile) {
    setBusy(true);
    setToast(null);

    let result: Awaited<ReturnType<typeof removeAdmin>>;
    try {
      result = await removeAdmin(admin.id);
    } catch {
      setBusy(false);
      setToast({ tone: "error", message: "Couldn't reach the server. Please try again." });
      return;
    }

    setBusy(false);
    setConfirmRemove(false);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "loaded", admin: body.data });
      setToast({ tone: "success", message: "Admin access removed. This cannot be undone." });
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

    setToast({ tone: "error", message: !body.success ? body.message : "Couldn't remove this admin." });
  }

  function togglePermission(permission: AdminPermission) {
    setSelectedPermissions((prev) => {
      const has = prev.includes(permission);
      const next = has ? prev.filter((p) => p !== permission) : [...prev, permission];
      setPermissionsDirty(true);
      return next;
    });
  }

  async function handleSavePermissions(admin: AdminWithProfile) {
    setBusy(true);
    setToast(null);

    let result: Awaited<ReturnType<typeof assignPermissions>>;
    try {
      result = await assignPermissions(admin.id, selectedPermissions);
    } catch {
      setBusy(false);
      setToast({ tone: "error", message: "Couldn't reach the server. Please try again." });
      return;
    }

    setBusy(false);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "loaded", admin: body.data });
      setSelectedPermissions(body.data.adminProfile?.permissions ?? []);
      setPermissionsDirty(false);
      setToast({ tone: "success", message: "Permissions updated." });
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

    setToast({ tone: "error", message: !body.success ? body.message : "Couldn't update permissions." });
  }

  function openReset() {
    setResetOpen(true);
    setResetMode("generate");
    setCustomPassword("");
    setResetError(null);
    setTempPassword(null);
  }

  function closeReset() {
    setResetOpen(false);
    setCustomPassword("");
    setResetError(null);
    setTempPassword(null);
  }

  async function handleConfirmReset(admin: AdminWithProfile) {
    setResetError(null);

    if (resetMode === "custom") {
      if (customPassword.trim().length < 8) {
        setResetError("Password must be at least 8 characters, with a letter and a number.");
        return;
      }
    }

    setBusy(true);

    let result: Awaited<ReturnType<typeof resetAdminPassword>>;
    try {
      result = await resetAdminPassword(admin.id, {
        newPassword: resetMode === "custom" ? customPassword : undefined,
      });
    } catch {
      setBusy(false);
      setResetError("Couldn't reach the server. Please try again.");
      return;
    }

    setBusy(false);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "loaded", admin: body.data.admin });
      setTempPassword(body.data.temporaryPassword);
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

    setResetError(!body.success ? body.message : "Couldn't reset the password.");
  }

  if (guard === "checking" || (guard === "ok" && state.kind === "loading")) {
    return (
      <main className={styles.page}>
        <div className={styles.narrowContainer}>
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
        <div className={styles.narrowContainer}>
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
        <div className={styles.narrowContainer}>
          <div className={styles.centerState}>
            <p>Only super admin accounts can access Admin management.</p>
          </div>
        </div>
      </main>
    );
  }

  if (state.kind === "notFound") {
    return (
      <main className={styles.page}>
        <div className={styles.narrowContainer}>
          <Link href="/super-admin/admins" className={styles.backLink}>
            ← Back to admins
          </Link>
          <div className={styles.centerState}>
            <p>This admin doesn&apos;t exist or is not an admin account.</p>
          </div>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className={styles.page}>
        <div className={styles.narrowContainer}>
          <Link href="/super-admin/admins" className={styles.backLink}>
            ← Back to admins
          </Link>
          <div className={styles.errorBanner}>{state.message}</div>
        </div>
      </main>
    );
  }

  if (state.kind !== "loaded") {
    return null;
  }

  const { admin } = state;
  const status = statusOf(admin);
  const removed = status === "removed";

  return (
    <main className={styles.page}>
      <div className={styles.narrowContainer}>
        <Link href="/super-admin/admins" className={styles.backLink}>
          ← Back to admins
        </Link>
        <div className={styles.eyebrow}>Shetkari Sathi Super Admin</div>
        <h1 className={styles.title}>{admin.fullName}</h1>

        {toast && (
          <div className={toast.tone === "success" ? styles.successBanner : styles.errorBanner}>
            {toast.message}
          </div>
        )}

        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <span className={`${styles.statusBadge} ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Email</span>
              <span>{admin.email}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Preferred language</span>
              <span>{admin.preferredLanguage}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Created</span>
              <span>{formatDate(admin.createdAt)}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Last updated</span>
              <span>{formatDate(admin.updatedAt)}</span>
            </div>
            {admin.adminProfile?.mustChangePassword && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Password</span>
                <span>Must change on next login</span>
              </div>
            )}
            {removed && admin.adminProfile?.removedAt && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Removed on</span>
                <span>{formatDate(admin.adminProfile.removedAt)}</span>
              </div>
            )}
          </div>

          {!removed && (
            <div className={styles.cardActions}>
              <button
                type="button"
                className={admin.isActive ? styles.secondaryButton : styles.primaryButton}
                onClick={() => handleToggleActive(admin)}
                disabled={busy}
              >
                {admin.isActive ? "Deactivate" : "Activate"}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={openReset} disabled={busy}>
                Reset password
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
              >
                Remove access
              </button>
            </div>
          )}
        </div>

        {!removed && (
          <div className={styles.detailCard}>
            <div className={styles.sectionTitle}>Permissions</div>
            <div className={styles.checkboxGroup}>
              {ADMIN_PERMISSIONS.map((permission) => (
                <label key={permission} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={selectedPermissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {ADMIN_PERMISSION_LABELS[permission]}
                </label>
              ))}
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => handleSavePermissions(admin)}
                disabled={busy || !permissionsDirty}
              >
                {busy ? "Saving…" : "Save permissions"}
              </button>
            </div>
          </div>
        )}

        {confirmRemove && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <div className={styles.modalTitle}>Remove admin access?</div>
              <p className={styles.modalBody}>
                This permanently revokes {admin.fullName}&apos;s access. It cannot be undone —
                you would need to create a new admin instead.
              </p>
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => handleRemove(admin)}
                  disabled={busy}
                >
                  {busy ? "Removing…" : "Yes, remove access"}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setConfirmRemove(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {resetOpen && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <div className={styles.modalTitle}>Reset password</div>

              {tempPassword ? (
                <>
                  <p className={styles.modalBody}>
                    Share this password with {admin.fullName} through a secure channel. It
                    will not be shown again.
                  </p>
                  <div className={styles.tempPasswordBox}>{tempPassword}</div>
                  <div className={styles.formActions}>
                    <button type="button" className={styles.primaryButton} onClick={closeReset}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.modalBody}>
                    Generate a secure random password, or set a specific one.
                  </p>
                  <div className={styles.checkboxGroup} style={{ marginBottom: "1rem" }}>
                    <label className={styles.checkboxRow}>
                      <input
                        type="radio"
                        name="resetMode"
                        checked={resetMode === "generate"}
                        onChange={() => setResetMode("generate")}
                      />
                      Generate a random password
                    </label>
                    <label className={styles.checkboxRow}>
                      <input
                        type="radio"
                        name="resetMode"
                        checked={resetMode === "custom"}
                        onChange={() => setResetMode("custom")}
                      />
                      Set a specific password
                    </label>
                  </div>

                  {resetMode === "custom" && (
                    <div className={styles.field} style={{ marginBottom: "1rem" }}>
                      <input
                        type="text"
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="At least 8 characters, with a letter and a number"
                      />
                    </div>
                  )}

                  {resetError && <div className={styles.fieldError}>{resetError}</div>}

                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => handleConfirmReset(admin)}
                      disabled={busy}
                    >
                      {busy ? "Resetting…" : "Reset password"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={closeReset}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
