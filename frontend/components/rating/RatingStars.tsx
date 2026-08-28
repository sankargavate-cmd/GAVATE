"use client";

import { useState } from "react";
import styles from "./rating.module.css";

const STAR_VALUES = [1, 2, 3, 4, 5];

interface RatingStarsProps {
  /** Current value (0-5). 0 means "nothing selected yet" in interactive mode. */
  value: number;
  /** Omit for a read-only display; provide to make the stars clickable. */
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  /** Used to build each star's accessible label in interactive mode. */
  ariaLabelPrefix?: string;
}

/**
 * Renders 5 stars, either as a static display (no onChange) or as an
 * interactive 1-5 picker (onChange provided) with hover/focus preview.
 * Shared by RatingWidget (submitting a new rating) and RatingSummary
 * (showing the average and each review's rating).
 */
export default function RatingStars({
  value,
  onChange,
  size = "md",
  ariaLabelPrefix = "Rating",
}: RatingStarsProps) {
  const interactive = typeof onChange === "function";
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  return (
    <div
      className={`${styles.stars} ${size === "sm" ? styles.starsSm : ""}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? `${ariaLabelPrefix}: select 1 to 5 stars` : `${value} out of 5 stars`}
      onMouseLeave={interactive ? () => setHoverValue(null) : undefined}
    >
      {STAR_VALUES.map((starValue) =>
        interactive ? (
          <button
            key={starValue}
            type="button"
            className={styles.starButton}
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            onMouseEnter={() => setHoverValue(starValue)}
            onFocus={() => setHoverValue(starValue)}
            onBlur={() => setHoverValue(null)}
            onClick={() => onChange!(starValue)}
          >
            <span aria-hidden="true">{starValue <= displayValue ? "★" : "☆"}</span>
          </button>
        ) : (
          <span key={starValue} aria-hidden="true" className={styles.starStatic}>
            {starValue <= displayValue ? "★" : "☆"}
          </span>
        )
      )}
    </div>
  );
}
