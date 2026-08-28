"use client";

import { FormEvent, useState } from "react";
import { FarmerProfileFieldErrors, FarmerProfileFormInput } from "@/types";
import styles from "@/app/farmer/profile/profile.module.css";

// Mirrors MOBILE_REGEX in backend/src/validators/farmer.validator.ts —
// kept in sync manually since the two projects don't share code.
const MOBILE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;

type FormState = {
  profilePhoto: string;
  mobile: string;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: string;
  longitude: string;
  farmingExperience: string;
};

function toFormState(values?: Partial<FarmerProfileFormInput>): FormState {
  return {
    profilePhoto: values?.profilePhoto ?? "",
    mobile: values?.mobile ?? "",
    state: values?.state ?? "",
    district: values?.district ?? "",
    taluka: values?.taluka ?? "",
    village: values?.village ?? "",
    address: values?.address ?? "",
    latitude: values?.latitude !== undefined ? String(values.latitude) : "",
    longitude: values?.longitude !== undefined ? String(values.longitude) : "",
    farmingExperience:
      values?.farmingExperience !== undefined
        ? String(values.farmingExperience)
        : "",
  };
}

/** Client-side mirror of the backend's zod checks, so obvious mistakes are
 * caught before a round trip. The backend remains the source of truth —
 * its response errors are surfaced too, via the `serverErrors` prop. */
function validate(form: FormState): FarmerProfileFieldErrors {
  const errors: FarmerProfileFieldErrors = {};

  if (!MOBILE_REGEX.test(form.mobile.trim())) {
    errors.mobile = ["mobile must be a valid 10-digit Indian mobile number"];
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
  if (form.farmingExperience.trim() === "") {
    errors.farmingExperience = ["farmingExperience is required"];
  } else {
    const years = Number(form.farmingExperience);
    if (!Number.isInteger(years) || years < 0 || years > 100) {
      errors.farmingExperience = [
        "farmingExperience must be a whole number between 0 and 100",
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

function toPayload(form: FormState): FarmerProfileFormInput {
  return {
    profilePhoto: form.profilePhoto.trim() || undefined,
    mobile: form.mobile.trim(),
    state: form.state.trim(),
    district: form.district.trim(),
    taluka: form.taluka.trim(),
    village: form.village.trim(),
    address: form.address.trim(),
    latitude: form.latitude.trim() !== "" ? Number(form.latitude) : undefined,
    longitude:
      form.longitude.trim() !== "" ? Number(form.longitude) : undefined,
    farmingExperience: Number(form.farmingExperience),
  };
}

interface FarmerProfileFormProps {
  initialValues?: Partial<FarmerProfileFormInput>;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  serverFieldErrors: FarmerProfileFieldErrors;
  onSubmit: (payload: FarmerProfileFormInput) => void;
  onCancel?: () => void;
}

export function FarmerProfileForm({
  initialValues,
  submitLabel,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onCancel,
}: FarmerProfileFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues));
  const [clientErrors, setClientErrors] = useState<FarmerProfileFieldErrors>({});
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(form);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    onSubmit(toPayload(form));
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
  function errorsFor(field: keyof FarmerProfileFieldErrors): string | null {
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
          <span>Farm location (optional)</span>
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

      <div className={styles.field}>
        <label htmlFor="farmingExperience">Farming experience (years)</label>
        <input
          id="farmingExperience"
          name="farmingExperience"
          type="number"
          min={0}
          max={100}
          step={1}
          value={form.farmingExperience}
          onChange={(e) => update("farmingExperience", e.target.value)}
          aria-invalid={Boolean(errorsFor("farmingExperience"))}
        />
        {errorsFor("farmingExperience") && (
          <span className={styles.fieldError}>
            {errorsFor("farmingExperience")}
          </span>
        )}
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
          <span className={styles.fieldError}>
            {errorsFor("profilePhoto")}
          </span>
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
