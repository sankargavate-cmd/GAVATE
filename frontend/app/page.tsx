"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, LanguageCode, setStoredLanguage } from "@/lib/language";
import styles from "./welcome.module.css";

type Step = "splash" | "language";

// How long the splash animation plays before auto-advancing. Kept short so
// it never feels like the app is stuck — a tap always skips it instantly.
const SPLASH_AUTO_ADVANCE_MS = 2600;
const SPLASH_AUTO_ADVANCE_MS_REDUCED = 900;

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("splash");
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode | null>(
    null
  );
  const advancedRef = useRef(false);

  useEffect(() => {
    if (step !== "splash") {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const timer = setTimeout(
      () => goToLanguage(),
      prefersReducedMotion
        ? SPLASH_AUTO_ADVANCE_MS_REDUCED
        : SPLASH_AUTO_ADVANCE_MS
    );

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function goToLanguage() {
    if (advancedRef.current) {
      return;
    }
    advancedRef.current = true;
    setStep("language");
  }

  function handleContinue() {
    if (!selectedLanguage) {
      return;
    }
    setStoredLanguage(selectedLanguage);
    router.push("/auth");
  }

  if (step === "splash") {
    return (
      <main className={styles.page}>
        <div
          className={styles.splash}
          onClick={goToLanguage}
          role="button"
          tabIndex={0}
          aria-label="Continue"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              goToLanguage();
            }
          }}
        >
          <svg
            className={styles.sprout}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21V11" />
            <path d="M12 11c0-4 3-6.5 7-6.5-.3 4-3 6.5-7 6.5Z" />
            <path d="M12 14c0-3.2-2.4-5.5-6-5.5.3 3.2 2.4 5.5 6 5.5Z" />
          </svg>
          <h1 className={styles.wordmark}>
            Shetkari Sathi
            <span className={styles.wordmarkNative}>शेतकरी साथी</span>
          </h1>
          <p className={styles.tagline}>Your partner in every harvest</p>
          <span className={styles.tapHint}>Tap to continue</span>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.languageScreen}>
        <div className={styles.eyebrow}>Step 1 of 2</div>
        <h1 className={styles.title}>Choose your language</h1>
        <p className={styles.subtitle}>
          भाषा निवडा · भाषा चुनें · Select your preferred language
        </p>

        <div className={styles.languageList} role="radiogroup" aria-label="Language">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.languageOption} ${
                  isSelected ? styles.languageOptionSelected : ""
                }`}
                onClick={() => setSelectedLanguage(lang.code)}
              >
                <span className={styles.languageOptionText}>
                  <span className={styles.languageNative}>
                    {lang.nativeLabel}
                  </span>
                  <span className={styles.languageLabel}>{lang.label}</span>
                </span>
                <span className={styles.checkCircle}>
                  {isSelected && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.continueButton}
          disabled={!selectedLanguage}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </main>
  );
}
