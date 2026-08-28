"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import {
  CAPACITY_UNITS,
  CAPACITY_UNIT_LABELS,
  CapacityUnit,
  VEHICLE_TYPES,
  TransportProfileFieldErrors,
  TransportProfileFormInput,
} from "@/types";
import styles from "@/app/transport/profile/profile.module.css";

// Mirrors MOBILE_REGEX in backend/src/validators/transport.validator.ts —
// kept in sync manually since the two projects don't share code.
const MOBILE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;

type FormState = {
  photos: string[];
  photoInput: string;
  mobile: string;
  vehicleType: string;
  vehicleNumber: string;
  capacity: string;
  capacityUnit: CapacityUnit;
  state: string;
  district: string;
  taluka: string;
  village: string;
  address: string;
  latitude: string;
  longitude: string;
  ratePerKm: string;
  ratePerTrip: string;
  isAvailable: boolean;
};

function toFormState(values?: Partial<TransportProfileFormInput>): FormState {
  return {
    photos: values?.photos ?? [],
    photoInput: "",
    mobile: values?.mobile ?? "",
    vehicleType: values?.vehicleType ?? "",
    vehicleNumber: values?.vehicleNumber ?? "",
    capacity: values?.capacity !== undefined ? String(values.capacity) : "",
    capacityUnit: values?.capacityUnit ?? "TON",
    state: values?.state ?? "",
    district: values?.district ?? "",
    taluka: values?.taluka ?? "",
    village: values?.village ?? "",
    address: values?.address ?? "",
    latitude: values?.latitude !== undefined ? String(values.latitude) : "",
    longitude: values?.longitude !== undefined ? String(values.longitude) : "",
    ratePerKm: values?.ratePerKm !== undefined ? String(values.ratePerKm) : "",
    ratePerTrip: values?.ratePerTrip !== undefined ? String(values.ratePerTrip) : "",
    isAvailable: values?.isAvailable ?? true,
  };
}

/** Client-side mirror of the backend's zod checks, so obvious mistakes are
 * caught before a round trip. The backend remains the source of truth —
 * its response errors are surfaced too, via the `serverErrors` prop. */
function validate(form: FormState): TransportProfileFieldErrors {
  const errors: TransportProfileFieldErrors = {};

  if (!MOBILE_REGEX.test(form.mobile.trim())) {
    errors.mobile = ["mobile must be a valid 10-digit Indian mobile number"];
  }
  if (form.vehicleType.trim().length < 2) {
    errors.vehicleType = ["vehicleType must be at least 2 characters"];
  }
  if (form.vehicleNumber.trim().length < 4) {
    errors.vehicleNumber = ["vehicleNumber must be at least 4 characters"];
  }
  const capacityTrimmed = form.capacity.trim();
  if (capacityTrimmed === "") {
    errors.capacity = ["capacity is required"];
  } else {
    const capacity = Number(capacityTrimmed);
    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 100000) {
      errors.capacity = ["capacity must be between 1 and 100000"];
    }
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

  const kmTrimmed = form.ratePerKm.trim();
  const tripTrimmed = form.ratePerTrip.trim();
  if (kmTrimmed === "" && tripTrimmed === "") {
    errors.ratePerKm = ["At least one of ratePerKm or ratePerTrip is required"];
  }
  if (kmTrimmed !== "") {
    const rate = Number(kmTrimmed);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      errors.ratePerKm = ["ratePerKm must be between 1 and 100000"];
    }
  }
  if (tripTrimmed !== "") {
    const rate = Number(tripTrimmed);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) {
      errors.ratePerTrip = ["ratePerTrip must be between 1 and 100000"];
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
  for (const url of form.photos) {
    try {
      new URL(url);
    } catch {
      errors.photos = ["each photo must be a valid URL"];
      break;
    }
  }
  if (form.photos.length > 10) {
    errors.photos = ["at most 10 photos are allowed"];
  }

  return errors;
}

function toPayload(form: FormState): TransportProfileFormInput {
  return {
    photos: form.photos.length > 0 ? form.photos : undefined,
    mobile: form.mobile.trim(),
    vehicleType: form.vehicleType.trim(),
    vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
    capacity: Number(form.capacity),
    capacityUnit: form.capacityUnit,
    state: form.state.trim(),
    district: form.district.trim(),
    taluka: form.taluka.trim(),
    village: form.village.trim(),
    address: form.address.trim(),
    latitude: form.latitude.trim() !== "" ? Number(form.latitude) : undefined,
    longitude: form.longitude.trim() !== "" ? Number(form.longitude) : undefined,
    ratePerKm: form.ratePerKm.trim() !== "" ? Number(form.ratePerKm) : undefined,
    ratePerTrip: form.ratePerTrip.trim() !== "" ? Number(form.ratePerTrip) : undefined,
    isAvailable: form.isAvailable,
  };
}

interface TransportProfileFormProps {
  initialValues?: Partial<TransportProfileFormInput>;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  serverFieldErrors: TransportProfileFieldErrors;
  onSubmit: (payload: TransportProfileFormInput) => void;
  onCancel?: () => void;
}

export function TransportProfileForm({
  initialValues,
  submitLabel,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onCancel,
}: TransportProfileFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues));
  const [clientErrors, setClientErrors] = useState<TransportProfileFieldErrors>({});
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addPhotoFromInput() {
    const value = form.photoInput.trim();
    if (!value) return;
    setForm((prev) =>
      prev.photos.includes(value)
        ? { ...prev, photoInput: "" }
        : { ...prev, photos: [...prev.photos, value], photoInput: "" }
    );
  }

  function handlePhotoKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addPhotoFromInput();
    }
  }

  function removePhoto(url: string) {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p !== url),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addPhotoFromInput();
    const currentForm = { ...form };
    const trimmed = currentForm.photoInput.trim();
    const photos =
      trimmed && !currentForm.photos.includes(trimmed)
        ? [...currentForm.photos, trimmed]
        : currentForm.photos;
    const finalForm = { ...currentForm, photos };

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
  function errorsFor(field: keyof TransportProfileFieldErrors): string | null {
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
          <label htmlFor="vehicleType">Vehicle type</label>
          <input
            id="vehicleType"
            name="vehicleType"
            type="text"
            list="vehicleTypeOptions"
            placeholder="e.g. Mini Truck"
            value={form.vehicleType}
            onChange={(e) => update("vehicleType", e.target.value)}
            aria-invalid={Boolean(errorsFor("vehicleType"))}
          />
          <datalist id="vehicleTypeOptions">
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
          {errorsFor("vehicleType") && (
            <span className={styles.fieldError}>{errorsFor("vehicleType")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="vehicleNumber">Vehicle number</label>
          <input
            id="vehicleNumber"
            name="vehicleNumber"
            type="text"
            placeholder="e.g. MH12AB1234"
            value={form.vehicleNumber}
            onChange={(e) => update("vehicleNumber", e.target.value)}
            aria-invalid={Boolean(errorsFor("vehicleNumber"))}
          />
          {errorsFor("vehicleNumber") && (
            <span className={styles.fieldError}>{errorsFor("vehicleNumber")}</span>
          )}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="capacity">Capacity</label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={100000}
            step="any"
            placeholder="5"
            value={form.capacity}
            onChange={(e) => update("capacity", e.target.value)}
            aria-invalid={Boolean(errorsFor("capacity"))}
          />
          {errorsFor("capacity") && (
            <span className={styles.fieldError}>{errorsFor("capacity")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="capacityUnit">Capacity unit</label>
          <select
            id="capacityUnit"
            name="capacityUnit"
            value={form.capacityUnit}
            onChange={(e) => update("capacityUnit", e.target.value as CapacityUnit)}
          >
            {CAPACITY_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {CAPACITY_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
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
          <label htmlFor="ratePerKm">Rate per km (₹, optional)</label>
          <input
            id="ratePerKm"
            name="ratePerKm"
            type="number"
            min={1}
            max={100000}
            step="any"
            placeholder="20"
            value={form.ratePerKm}
            onChange={(e) => update("ratePerKm", e.target.value)}
            aria-invalid={Boolean(errorsFor("ratePerKm"))}
          />
          {errorsFor("ratePerKm") && (
            <span className={styles.fieldError}>{errorsFor("ratePerKm")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="ratePerTrip">Rate per trip (₹, optional)</label>
          <input
            id="ratePerTrip"
            name="ratePerTrip"
            type="number"
            min={1}
            max={100000}
            step="any"
            placeholder="1500"
            value={form.ratePerTrip}
            onChange={(e) => update("ratePerTrip", e.target.value)}
            aria-invalid={Boolean(errorsFor("ratePerTrip"))}
          />
          {errorsFor("ratePerTrip") && (
            <span className={styles.fieldError}>{errorsFor("ratePerTrip")}</span>
          )}
        </div>
      </div>
      <span className={styles.hint}>
        At least one of per-km or per-trip rate is required — set both if
        you offer either.
      </span>

      <div className={styles.field}>
        <div className={styles.checkboxRow}>
          <input
            id="isAvailable"
            name="isAvailable"
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => update("isAvailable", e.target.checked)}
          />
          <label htmlFor="isAvailable">Available for hire right now</label>
        </div>
        <span className={styles.hint}>
          You can also flip this anytime from your profile page without
          editing the rest of your details.
        </span>
      </div>

      <div className={styles.field}>
        <label htmlFor="photoInput">Photos (optional)</label>
        {form.photos.length > 0 && (
          <div className={styles.chipRow}>
            {form.photos.map((url) => (
              <span key={url} className={styles.chip}>
                {url.length > 28 ? `${url.slice(0, 28)}…` : url}
                <button
                  type="button"
                  onClick={() => removePhoto(url)}
                  aria-label={`Remove ${url}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          id="photoInput"
          name="photoInput"
          type="url"
          placeholder="https://… — press Enter to add"
          value={form.photoInput}
          onChange={(e) => update("photoInput", e.target.value)}
          onKeyDown={handlePhotoKeyDown}
          onBlur={addPhotoFromInput}
          aria-invalid={Boolean(errorsFor("photos"))}
        />
        <span className={styles.hint}>Add up to 10 photo URLs of your vehicle.</span>
        {errorsFor("photos") && (
          <span className={styles.fieldError}>{errorsFor("photos")}</span>
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
