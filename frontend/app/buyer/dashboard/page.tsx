"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredToken } from "@/lib/auth";
import styles from "./dashboard.module.css";

type AuthState = "checking" | "authRequired" | "ready";

export default function BuyerDashboardPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");

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
        <h1 className={styles.title}>Buyer Dashboard</h1>
        <p className={styles.subtitle}>Find fresh produce straight from verified farmers.</p>

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
            <Link href="/buyer/marketplace" className={styles.tile}>
              <span className={styles.tileIcon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4.5 9.5h15l-1.6 9a2 2 0 0 1-2 1.7H8.1a2 2 0 0 1-2-1.7l-1.6-9Z" />
                  <path d="M8.5 9.5 10.5 4.5h3l2 5" />
                </svg>
              </span>
              <span className={styles.tileBody}>
                <span className={styles.tileHeadRow}>
                  <span className={styles.tileLabel}>Browse Produce</span>
                </span>
                <span className={styles.tileDescription}>
                  Search fresh crops listed by verified farmers near you
                </span>
              </span>
            </Link>

            <Link href="/buyer/offers" className={styles.tile}>
              <span className={styles.tileIcon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
                  <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
                  <path d="M7.5 12.5l2.4 2.4 5.6-5.4" />
                </svg>
              </span>
              <span className={styles.tileBody}>
                <span className={styles.tileHeadRow}>
                  <span className={styles.tileLabel}>My Offers</span>
                </span>
                <span className={styles.tileDescription}>
                  Track offers you&apos;ve made on produce listings
                </span>
              </span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
