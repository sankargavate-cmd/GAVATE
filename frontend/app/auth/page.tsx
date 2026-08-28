"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, resendVerification, signup } from "@/lib/authApi";
import { setStoredToken } from "@/lib/auth";
import { getLanguageOption, getStoredLanguage, LanguageCode } from "@/lib/language";
import {
  LoginFieldErrors,
  LoginFormInput,
  Role,
  SignupFieldErrors,
  SignupFormInput,
} from "@/types";
import styles from "./auth.module.css";

type Mode = "login" | "signup";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "FARMER", label: "Farmer" },
  { value: "LABOUR", label: "Labour" },
  { value: "TRACTOR_OWNER", label: "Tractor Owner" },
  { value: "MACHINERY_PROVIDER", label: "Machinery Provider" },
  { value: "BUYER", label: "Buyer" },
  { value: "TRANSPORT_PROVIDER", label: "Transport Provider" },
];

function isFieldErrors(details: unknown): details is Record<string, string[]> {
  return typeof details === "object" && details !== null;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [language, setLanguage] = useState<LanguageCode>("en");

  useEffect(() => {
    setLanguage(getStoredLanguage() ?? "en");
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Step 2 of 2</div>
        <h1 className={styles.title}>
          {mode === "login" ? "Log in to your account" : "Create your account"}
        </h1>

        <div className={styles.languageChip}>
          {getLanguageOption(language).nativeLabel}
          <button type="button" onClick={() => router.push("/")}>
            Change
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
            onClick={() => setMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === "signup" ? styles.tabActive : ""}`}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <div className={styles.card}>
          {mode === "login" ? (
            <LoginForm onSwitchToSignup={() => setMode("signup")} />
          ) : (
            <SignupForm
              language={language}
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function LoginForm({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<LoginFormInput>({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setNeedsVerification(false);
    setResendStatus("idle");

    let result: Awaited<ReturnType<typeof login>>;
    try {
      result = await login(form);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setStoredToken(body.data.accessToken);
      setSubmitting(false);
      if (body.data.user.role === "FARMER") {
        router.push("/farmer/dashboard");
      } else if (body.data.user.role === "LABOUR") {
        router.push("/labour/dashboard");
      } else if (body.data.user.role === "TRACTOR_OWNER") {
        router.push("/tractor/dashboard");
      } else if (body.data.user.role === "TRANSPORT_PROVIDER") {
        router.push("/transport/dashboard");
      } else if (body.data.user.role === "BUYER") {
        router.push("/buyer/dashboard");
      } else if (body.data.user.role === "ADMIN") {
        router.push("/admin/labour-verification");
      } else if (body.data.user.role === "SUPER_ADMIN") {
        router.push("/super-admin/admins");
      } else {
        // Other role dashboards aren't built yet — land somewhere honest
        // rather than a broken route.
        router.push("/");
      }
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    if (status === 403 && !body.success && body.message.toLowerCase().includes("verify")) {
      setNeedsVerification(true);
      setSubmitting(false);
      return;
    }

    setError(!body.success ? body.message : "Couldn't log in.");
    setSubmitting(false);
  }

  async function handleResend() {
    setResendStatus("sending");
    try {
      const result = await resendVerification(form.email);
      setResendStatus(result.body.success ? "sent" : "error");
    } catch {
      setResendStatus("error");
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error && <div className={styles.formBanner}>{error}</div>}

      {needsVerification && (
        <div className={styles.infoBanner}>
          Please verify your email before logging in.
          {resendStatus === "sent" ? (
            <> A new verification link has been sent to {form.email}.</>
          ) : (
            <>
              {" "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleResend}
                disabled={resendStatus === "sending"}
                style={{ display: "inline", padding: 0 }}
              >
                {resendStatus === "sending"
                  ? "Sending…"
                  : "Resend verification email"}
              </button>
              {resendStatus === "error" && (
                <span className={styles.fieldError}>
                  {" "}
                  Couldn&apos;t resend right now. Try again shortly.
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email && (
          <span className={styles.fieldError}>{fieldErrors.email[0]}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="login-password">Password</label>
        <div className={styles.passwordRow}>
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            type="button"
            className={styles.toggleVisibility}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {fieldErrors.password && (
          <span className={styles.fieldError}>{fieldErrors.password[0]}</span>
        )}
      </div>

      <button type="submit" className={styles.submitButton} disabled={submitting}>
        {submitting ? "Logging in…" : "Log in"}
      </button>

      <button type="button" className={styles.linkButton} onClick={onSwitchToSignup}>
        New here? Create an account
      </button>
    </form>
  );
}

function SignupForm({
  language,
  onSwitchToLogin,
}: {
  language: LanguageCode;
  onSwitchToLogin: () => void;
}) {
  const [form, setForm] = useState<Omit<SignupFormInput, "preferredLanguage">>({
    fullName: "",
    email: "",
    password: "",
    role: "FARMER",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof signup>>;
    try {
      result = await signup({ ...form, preferredLanguage: language });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      setCreatedEmail(body.data.email);
      setSubmitting(false);
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    setError(!body.success ? body.message : "Couldn't create your account.");
    setSubmitting(false);
  }

  async function handleResend() {
    if (!createdEmail) return;
    setResendStatus("sending");
    try {
      const result = await resendVerification(createdEmail);
      setResendStatus(result.body.success ? "sent" : "error");
    } catch {
      setResendStatus("error");
    }
  }

  if (createdEmail) {
    return (
      <div className={styles.successState}>
        <div className={styles.infoBanner}>
          Account created! We&apos;ve sent a verification link to{" "}
          <strong>{createdEmail}</strong>. Verify your email, then log in.
        </div>
        <button
          type="button"
          className={styles.linkButton}
          onClick={handleResend}
          disabled={resendStatus === "sending"}
        >
          {resendStatus === "sending"
            ? "Sending…"
            : resendStatus === "sent"
            ? "Verification email sent again"
            : "Didn't get it? Resend email"}
        </button>
        {resendStatus === "error" && (
          <span className={styles.fieldError}>
            Couldn&apos;t resend right now. Try again shortly.
          </span>
        )}
        <button type="button" className={styles.submitButton} onClick={onSwitchToLogin}>
          Go to login
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error && <div className={styles.formBanner}>{error}</div>}

      <div className={styles.field}>
        <label htmlFor="signup-name">Full name</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
          aria-invalid={Boolean(fieldErrors.fullName)}
        />
        {fieldErrors.fullName && (
          <span className={styles.fieldError}>{fieldErrors.fullName[0]}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email && (
          <span className={styles.fieldError}>{fieldErrors.email[0]}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="signup-password">Password</label>
        <div className={styles.passwordRow}>
          <input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            type="button"
            className={styles.toggleVisibility}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <span className={styles.hint}>
          At least 8 characters, with a letter and a number.
        </span>
        {fieldErrors.password && (
          <span className={styles.fieldError}>{fieldErrors.password[0]}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="signup-role">I am a</label>
        <select
          id="signup-role"
          value={form.role}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, role: e.target.value as Role }))
          }
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldErrors.role && (
          <span className={styles.fieldError}>{fieldErrors.role[0]}</span>
        )}
      </div>

      <button type="submit" className={styles.submitButton} disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </button>

      <button type="button" className={styles.linkButton} onClick={onSwitchToLogin}>
        Already have an account? Log in
      </button>
    </form>
  );
}
