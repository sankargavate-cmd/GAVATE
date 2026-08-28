"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { LabourProfileFieldErrors, LabourProfileFormInput } from "@/types";
import styles from "@/app/labour/profile/profile.module.css";

// Mirrors MOBILE_REGEX in backend/src/validators/labour.validator.ts —
// kept in sync manually since the two projects don't share code.
const MOBILE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;

type FormState = {
  profilePhoto: string;
  mobile: string;
  skills: string[];
  skillInput: string;
  experienceYears: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: string;
  longitude: string;
  dailyWage: string;
  isAvailable: boolean;
};

function toFormState(values?: Partial<LabourProfileFormInput>): FormState {
  return {
    profilePhoto: values?.profilePhoto ?? "",
    mobile: values?.mobile ?? "",
    skills: values?.skills ?? [],
    skillInput: "",
    experienceYears:
      values?.experienceYears !== undefined ? String(values.experienceYears) : "",
    state: values?.state ?? "",
    district: values?.district ?? "",
    taluka: values?.taluka ?? "",
    village: values?.village ?? "",
    address: values?.address ?? "",
    latitude: values?.latitude !== undefined ? String(values.latitude) : "",
    longitude: values?.longitude !== undefined ? String(values.longitude) : "",
    dailyWage: values?.dailyWage !== undefined ? String(values.dailyWage) : "",
    isAvailable: values?.isAvailable ?? true,
  };
}

/** Client-side mirror of the backend's zod checks, so obvious mistakes are
 * caught before a round trip. The backend remains the source of truth —
 * its response errors are surfaced too, via the `serverErrors` prop. */
function validate(form: FormState): LabourProfileFieldErrors {
  const errors: LabourProfileFieldErrors = {};

  if (!MOBILE_REGEX.test(form.mobile.trim())) {
    errors.mobile = ["mobile must be a valid 10-digit Indian mobile number"];
  }
  if (form.skills.length === 0) {
    errors.skills = ["at least one skill is required"];
  }
  if (form.state.trim().length < 2) {
    errors.state = ["state must be at least 2 characters"];
  }
  if (form.district.trim().length < 2) {
    errors.district = ["district must be at least 2 characters"];
  }
  if (form.taluka.trim().length < 2) {
    errors.taluka = ["taluka must be at least 2 characters"];
  }
  if (form.village.trim().length < 2) {
    errors.village = ["village must be at least 2 characters"];
  }
  if (form.address.trim().length < 5) {
    errors.address = ["address must be at least 5 characters"];
  }
  if (form.dailyWage.trim() === "") {
    errors.dailyWage = ["dailyWage is required"];
  } else {
    const wage = Number(form.dailyWage);
    if (!Number.isFinite(wage) || wage <= 0 || wage > 100000) {
      errors.dailyWage = ["dailyWage must be between 1 and 100000"];
    }
  }
  if (form.experienceYears.trim() !== "") {
    const years = Number(form.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > 80) {
      errors.experienceYears = [
        "experienceYears must be a whole number between 0 and 80",
      ];
    }
  }
  if (form.latitude.trim() !== "") {
    const lat = Number(form.latitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = ["latitude must be between -90 and 90"];
    }
  }
  if (form.longitude.trim() !== "") {
    const lng = Number(form.longitude);
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = ["longitude must be between -180 and 180"];
    }
  }
  if (form.profilePhoto.trim() !== "") {
    try {
      new URL(form.profilePhoto.trim());
    } catch {
      errors.profilePhoto = ["profilePhoto must be a valid URL"];
    }
  }

  return errors;
}

function toPayload(form: FormState): LabourProfileFormInput {
  return {
    profilePhoto: form.profilePhoto.trim() || undefined,
    mobile: form.mobile.trim(),
    skills: form.skills,
    experienceYears:
      form.experienceYears.trim() !== "" ? Number(form.experienceYears) : undefined,
    state: form.state.trim(),
    district: form.district.trim(),
    taluka: form.taluka.trim(),
    village: form.village.trim(),
    address: form.address.trim(),
    latitude: form.latitude.trim() !== "" ? Number(form.latitude) : undefined,
    longitude: form.longitude.trim() !== "" ? Number(form.longitude) : undefined,
    dailyWage: Number(form.dailyWage),
    isAvailable: form.isAvailable,
  };
}

interface LabourProfileFormProps {
  initialValues?: Partial<LabourProfileFormInput>;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  serverFieldErrors: LabourProfileFieldErrors;
  onSubmit: (payload: LabourProfileFormInput) => void;
  onCancel?: () => void;
}

export function LabourProfileForm({
  initialValues,
  submitLabel,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onCancel,
}: LabourProfileFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues));
  const [clientErrors, setClientErrors] = useState<LabourProfileFieldErrors>({});
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addSkillFromInput() {
    const value = form.skillInput.trim().toLowerCase();
    if (!value) return;
    setForm((prev) =>
      prev.skills.includes(value)
        ? { ...prev, skillInput: "" }
        : { ...prev, skills: [...prev.skills, value], skillInput: "" }
    );
  }

  function handleSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSkillFromInput();
    }
  }

  function removeSkill(skill: string) {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addSkillFromInput();
    const currentForm = { ...form };
    const trimmed = currentForm.skillInput.trim().toLowerCase();
    const skills =
      trimmed && !currentForm.skills.includes(trimmed)
        ? [...currentForm.skills, trimmed]
        : currentForm.skills;
    const finalForm = { ...currentForm, skills };

    const errors = validate(finalForm);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit(toPayload(finalForm));
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("Location is not available on this device.");
      return;
    }
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        update("latitude", String(position.coords.latitude));
        update("longitude", String(position.coords.longitude));
        setLocating(false);
      },
      () => {
        setLocationError("Couldn't get your location. Enter it manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Server-side field errors take priority for a given field once present,
  // since they reflect the last real submit attempt.
  function errorsFor(field: keyof LabourProfileFieldErrors): string | null {
    const fromServer = serverFieldErrors[field];
    if (fromServer && fromServer.length > 0) {
      return fromServer[0];
    }
    const fromClient = clientErrors[field];
    if (fromClient && fromClient.length > 0) {
      return fromClient[0];
    }
    return null;
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError && <div className={styles.formBanner}>{serverError}</div>}

      <div className={styles.field}>
        <label htmlFor="mobile">Mobile number</label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="numeric"
          placeholder="9876543210"
          value={form.mobile}
          onChange={(e) => update("mobile", e.target.value)}
          aria-invalid={Boolean(errorsFor("mobile"))}
        />
        {errorsFor("mobile") && (
          <span className={styles.fieldError}>{errorsFor("mobile")}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="skillInput">Skills</label>
        {form.skills.length > 0 && (
          <div className={styles.chipRow}>
            {form.skills.map((skill) => (
              <span key={skill} className={styles.chip}>
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  aria-label={`Remove ${skill}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="skillInput"
          name="skillInput"
          type="text"
          placeholder="e.g. harvesting — press Enter to add"
          value={form.skillInput}
          onChange={(e) => update("skillInput", e.target.value)}
          onKeyDown={handleSkillKeyDown}
          onBlur={addSkillFromInput}
          aria-invalid={Boolean(errorsFor("skills"))}
        />
        <span className={styles.hint}>
          Add each skill separately, e.g. harvesting, weeding, spraying.
        </span>
        {errorsFor("skills") && (
          <span className={styles.fieldError}>{errorsFor("skills")}</span>
        )}
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="state">State</label>
          <input
            id="state"
            name="state"
            type="text"
            placeholder="Maharashtra"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
            aria-invalid={Boolean(errorsFor("state"))}
          />
          {errorsFor("state") && (
            <span className={styles.fieldError}>{errorsFor("state")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="district">District</label>
          <input
            id="district"
            name="district"
            type="text"
            placeholder="Pune"
            value={form.district}
            onChange={(e) => update("district", e.target.value)}
            aria-invalid={Boolean(errorsFor("district"))}
          />
          {errorsFor("district") && (
            <span className={styles.fieldError}>{errorsFor("district")}</span>
          )}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="taluka">Taluka</label>
          <input
            id="taluka"
            name="taluka"
            type="text"
            value={form.taluka}
            onChange={(e) => update("taluka", e.target.value)}
            aria-invalid={Boolean(errorsFor("taluka"))}
          />
          {errorsFor("taluka") && (
            <span className={styles.fieldError}>{errorsFor("taluka")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="village">Village</label>
          <input
            id="village"
            name="village"
            type="text"
            value={form.village}
            onChange={(e) => update("village", e.target.value)}
            aria-invalid={Boolean(errorsFor("village"))}
          />
          {errorsFor("village") && (
            <span className={styles.fieldError}>{errorsFor("village")}</span>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="address">Address</label>
        <textarea
          id="address"
          name="address"
          rows={3}
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          aria-invalid={Boolean(errorsFor("address"))}
        />
        {errorsFor("address") && (
          <span className={styles.fieldError}>{errorsFor("address")}</span>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.locationLabelRow}>
          <span>Location (optional)</span>
          <button
            type="button"
            className={styles.linkButton}
            onClick={useCurrentLocation}
            disabled={locating}
          >
            {locating ? "Locating…" : "Use current location"}
          </button>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="latitude">Latitude</label>
            <input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              value={form.latitude}
              onChange={(e) => update("latitude", e.target.value)}
              aria-invalid={Boolean(errorsFor("latitude"))}
            />
            {errorsFor("latitude") && (
              <span className={styles.fieldError}>{errorsFor("latitude")}</span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="longitude">Longitude</label>
            <input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              value={form.longitude}
              onChange={(e) => update("longitude", e.target.value)}
              aria-invalid={Boolean(errorsFor("longitude"))}
            />
            {errorsFor("longitude") && (
              <span className={styles.fieldError}>{errorsFor("longitude")}</span>
            )}
          </div>
        </div>
        {locationError && (
          <span className={styles.fieldError}>{locationError}</span>
        )}
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="dailyWage">Daily wage (₹)</label>
          <input
            id="dailyWage"
            name="dailyWage"
            type="number"
            min={1}
            max={100000}
            step="any"
            placeholder="500"
            value={form.dailyWage}
            onChange={(e) => update("dailyWage", e.target.value)}
            aria-invalid={Boolean(errorsFor("dailyWage"))}
          />
          {errorsFor("dailyWage") && (
            <span className={styles.fieldError}>{errorsFor("dailyWage")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="experienceYears">Experience (years, optional)</label>
          <input
            id="experienceYears"
            name="experienceYears"
            type="number"
            min={0}
            max={80}
            step={1}
            value={form.experienceYears}
            onChange={(e) => update("experienceYears", e.target.value)}
            aria-invalid={Boolean(errorsFor("experienceYears"))}
          />
          {errorsFor("experienceYears") && (
            <span className={styles.fieldError}>
              {errorsFor("experienceYears")}
            </span>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.checkboxRow}>
          <input
            id="isAvailable"
            name="isAvailable"
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => update("isAvailable", e.target.checked)}
          />
          <label htmlFor="isAvailable">Available for work right now</label>
        </div>
        <span className={styles.hint}>
          You can also flip this anytime from your profile page without
          editing the rest of your details.
        </span>
      </div>

      <div className={styles.field}>
        <label htmlFor="profilePhoto">Profile photo URL (optional)</label>
        <input
          id="profilePhoto"
          name="profilePhoto"
          type="url"
          placeholder="https://…"
          value={form.profilePhoto}
          onChange={(e) => update("profilePhoto", e.target.value)}
          aria-invalid={Boolean(errorsFor("profilePhoto"))}
        />
        {errorsFor("profilePhoto") && (
          <span className={styles.fieldError}>{errorsFor("profilePhoto")}</span>
        )}
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
