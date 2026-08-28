"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import {
  PRODUCE_UNIT_LABELS,
  PRODUCE_UNITS,
  ProduceListingFieldErrors,
  ProduceListingFormInput,
  ProduceUnit,
} from "@/types";
import styles from "@/app/farmer/produce/produce.module.css";

type FormState = {
  crop: string;
  quantity: string;
  unit: ProduceUnit;
  price: string;
  location: string;
  description: string;
  photos: string[];
  photoInput: string;
  isActive: boolean;
};

function toFormState(values?: Partial<ProduceListingFormInput>): FormState {
  return {
    crop: values?.crop ?? "",
    quantity: values?.quantity !== undefined ? String(values.quantity) : "",
    unit: values?.unit ?? "KG",
    price: values?.price !== undefined ? String(values.price) : "",
    location: values?.location ?? "",
    description: values?.description ?? "",
    photos: values?.photos ?? [],
    photoInput: "",
    isActive: values?.isActive ?? true,
  };
}

/** Client-side mirror of the backend's zod checks, so obvious mistakes are
 * caught before a round trip. The backend remains the source of truth —
 * its response errors are surfaced too, via the `serverErrors` prop. */
function validate(form: FormState): ProduceListingFieldErrors {
  const errors: ProduceListingFieldErrors = {};

  if (form.crop.trim().length < 2) {
    errors.crop = ["crop must be at least 2 characters"];
  }
  if (form.quantity.trim() === "") {
    errors.quantity = ["quantity is required"];
  } else {
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      errors.quantity = ["quantity must be between 0 and 1,000,000"];
    }
  }
  if (form.price.trim() === "") {
    errors.price = ["price is required"];
  } else {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) {
      errors.price = ["price must be between 0 and 10,000,000"];
    }
  }
  if (form.location.trim().length < 2) {
    errors.location = ["location must be at least 2 characters"];
  }
  if (form.description.trim().length > 1000) {
    errors.description = ["description must be at most 1000 characters"];
  }
  for (const url of form.photos) {
    try {
      new URL(url);
    } catch {
      errors.photos = ["each photo must be a valid URL"];
      break;
    }
  }

  return errors;
}

function toPayload(form: FormState): ProduceListingFormInput {
  return {
    crop: form.crop.trim(),
    quantity: Number(form.quantity),
    unit: form.unit,
    price: Number(form.price),
    location: form.location.trim(),
    description: form.description.trim() || undefined,
    photos: form.photos.length > 0 ? form.photos : undefined,
    isActive: form.isActive,
  };
}

interface ProduceListingFormProps {
  initialValues?: Partial<ProduceListingFormInput>;
  submitLabel: string;
  submitting: boolean;
  serverError: string | null;
  serverFieldErrors: ProduceListingFieldErrors;
  onSubmit: (payload: ProduceListingFormInput) => void;
  onCancel?: () => void;
}

export function ProduceListingForm({
  initialValues,
  submitLabel,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onCancel,
}: ProduceListingFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues));
  const [clientErrors, setClientErrors] = useState<ProduceListingFieldErrors>({});

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
    if (event.key === "Enter" || event.key === ",") {
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

  // Server-side field errors take priority for a given field once present,
  // since they reflect the last real submit attempt.
  function errorsFor(field: keyof ProduceListingFieldErrors): string | null {
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
        <label htmlFor="crop">Crop</label>
        <input
          id="crop"
          name="crop"
          type="text"
          placeholder="e.g. Onion, Wheat, Tomato"
          value={form.crop}
          onChange={(e) => update("crop", e.target.value)}
          aria-invalid={Boolean(errorsFor("crop"))}
        />
        {errorsFor("crop") && (
          <span className={styles.fieldError}>{errorsFor("crop")}</span>
        )}
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={0}
            step="any"
            placeholder="100"
            value={form.quantity}
            onChange={(e) => update("quantity", e.target.value)}
            aria-invalid={Boolean(errorsFor("quantity"))}
          />
          {errorsFor("quantity") && (
            <span className={styles.fieldError}>{errorsFor("quantity")}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="unit">Unit</label>
          <select
            id="unit"
            name="unit"
            value={form.unit}
            onChange={(e) => update("unit", e.target.value as ProduceUnit)}
          >
            {PRODUCE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {PRODUCE_UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="price">Price per unit (₹)</label>
        <input
          id="price"
          name="price"
          type="number"
          min={0}
          step="any"
          placeholder="1500"
          value={form.price}
          onChange={(e) => update("price", e.target.value)}
          aria-invalid={Boolean(errorsFor("price"))}
        />
        {errorsFor("price") && (
          <span className={styles.fieldError}>{errorsFor("price")}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="location">Location</label>
        <input
          id="location"
          name="location"
          type="text"
          placeholder="e.g. Baramati, Pune, Maharashtra"
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
          aria-invalid={Boolean(errorsFor("location"))}
        />
        {errorsFor("location") && (
          <span className={styles.fieldError}>{errorsFor("location")}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Quality, harvest date, grading, etc."
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          aria-invalid={Boolean(errorsFor("description"))}
        />
        {errorsFor("description") && (
          <span className={styles.fieldError}>{errorsFor("description")}</span>
        )}
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
        <span className={styles.hint}>
          Add a photo URL and press Enter. Up to 10 photos.
        </span>
        {errorsFor("photos") && (
          <span className={styles.fieldError}>{errorsFor("photos")}</span>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.checkboxRow}>
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update("isActive", e.target.checked)}
          />
          <label htmlFor="isActive">Listing is active (visible to buyers)</label>
        </div>
        <span className={styles.hint}>
          Turn this off if the produce is sold out, without deleting the listing.
        </span>
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
