"use client";

import { useEffect, useState } from "react";
import { TransportProfileForm } from "@/components/TransportProfileForm";
import {
  AUTH_REQUIRED,
  createTransportProfile,
  fetchTransportProfile,
  setTransportAvailability,
  updateTransportProfile,
} from "@/lib/transport";
import {
  TransportProfile,
  TransportProfileFieldErrors,
  TransportProfileFormInput,
} from "@/types";
import styles from "./profile.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "loadError"; message: string }
  | { kind: "create" }
  | { kind: "view"; profile: TransportProfile }
  | { kind: "edit"; profile: TransportProfile };

function isFieldErrors(details: unknown): details is TransportProfileFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function TransportProfilePage() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TransportProfileFieldErrors>({});
  const [availabilityPending, setAvailabilityPending] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  async function loadProfile() {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof fetchTransportProfile>>;
    try {
      result = await fetchTransportProfile();
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
      setState({ kind: "view", profile: body.data });
      return;
    }

    if (status === 404) {
      setState({ kind: "create" });
      return;
    }

    if (status === 401) {
      setState({ kind: "authRequired" });
      return;
    }

    setState({
      kind: "loadError",
      message: !body.success ? body.message : "Couldn't load your profile.",
    });
  }

  useEffect(() => {
    loadProfile();
    // Runs once on mount; loadProfile has no reactive dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(payload: TransportProfileFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof createTransportProfile>>;
    try {
      result = await createTransportProfile(payload);
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
      setState({ kind: "view", profile: body.data });
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    if (status === 409) {
      // Profile was created elsewhere (e.g. another tab) since we last
      // checked — reload it instead of retrying the create.
      setSubmitting(false);
      await loadProfile();
      return;
    }

    setSubmitError(!body.success ? body.message : "Couldn't save your profile.");
    setSubmitting(false);
  }

  async function handleUpdate(profile: TransportProfile, payload: TransportProfileFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof updateTransportProfile>>;
    try {
      result = await updateTransportProfile(payload);
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
      setState({ kind: "view", profile: body.data });
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setFieldErrors(body.details);
      setSubmitting(false);
      return;
    }

    setSubmitError(!body.success ? body.message : "Couldn't save your profile.");
    setSubmitting(false);
  }

  async function handleToggleAvailability(profile: TransportProfile) {
    setAvailabilityPending(true);
    setAvailabilityError(null);

    let result: Awaited<ReturnType<typeof setTransportAvailability>>;
    try {
      result = await setTransportAvailability(!profile.isAvailable);
    } catch {
      setAvailabilityError("Couldn't reach the server. Try again.");
      setAvailabilityPending(false);
      return;
    }

    if (result === AUTH_REQUIRED) {
      setAvailabilityPending(false);
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 200 && body.success) {
      setState({ kind: "view", profile: body.data });
      setAvailabilityPending(false);
      return;
    }

    setAvailabilityError(!body.success ? body.message : "Couldn't update availability.");
    setAvailabilityPending(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Transport Profile</div>
        <h1 className={styles.title}>Your details</h1>
        <p className={styles.subtitle}>
          Farmers see this to decide whether to book your vehicle — keep
          your rates, location, and availability up to date.
        </p>

        <div className={styles.card}>
          {state.kind === "loading" && (
            <div className={styles.centerState}>
              <div className={styles.spinner} aria-hidden="true" />
              <span>Loading your profile…</span>
            </div>
          )}

          {state.kind === "authRequired" && (
            <div className={styles.centerState}>
              <p>You need to be logged in to view your transport profile.</p>
            </div>
          )}

          {state.kind === "loadError" && (
            <div className={styles.centerState}>
              <div className={styles.errorBanner}>{state.message}</div>
              <button className={styles.retryButton} onClick={loadProfile}>
                Try again
              </button>
            </div>
          )}

          {state.kind === "create" && (
            <>
              <p className={styles.subtitle} style={{ marginBottom: "1.25rem" }}>
                You haven&apos;t set up your profile yet. Fill in your
                vehicle&apos;s details below so farmers can find and book it.
              </p>
              <TransportProfileForm
                submitLabel="Create profile"
                submitting={submitting}
                serverError={submitError}
                serverFieldErrors={fieldErrors}
                onSubmit={handleCreate}
              />
            </>
          )}

          {state.kind === "view" && (
            <>
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>
                  {state.profile.photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={state.profile.photos[0]} alt="" />
                  ) : (
                    state.profile.village.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className={styles.profileHeaderText}>
                  <span className={styles.villageLine}>
                    {state.profile.vehicleType} · {state.profile.vehicleNumber}
                  </span>
                  <span className={styles.districtLine}>
                    {state.profile.village}, {state.profile.taluka},{" "}
                    {state.profile.district}
                  </span>
                </div>
                <button
                  className={styles.editButton}
                  onClick={() => setState({ kind: "edit", profile: state.profile })}
                >
                  Edit
                </button>
              </div>

              <div className={styles.statusRow}>
                {state.profile.isVerified ? (
                  <span className={styles.verifiedBadge}>✓ Verified</span>
                ) : (
                  <span className={styles.pendingBadge}>Pending verification</span>
                )}
              </div>

              <div className={styles.availabilityRow}>
                <span className={styles.availabilityLabel}>
                  <strong>
                    {state.profile.isAvailable ? "Available for hire" : "Not available"}
                  </strong>
                  <span>Farmers only see you in search while this is on.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.profile.isAvailable}
                  className={`${styles.toggle} ${
                    state.profile.isAvailable ? styles.on : ""
                  }`}
                  disabled={availabilityPending}
                  onClick={() => handleToggleAvailability(state.profile)}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              {availabilityError && (
                <div className={styles.formBanner}>{availabilityError}</div>
              )}

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Capacity</span>
                  <span className={styles.wageValue}>
                    {state.profile.capacity.toLocaleString("en-IN")}{" "}
                    {state.profile.capacityUnit}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Rate per km</span>
                  <span className={styles.wageValue}>
                    {state.profile.ratePerKm !== null
                      ? `₹${state.profile.ratePerKm.toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Rate per trip</span>
                  <span className={styles.wageValue}>
                    {state.profile.ratePerTrip !== null
                      ? `₹${state.profile.ratePerTrip.toLocaleString("en-IN")}`
                      : "—"}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Mobile</span>
                  <span className={styles.detailValue}>{state.profile.mobile}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>State</span>
                  <span className={styles.detailValue}>{state.profile.state}</span>
                </div>
                <div className={`${styles.detailItem} ${styles.full}`}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>{state.profile.address}</span>
                </div>
                {state.profile.latitude !== null &&
                  state.profile.longitude !== null && (
                    <div className={`${styles.detailItem} ${styles.full}`}>
                      <span className={styles.detailLabel}>Pinned location</span>
                      <span className={styles.detailValue}>
                        {state.profile.latitude.toFixed(5)},{" "}
                        {state.profile.longitude.toFixed(5)}
                      </span>
                    </div>
                  )}
                {state.profile.photos.length > 0 && (
                  <div className={`${styles.detailItem} ${styles.full}`}>
                    <span className={styles.detailLabel}>Photos</span>
                    <div className={styles.chipRow}>
                      {state.profile.photos.map((url) => (
                        <span key={url} className={styles.chip}>
                          {url.length > 28 ? `${url.slice(0, 28)}…` : url}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {state.kind === "edit" && (
            <TransportProfileForm
              initialValues={{
                photos: state.profile.photos,
                mobile: state.profile.mobile,
                vehicleType: state.profile.vehicleType,
                vehicleNumber: state.profile.vehicleNumber,
                capacity: state.profile.capacity,
                capacityUnit: state.profile.capacityUnit,
                state: state.profile.state,
                district: state.profile.district,
                taluka: state.profile.taluka,
                village: state.profile.village,
                address: state.profile.address,
                latitude: state.profile.latitude ?? undefined,
                longitude: state.profile.longitude ?? undefined,
                ratePerKm: state.profile.ratePerKm ?? undefined,
                ratePerTrip: state.profile.ratePerTrip ?? undefined,
                isAvailable: state.profile.isAvailable,
              }}
              submitLabel="Save changes"
              submitting={submitting}
              serverError={submitError}
              serverFieldErrors={fieldErrors}
              onSubmit={(payload) => handleUpdate(state.profile, payload)}
              onCancel={() => {
                setSubmitError(null);
                setFieldErrors({});
                setState({ kind: "view", profile: state.profile });
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
