export type LanguageCode = "mr" | "hi" | "en";

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "en", label: "English", nativeLabel: "English" },
];

// localStorage (not sessionStorage) — a language choice should survive
// across browser sessions, unlike the JWT in lib/auth.ts which is
// intentionally cleared when the tab closes.
const LANGUAGE_STORAGE_KEY = "shetkari-sathi:language";

function isLanguageCode(value: string | null): value is LanguageCode {
  return value === "mr" || value === "hi" || value === "en";
}

export function getStoredLanguage(): LanguageCode | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguageCode(value) ? value : null;
}

export function setStoredLanguage(code: LanguageCode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export function getLanguageOption(code: LanguageCode): LanguageOption {
  return LANGUAGES.find((lang) => lang.code === code) ?? LANGUAGES[2];
}
