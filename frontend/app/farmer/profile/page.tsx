"use client";

import { useEffect, useState } from "react";
import { FarmerProfileForm } from "@/components/FarmerProfileForm";
import {
  AUTH_REQUIRED,
  createFarmerProfile,
  fetchFarmerProfile,
  updateFarmerProfile,
} from "@/lib/farmer";
import { FarmerProfile, FarmerProfileFieldErrors, FarmerProfileFormInput } from "@/types";
import styles from "./profile.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "loadError"; message: string }
  | { kind: "create" }
  | { kind: "view"; profile: FarmerProfile }
  | { kind: "edit"; profile: FarmerProfile };

function isFieldErrors(details: unknown): details is FarmerProfileFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function FarmerProfilePage() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FarmerProfileFieldErrors>({});

  async function loadProfile() {
    setState({ kind: "loading" });

    let result: Awaited<ReturnType<typeof fetchFarmerProfile>>;
    try {
      result = await fetchFarmerProfile();
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

  async function handleCreate(payload: FarmerProfileFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof createFarmerProfile>>;
    try {
      result = await createFarmerProfile(payload);
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

  async function handleUpdate(profile: FarmerProfile, payload: FarmerProfileFormInput) {
    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof updateFarmerProfile>>;
    try {
      result = await updateFarmerProfile(payload);
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

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.eyebrow}>Farmer Profile</div>
        <h1 className={styles.title}>Your details</h1>
        <p className={styles.subtitle}>
          This information helps buyers, labour, and service providers find
          and reach you.
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
              <p>You need to be logged in to view your farmer profile.</p>
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
                You haven&apos;t set up your profile yet. Fill in your details
                below to get started.
              </p>
              <FarmerProfileForm
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
                  {state.profile.profilePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={state.profile.profilePhoto} alt="" />
                  ) : (
                    state.profile.village.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className={styles.profileHeaderText}>
                  <span className={styles.villageLine}>
                    {state.profile.village}, {state.profile.taluka}
                  </span>
                  <span className={styles.districtLine}>
                    {state.profile.district}, {state.profile.state}
                  </span>
                </div>
                <button
                  className={styles.editButton}
                  onClick={() =>
                    setState({ kind: "edit", profile: state.profile })
                  }
                >
                  Edit
                </button>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Mobile</span>
                  <span className={styles.detailValue}>
                    {state.profile.mobile}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Farming experience</span>
                  <span className={styles.detailValue}>
                    {state.profile.farmingExperience} year
                    {state.profile.farmingExperience === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={`${styles.detailItem} ${styles.full}`}>
                  <span className={styles.detailLabel}>Address</span>
                  <span className={styles.detailValue}>
                    {state.profile.address}
                  </span>
                </div>
                {state.profile.latitude !== null &&
                  state.profile.longitude !== null && (
                    <div className={`${styles.detailItem} ${styles.full}`}>
                      <span className={styles.detailLabel}>Farm location</span>
                      <span className={styles.detailValue}>
                        {state.profile.latitude.toFixed(5)},{" "}
                        {state.profile.longitude.toFixed(5)}
                      </span>
                    </div>
                  )}
              </div>
            </>
          )}

          {state.kind === "edit" && (
            <FarmerProfileForm
              initialValues={{
                profilePhoto: state.profile.profilePhoto ?? undefined,
                mobile: state.profile.mobile,
                state: state.profile.state,
                district: state.profile.district,
                taluka: state.profile.taluka,
                village: state.profile.village,
                address: state.profile.address,
                latitude: state.profile.latitude ?? undefined,
                longitude: state.profile.longitude ?? undefined,
                farmingExperience: state.profile.farmingExperience,
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
