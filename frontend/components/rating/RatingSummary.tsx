"use client";

import { useEffect, useState } from "react";
import { AUTH_REQUIRED, fetchUserRatingSummary } from "@/lib/rating";
import { Rating, RatingTargetType } from "@/types";
import RatingStars from "./RatingStars";
import styles from "./rating.module.css";

interface RatingSummaryProps {
  /** The ratee's userId (e.g. LabourProfile.userId), not the profile id. */
  userId: string;
  targetType: RatingTargetType;
}

const PAGE_SIZE = 5;

type SummaryState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      averageRating: number | null;
      ratingCount: number;
      reviews: Rating[];
      page: number;
      totalPages: number;
    };

/**
 * Public (any authenticated user) rating summary + reviews for a specific
 * ratee — backed by GET /ratings/user/:userId, which computes the average
 * live rather than relying on any cached profile field. Renders nothing
 * on auth errors so it fails quietly alongside the rest of the profile
 * page (which already shows its own auth-required state).
 */
export default function RatingSummary({ userId, targetType }: RatingSummaryProps) {
  const [state, setState] = useState<SummaryState>({ kind: "loading" });

  async function load(page: number) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof fetchUserRatingSummary>>;
    try {
      result = await fetchUserRatingSummary(userId, { targetType, page, limit: PAGE_SIZE });
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
      setState({
        kind: "ready",
        averageRating: body.data.averageRating,
        ratingCount: body.data.ratingCount,
        reviews: body.data.reviews,
        page: body.pagination.page,
        totalPages: body.pagination.totalPages,
      });
      return;
    }

    if (status === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "error",
      message: !body.success ? body.message : "Couldn't load ratings.",
    });
  }

  useEffect(() => {
    load(1);
    // Reloads from page 1 whenever the ratee/target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, targetType]);

  if (state.kind === "authRequired") {
    return null;
  }

  if (state.kind === "loading") {
    return (
      <div className={styles.summaryCard}>
        <div className={styles.centerStateInline}>
          <div className={styles.spinnerSm} aria-hidden="true" />
          <span>Loading ratings…</span>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={styles.summaryCard}>
        <div className={styles.errorBanner}>{state.message}</div>
      </div>
    );
  }

  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryHeader}>
        <div className={styles.summaryTitle}>Ratings &amp; Reviews</div>
        {state.ratingCount > 0 ? (
          <div className={styles.summaryAverage}>
            <RatingStars value={Math.round(state.averageRating ?? 0)} size="sm" />
            <span className={styles.summaryAverageValue}>{state.averageRating?.toFixed(1)}</span>
            <span className={styles.summaryCount}>
              ({state.ratingCount} review{state.ratingCount === 1 ? "" : "s"})
            </span>
          </div>
        ) : (
          <span className={styles.summaryCount}>No ratings yet</span>
        )}
      </div>

      {state.reviews.length > 0 && (
        <div className={styles.reviewList}>
          {state.reviews.map((review) => (
            <div key={review.id} className={styles.reviewItem}>
              <div className={styles.reviewHeader}>
                <span className={styles.reviewAuthor}>{review.rater.fullName}</span>
                <RatingStars value={review.rating} size="sm" />
              </div>
              {review.review && <p className={styles.reviewText}>{review.review}</p>}
              <span className={styles.reviewDate}>
                {new Date(review.createdAt).toLocaleDateString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      )}

      {state.totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={state.page <= 1}
            onClick={() => load(state.page - 1)}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {state.page} of {state.totalPages}
          </span>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={state.page >= state.totalPages}
            onClick={() => load(state.page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
