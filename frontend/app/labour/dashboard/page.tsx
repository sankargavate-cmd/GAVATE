"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { getStoredToken } from "@/lib/auth";
import styles from "./dashboard.module.css";

type AuthState = "checking" | "authRequired" | "ready";

interface DashboardItem {
  key: string;
  label: string;
  description: string;
  icon: ReactNode;
  href?: string; // present only for modules that are actually built
}

// "My Profile" (Step 12) and "Job Requests" (Step 19) are real modules
// now. "Earnings" is a natural next module for a labour account but has
// no backend yet, so it renders as an honest "Coming soon" tile rather
// than linking anywhere.
const DASHBOARD_ITEMS: DashboardItem[] = [
  {
    key: "profile",
    label: "My Profile",
    description: "Skills, daily wage, location, and availability",
    href: "/labour/profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
      </svg>
    ),
  },
  {
    key: "jobs",
    label: "Job Requests",
    description: "See farmers who want to hire you",
    href: "/labour/work-requests",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        <path d="M3.5 12h17" />
      </svg>
    ),
  },
  {
    key: "earnings",
    label: "Earnings",
    description: "Track payments from completed work",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 7.5v9M14.7 9.8c0-1.3-1.2-2.1-2.7-2.1-1.6 0-2.7.9-2.7 2s1 1.7 2.7 2.1c1.7.4 2.7 1 2.7 2.1s-1.1 2-2.7 2c-1.5 0-2.7-.7-2.7-2" />
      </svg>
    ),
  },
];

export default function LabourDashboardPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [noticeKey, setNoticeKey] = useState<string | null>(null);

  useEffect(() => {
    // Existing sessionStorage-JWT auth (see lib/auth.ts) — no new auth
    // mechanism, just checking whether a token is present before showing
    // the dashboard.
    setAuthState(getStoredToken() ? "ready" : "authRequired");
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <h1 className={styles.title}>Labour Dashboard</h1>
        <p className={styles.subtitle}>Everything you need, in one place.</p>

        {authState === "checking" && (
          <div className={styles.centerState}>
            <span>Loading…</span>
          </div>
        )}

        {authState === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in to view your dashboard.</p>
          </div>
        )}

        {authState === "ready" && (
          <div className={styles.grid}>
            {DASHBOARD_ITEMS.map((item) => {
              if (item.href) {
                return (
                  <Link key={item.key} href={item.href} className={styles.tile}>
                    <span className={styles.tileIcon}>{item.icon}</span>
                    <span className={styles.tileBody}>
                      <span className={styles.tileHeadRow}>
                        <span className={styles.tileLabel}>{item.label}</span>
                      </span>
                      <span className={styles.tileDescription}>
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.tile} ${styles.locked}`}
                  onClick={() =>
                    setNoticeKey((prev) => (prev === item.key ? null : item.key))
                  }
                  aria-expanded={noticeKey === item.key}
                >
                  <span className={styles.tileIcon}>{item.icon}</span>
                  <span className={styles.tileBody}>
                    <span className={styles.tileHeadRow}>
                      <span className={styles.tileLabel}>{item.label}</span>
                      <span className={styles.badge}>Coming soon</span>
                    </span>
                    <span className={styles.tileDescription}>
                      {item.description}
                    </span>
                    {noticeKey === item.key && (
                      <span className={styles.comingSoonNote}>
                        This module isn&apos;t live yet — we&apos;ll let you
                        know as soon as it launches.
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
