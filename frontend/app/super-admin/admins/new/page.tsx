"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTH_REQUIRED, createAdmin } from "@/lib/superAdminAdmins";
import { getStoredRole, getStoredToken } from "@/lib/auth";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  AdminPermission,
  CreateAdminFieldErrors,
  CreateAdminFormInput,
} from "@/types";
import styles from "../admins.module.css";

type Guard = "checking" | "noToken" | "forbidden" | "ok";

const INITIAL_FORM: CreateAdminFormInput = {
  fullName: "",
  email: "",
  password: "",
  preferredLanguage: "en",
  permissions: [],
};

export default function CreateAdminPage() {
  const router = useRouter();
  const [guard, setGuard] = useState<Guard>("checking");
  const [form, setForm] = useState<CreateAdminFormInput>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<CreateAdminFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  function togglePermission(permission: AdminPermission) {
    setForm((prev) => {
      const has = prev.permissions.includes(permission);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== permission)
          : [...prev.permissions, permission],
      };
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    let result: Awaited<ReturnType<typeof createAdmin>>;
    try {
      result = await createAdmin(form);
    } catch {
      setSubmitting(false);
      setFormError("Couldn't reach the server. Please try again.");
      return;
    }

    setSubmitting(false);

    if (result === AUTH_REQUIRED) {
      setGuard("noToken");
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      router.push(`/super-admin/admins/${body.data.id}`);
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

    if (status === 400 && !body.success && body.details) {
      setFieldErrors(body.details as CreateAdminFieldErrors);
      setFormError("Please fix the errors below.");
      return;
    }

    setFormError(!body.success ? body.message : "Couldn't create this admin.");
  }

  if (guard === "checking") {
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

  return (
    <main className={styles.page}>
      <div className={styles.narrowContainer}>
        <Link href="/super-admin/admins" className={styles.backLink}>
          ← Back to admins
        </Link>
        <div className={styles.eyebrow}>Shetkari Sathi Super Admin</div>
        <h1 className={styles.title}>Create admin</h1>
        <p className={styles.subtitle}>
          The admin can log in immediately with the password you set below.
        </p>

        {formError && <div className={styles.errorBanner}>{formError}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="e.g. Priya Deshmukh"
              required
            />
            {fieldErrors.fullName && (
              <span className={styles.fieldError}>{fieldErrors.fullName[0]}</span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="admin@example.com"
              required
            />
            {fieldErrors.email && (
              <span className={styles.fieldError}>{fieldErrors.email[0]}</span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Initial password</label>
            <input
              id="password"
              type="text"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="At least 8 characters, with a letter and a number"
              required
            />
            <span className={styles.hint}>
              Share this password with the admin through a secure channel.
            </span>
            {fieldErrors.password && (
              <span className={styles.fieldError}>{fieldErrors.password[0]}</span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="preferredLanguage">Preferred language</label>
            <select
              id="preferredLanguage"
              value={form.preferredLanguage}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, preferredLanguage: e.target.value }))
              }
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
            </select>
            {fieldErrors.preferredLanguage && (
              <span className={styles.fieldError}>{fieldErrors.preferredLanguage[0]}</span>
            )}
          </div>

          <div className={styles.field}>
            <label>Permissions</label>
            <div className={styles.checkboxGroup}>
              {ADMIN_PERMISSIONS.map((permission) => (
                <label key={permission} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {ADMIN_PERMISSION_LABELS[permission]}
                </label>
              ))}
            </div>
            {fieldErrors.permissions && (
              <span className={styles.fieldError}>{fieldErrors.permissions[0]}</span>
            )}
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={submitting}>
              {submitting ? "Creating…" : "Create admin"}
            </button>
            <Link href="/super-admin/admins" className={styles.secondaryButton}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
