"use client";

import { useEffect, useState } from "react";
import { ProduceListingForm } from "@/components/ProduceListingForm";
import {
  AUTH_REQUIRED,
  createProduceListing,
  deleteProduceListing,
  fetchOwnProduceListings,
  updateProduceListing,
} from "@/lib/produce";
import {
  ProduceListing,
  ProduceListingFieldErrors,
  ProduceListingFormInput,
  PRODUCE_UNIT_LABELS,
} from "@/types";
import styles from "./produce.module.css";

type ListState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "loadError"; message: string }
  | {
      kind: "ready";
      items: ProduceListing[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; listing: ProduceListing };

function isFieldErrors(details: unknown): details is ProduceListingFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function FarmerProducePage() {
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProduceListingFieldErrors>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadListings(page = 1) {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof fetchOwnProduceListings>>;
    try {
      result = await fetchOwnProduceListings(page);
    } catch {
      setState({
        kind: "loadError",
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
      setState({ kind: "ready", items: body.data, pagination: body.pagination });
      return;
    }

    if (status === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "loadError",
      message: !body.success ? body.message : "Couldn't load your produce listings.",
    });
  }

  useEffect(() => {
    loadListings();
    // Runs once on mount; loadListings has no reactive dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateForm() {
    setSubmitError(null);
    setFieldErrors({});
    setFormMode({ kind: "create" });
  }

  function openEditForm(listing: ProduceListing) {
    setSubmitError(null);
    setFieldErrors({});
    setFormMode({ kind: "edit", listing });
  }

  function closeForm() {
    setFormMode({ kind: "closed" });
    setSubmitError(null);
    setFieldErrors({});
  }

  async function handleCreate(payload: ProduceListingFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof createProduceListing>>;
    try {
      result = await createProduceListing(payload);
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    if (result === AUTH_REQUIRED) {
      setSubmitting(false);
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      setSubmitting(false);
      setFormMode({ kind: "closed" });
      await loadListings();
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    setSubmitError(!body.success ? body.message : "Couldn't save your listing.");
    setSubmitting(false);
  }

  async function handleUpdate(listing: ProduceListing, payload: ProduceListingFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof updateProduceListing>>;
    try {
      result = await updateProduceListing(listing.id, payload);
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    if (result === AUTH_REQUIRED) {
      setSubmitting(false);
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setSubmitting(false);
      setFormMode({ kind: "closed" });
      await loadListings();
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    if (status === 404) {
      setSubmitting(false);
      setFormMode({ kind: "closed" });
      await loadListings();
      return;
    }

    setSubmitError(!body.success ? body.message : "Couldn't save your listing.");
    setSubmitting(false);
  }

  async function handleDelete(listing: ProduceListing) {
    if (!window.confirm(`Delete your ${listing.crop} listing? This can't be undone.`)) {
      return;
    }

    setDeletingId(listing.id);
    setDeleteError(null);

    let result: Awaited<ReturnType<typeof deleteProduceListing>>;
    try {
      result = await deleteProduceListing(listing.id);
    } catch {
      setDeleteError("Couldn't reach the server. Check your connection and try again.");
      setDeletingId(null);
      return;
    }

    if (result === AUTH_REQUIRED) {
      setDeletingId(null);
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setDeletingId(null);
      await loadListings();
      return;
    }

    setDeleteError(!body.success ? body.message : "Couldn't delete this listing.");
    setDeletingId(null);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Shetkari Sathi</div>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>My Produce Listings</h1>
          {state.kind === "ready" && formMode.kind === "closed" && (
            <button type="button" className={styles.addButton} onClick={openCreateForm}>
              + Add listing
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          List your harvest for buyers to find. Listings are visible to buyers once
          your farmer profile is verified.
        </p>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading your listings…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a farmer to manage produce listings.</p>
          </div>
        )}

        {state.kind === "loadError" && (
          <div className={styles.centerState}>
            <div className={styles.errorBanner}>{state.message}</div>
          </div>
        )}

        {state.kind === "ready" && formMode.kind === "create" && (
          <div className={styles.formCard}>
            <ProduceListingForm
              submitLabel="Add listing"
              submitting={submitting}
              serverError={submitError}
              serverFieldErrors={fieldErrors}
              onSubmit={handleCreate}
              onCancel={closeForm}
            />
          </div>
        )}

        {state.kind === "ready" && formMode.kind === "edit" && (
          <div className={styles.formCard}>
            <ProduceListingForm
              initialValues={{
                crop: formMode.listing.crop,
                quantity: formMode.listing.quantity,
                unit: formMode.listing.unit,
                price: formMode.listing.price,
                location: formMode.listing.location,
                description: formMode.listing.description ?? undefined,
                photos: formMode.listing.photos,
                isActive: formMode.listing.isActive,
              }}
              submitLabel="Save changes"
              submitting={submitting}
              serverError={submitError}
              serverFieldErrors={fieldErrors}
              onSubmit={(payload) => handleUpdate(formMode.listing, payload)}
              onCancel={closeForm}
            />
          </div>
        )}

        {state.kind === "ready" && (
          <>
            {deleteError && <div className={styles.errorBanner}>{deleteError}</div>}

            {state.items.length === 0 && formMode.kind === "closed" ? (
              <div className={styles.centerState}>
                <p>You haven&apos;t listed any produce yet.</p>
                <button type="button" className={styles.addButton} onClick={openCreateForm}>
                  + Add your first listing
                </button>
              </div>
            ) : (
              <div className={styles.list}>
                {state.items.map((listing) => (
                  <div key={listing.id} className={styles.listing}>
                    <div className={styles.listingHeader}>
                      <div>
                        <div className={styles.listingCrop}>{listing.crop}</div>
                        <div className={styles.listingLocation}>{listing.location}</div>
                      </div>
                      <div className={styles.priceBadge}>
                        <span>Price / {PRODUCE_UNIT_LABELS[listing.unit]}</span>₹
                        {listing.price.toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div className={styles.listingMeta}>
                      <span
                        className={
                          listing.isActive ? styles.activeBadge : styles.inactiveBadge
                        }
                      >
                        {listing.isActive ? "Active" : "Inactive"}
                      </span>
                      <span>
                        {listing.quantity.toLocaleString("en-IN")}{" "}
                        {PRODUCE_UNIT_LABELS[listing.unit]}
                      </span>
                    </div>

                    {listing.description && (
                      <p className={styles.listingDescription}>{listing.description}</p>
                    )}

                    {listing.photos.length > 0 && (
                      <div className={styles.photoRow}>
                        {listing.photos.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt={listing.crop} className={styles.photoThumb} />
                        ))}
                      </div>
                    )}

                    <div className={styles.listingActions}>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => openEditForm(listing)}
                        disabled={formMode.kind !== "closed"}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => handleDelete(listing)}
                        disabled={deletingId === listing.id || formMode.kind !== "closed"}
                      >
                        {deletingId === listing.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {state.pagination.totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page <= 1}
                  onClick={() => loadListings(state.pagination.page - 1)}
                >
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {state.pagination.page} of {state.pagination.totalPages}
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={state.pagination.page >= state.pagination.totalPages}
                  onClick={() => loadListings(state.pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
