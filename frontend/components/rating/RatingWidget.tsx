"use client";

import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, createRating } from "@/lib/rating";
import { CreateRatingFieldErrors, Rating, RatingTargetType } from "@/types";
import RatingStars from "./RatingStars";
import styles from "./rating.module.css";

interface RatingWidgetProps {
  targetType: RatingTargetType;
  /** WorkRequest / TractorBooking / TransportBooking / Order id being rated. */
  referenceId: string;
  /** Name of the person being rated, shown in the button/form title. */
  rateeName: string;
  /** Rating already left for this engagement, if the caller already knows
   * (e.g. from a bulk lookup on the list page) — skips straight to the
   * read-only "already rated" display instead of showing the Rate button. */
  existingRating?: Rating | null;
  onRatingSubmitted?: (rating: Rating) => void;
}

type WidgetState =
  | { kind: "collapsed" }
  | { kind: "expanded" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; fieldErrors?: CreateRatingFieldErrors };

// Mirrors isFieldErrors in app/farmer/labour-search/[id]/page.tsx — narrows
// the untyped `details` field of a failed API response before trusting it.
function isFieldErrors(details: unknown): details is CreateRatingFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function RatingWidget({
  targetType,
  referenceId,
  rateeName,
  existingRating = null,
  onRatingSubmitted,
}: RatingWidgetProps) {
  const [submitted, setSubmitted] = useState<Rating | null>(existingRating);
  const [state, setState] = useState<WidgetState>({ kind: "collapsed" });
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");

  // existingRating can arrive after first render (the list page fetches
  // "given ratings" separately from the booking list itself), so keep in
  // sync rather than only reading it on mount.
  useEffect(() => {
    if (existingRating) {
      setSubmitted(existingRating);
    }
  }, [existingRating]);

  if (submitted) {
    return (
      <div className={styles.submittedCard}>
        <div className={styles.submittedHeader}>
          <span className={styles.submittedLabel}>Your rating</span>
          <RatingStars value={submitted.rating} size="sm" />
        </div>
        {submitted.review && <p className={styles.submittedReview}>{submitted.review}</p>}
      </div>
    );
  }

  if (state.kind === "collapsed") {
    return (
      <button type="button" className={styles.rateButton} onClick={() => setState({ kind: "expanded" })}>
        Rate {rateeName}
      </button>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (stars < 1) {
      setState({ kind: "error", message: "Please select a star rating." });
      return;
    }

    setState({ kind: "submitting" });

    let result: Awaited<ReturnType<typeof createRating>>;
    try {
      result = await createRating({
        targetType,
        referenceId,
        rating: stars,
        review: review.trim() || undefined,
      });
    } catch {
      setState({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
      return;
    }

    if (result === AUTH_REQUIRED) {
      setState({ kind: "error", message: "You need to be logged in to submit a rating." });
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      setSubmitted(body.data);
      onRatingSubmitted?.(body.data);
      return;
    }

    // 409 covers both "already rated" (a duplicate the list page's bulk
    // lookup missed, e.g. a stale page) and "not completed yet" — either
    // way the backend's message is the accurate one to show.
    if (!body.success) {
      setState({
        kind: "error",
        message: body.message,
        fieldErrors: isFieldErrors(body.details) ? body.details : undefined,
      });
      return;
    }

    setState({ kind: "error", message: "Couldn't submit rating." });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formTitle}>Rate {rateeName}</div>

      {state.kind === "error" && <div className={styles.errorBanner}>{state.message}</div>}

      <div className={styles.field}>
        <span className={styles.fieldLabelText}>Your rating</span>
        <RatingStars value={stars} onChange={setStars} ariaLabelPrefix={`Rate ${rateeName}`} />
        {state.kind === "error" && state.fieldErrors?.rating && (
          <span className={styles.fieldError}>{state.fieldErrors.rating[0]}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={`rating-review-${referenceId}`}>Review (optional)</label>
        <textarea
          id={`rating-review-${referenceId}`}
          placeholder="Share your experience…"
          maxLength={1000}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        {state.kind === "error" && state.fieldErrors?.review && (
          <span className={styles.fieldError}>{state.fieldErrors.review[0]}</span>
        )}
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={state.kind === "submitting"}
          onClick={() => {
            setState({ kind: "collapsed" });
            setStars(0);
            setReview("");
          }}
        >
          Cancel
        </button>
        <button type="submit" className={styles.primaryButton} disabled={state.kind === "submitting"}>
          {state.kind === "submitting" ? "Submitting…" : "Submit rating"}
        </button>
      </div>
    </form>
  );
}
