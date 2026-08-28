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

// "My Profile" (Step 7/8), "Find Labour" (Step 12), "Sell Produce"
// (Step 18), "My Work Requests" (Step 19), "Find Tractor" (Step 20), and
// "Find Transport" / "My Transport Bookings" (Step 21) are the real
// modules so far. The rest are listed per the Step 9 brief but have no
// backend yet, so they render as honest "Coming soon" tiles rather than
// linking anywhere.
const DASHBOARD_ITEMS: DashboardItem[] = [
  {
    key: "labour",
    label: "Find Labour",
    description: "Hire farm labour near your village",
    href: "/farmer/labour-search",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7.5" r="2.8" />
        <path d="M3.5 19c0-3.3 2.5-5.3 5.5-5.3s5.5 2 5.5 5.3" />
        <circle cx="17.5" cy="7" r="2.1" />
        <path d="M14.9 13.9c2.4.4 4.1 2.2 4.1 5.1" />
      </svg>
    ),
  },
  {
    key: "workRequests",
    label: "My Work Requests",
    description: "Track requests you've sent to labour",
    href: "/farmer/work-requests",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        <path d="M7.5 12.5l2.4 2.4 5.6-5.4" />
      </svg>
    ),
  },
  {
    key: "tractor",
    label: "Find Tractor",
    description: "Book a tractor for your field",
    href: "/farmer/tractor-search",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6.5" cy="17.5" r="3" />
        <circle cx="17" cy="17.5" r="2.2" />
        <path d="M3.5 17.5V9h3.8l2.4 4h3.6l1.4-3h3.3v3.5" />
        <path d="M8.5 9V5h3" />
      </svg>
    ),
  },
  {
    key: "tractorBookings",
    label: "My Tractor Bookings",
    description: "Track tractor bookings you've requested",
    href: "/farmer/tractor-bookings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        <path d="M7.5 12.5l2.4 2.4 5.6-5.4" />
      </svg>
    ),
  },
  {
    key: "sell",
    label: "Sell Produce",
    description: "List your harvest for buyers",
    href: "/farmer/produce",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 9.5h15l-1.6 9a2 2 0 0 1-2 1.7H8.1a2 2 0 0 1-2-1.7l-1.6-9Z" />
        <path d="M8.5 9.5 10.5 4.5h3l2 5" />
      </svg>
    ),
  },
  {
    key: "produceOffers",
    label: "Produce Offers",
    description: "Review and respond to buyer offers on your listings",
    href: "/farmer/offers",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        <path d="M7.5 12.5l2.4 2.4 5.6-5.4" />
      </svg>
    ),
  },
  {
    key: "buyer",
    label: "Find Buyer",
    description: "Connect with produce buyers near you",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="3" />
        <circle cx="16" cy="9" r="3" />
        <path d="M4 19c0-3 2-4.6 4-4.6" />
        <path d="M20 19c0-3-2-4.6-4-4.6" />
        <path d="M9.5 14h5" />
      </svg>
    ),
  },
  {
    key: "transport",
    label: "Find Transport",
    description: "Arrange transport for your goods",
    href: "/farmer/transport-search",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="9" width="10" height="7" rx="1" />
        <path d="M12.5 11.5h4l3 3v1.5h-7z" />
        <circle cx="6" cy="17.5" r="1.7" />
        <circle cx="16.5" cy="17.5" r="1.7" />
      </svg>
    ),
  },
  {
    key: "transportBookings",
    label: "My Transport Bookings",
    description: "Track transport bookings you've requested",
    href: "/farmer/transport-bookings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="6.5" width="17" height="13" rx="1.6" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        <path d="M7.5 12.5l2.4 2.4 5.6-5.4" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "My Profile",
    description: "View and edit your farmer profile",
    href: "/farmer/profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
      </svg>
    ),
  },
];

export default function FarmerDashboardPage() {
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
        <h1 className={styles.title}>Farmer Dashboard</h1>
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
              const isLocked = !item.href;

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
                    {noticeKey === item.key && isLocked && (
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
