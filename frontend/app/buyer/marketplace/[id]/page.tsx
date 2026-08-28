"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AUTH_REQUIRED, fetchPublicProduceListing } from "@/lib/produce";
import {
  AUTH_REQUIRED as OFFER_AUTH_REQUIRED,
  createProduceOffer,
} from "@/lib/produceOffer";
import {
  PRODUCE_UNIT_LABELS,
  ProduceOfferFieldErrors,
  PublicProduceListing,
} from "@/types";
import styles from "../marketplace.module.css";

type ViewState =
  | { kind: "loading" }
  | { kind: "authRequired" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; listing: PublicProduceListing };

type OfferFormState = { kind: "closed" } | { kind: "open" } | { kind: "sent" };

function isFieldErrors(details: unknown): details is ProduceOfferFieldErrors {
  return typeof details === "object" && details !== null;
}

export default function BuyerListingDetailPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const [offerForm, setOfferForm] = useState<OfferFormState>({ kind: "closed" });
  const [offerPrice, setOfferPrice] = useState("");
  const [offerQuantity, setOfferQuantity] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerFieldErrors, setOfferFieldErrors] = useState<ProduceOfferFieldErrors>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ kind: "loading" });

      let result: Awaited<ReturnType<typeof fetchPublicProduceListing>>;
      try {
        result = await fetchPublicProduceListing(params.id);
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "Couldn't reach the server. Check your connection and try again.",
          });
        }
        return;
      }

      if (cancelled) return;

      if (result === AUTH_REQUIRED) {
        setState({ kind: "authRequired" });
        return;
      }

      const { status, body } = result;

      if (status === 200 && body.success) {
        setState({ kind: "ready", listing: body.data });
        return;
      }

      if (status === 401) {
        setState({ kind: "authRequired" });
        return;
      }

      if (status === 404) {
        setState({ kind: "notFound" });
        return;
      }

      setState({
        kind: "error",
        message: !body.success ? body.message : "Couldn't load this listing.",
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  function openOfferForm() {
    setOfferError(null);
    setOfferFieldErrors({});
    setOfferForm({ kind: "open" });
  }

  function closeOfferForm() {
    setOfferForm({ kind: "closed" });
    setOfferError(null);
    setOfferFieldErrors({});
  }

  async function handleSubmitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.kind !== "ready") return;

    setSubmittingOffer(true);
    setOfferError(null);
    setOfferFieldErrors({});

    const priceNumber = Number(offerPrice);
    const quantityNumber = Number(offerQuantity);

    let result: Awaited<ReturnType<typeof createProduceOffer>>;
    try {
      result = await createProduceOffer({
        listingId: state.listing.id,
        offerPrice: priceNumber,
        quantity: quantityNumber,
        message: offerMessage.trim() || undefined,
      });
    } catch {
      setOfferError("Couldn't reach the server. Check your connection and try again.");
      setSubmittingOffer(false);
      return;
    }

    if (result === OFFER_AUTH_REQUIRED) {
      setSubmittingOffer(false);
      setState({ kind: "authRequired" });
      return;
    }

    const { status, body } = result;

    if (status === 201 && body.success) {
      setSubmittingOffer(false);
      setOfferForm({ kind: "sent" });
      return;
    }

    if (status === 400 && !body.success && isFieldErrors(body.details)) {
      setOfferFieldErrors(body.details);
      setSubmittingOffer(false);
      return;
    }

    if (status === 401) {
      setSubmittingOffer(false);
      setState({ kind: "authRequired" });
      return;
    }

    setOfferError(!body.success ? body.message : "Couldn't send your offer.");
    setSubmittingOffer(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/buyer/marketplace" className={styles.backLink}>
          ← Back to marketplace
        </Link>

        {state.kind === "loading" && (
          <div className={styles.centerState}>
            <div className={styles.spinner} aria-hidden="true" />
            <span>Loading listing…</span>
          </div>
        )}

        {state.kind === "authRequired" && (
          <div className={styles.centerState}>
            <p>You need to be logged in as a buyer to view this listing.</p>
          </div>
        )}

        {state.kind === "notFound" && (
          <div className={styles.centerState}>
            <p>This listing isn&apos;t available anymore.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className={styles.centerState}>
            <div className={styles.errorBanner}>{state.message}</div>
          </div>
        )}

        {state.kind === "ready" && (
          <div className={styles.card}>
            <div className={styles.detailHeader}>
              <div>
                <div className={styles.detailCrop}>{state.listing.crop}</div>
                <div className={styles.detailLocation}>{state.listing.location}</div>
              </div>
              <span className={styles.verifiedTag}>✓ Verified farmer</span>
            </div>

            {state.listing.photos.length > 0 && (
              <div className={styles.photoGrid}>
                {state.listing.photos.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt={state.listing.crop} className={styles.photo} />
                ))}
              </div>
            )}

            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Price per unit</span>
                <span className={`${styles.detailValue} ${styles.priceValue}`}>
                  ₹{state.listing.price.toLocaleString("en-IN")} /{" "}
                  {PRODUCE_UNIT_LABELS[state.listing.unit]}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Quantity available</span>
                <span className={styles.detailValue}>
                  {state.listing.quantity.toLocaleString("en-IN")}{" "}
                  {PRODUCE_UNIT_LABELS[state.listing.unit]}
                </span>
              </div>
              {state.listing.description && (
                <div className={`${styles.detailItem} ${styles.full}`}>
                  <span className={styles.detailLabel}>Description</span>
                  <span className={styles.detailValue}>{state.listing.description}</span>
                </div>
              )}
            </div>

            <div className={styles.contactCard}>
              <div className={styles.contactHeading}>Contact farmer</div>
              <div className={styles.contactRow}>
                <div>
                  <div className={styles.contactName}>{state.listing.farmer.fullName}</div>
                  {state.listing.farmer.farmerProfile && (
                    <div className={styles.contactMeta}>
                      {state.listing.farmer.farmerProfile.village},{" "}
                      {state.listing.farmer.farmerProfile.taluka},{" "}
                      {state.listing.farmer.farmerProfile.district},{" "}
                      {state.listing.farmer.farmerProfile.state}
                    </div>
                  )}
                </div>
                {state.listing.farmer.farmerProfile && (
                  <a
                    href={`tel:${state.listing.farmer.farmerProfile.mobile}`}
                    className={styles.callButton}
                  >
                    Call {state.listing.farmer.farmerProfile.mobile}
                  </a>
                )}
              </div>
            </div>

            <div className={styles.offerCard}>
              <div className={styles.contactHeading}>Make an offer</div>

              {offerForm.kind === "closed" && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={openOfferForm}
                >
                  Make Offer
                </button>
              )}

              {offerForm.kind === "sent" && (
                <p className={styles.offerSentMessage}>
                  Your offer has been sent to the farmer. You can track it from{" "}
                  <Link href="/buyer/offers" className={styles.inlineLink}>
                    My Offers
                  </Link>
                  .
                </p>
              )}

              {offerForm.kind === "open" && (
                <form className={styles.offerForm} onSubmit={handleSubmitOffer}>
                  {offerError && <div className={styles.errorBanner}>{offerError}</div>}

                  <div className={styles.field}>
                    <label htmlFor="offerPrice">
                      Your price / {PRODUCE_UNIT_LABELS[state.listing.unit]} (₹)
                    </label>
                    <input
                      id="offerPrice"
                      type="number"
                      min={0}
                      step="0.01"
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value)}
                      required
                    />
                    {offerFieldErrors.offerPrice && (
                      <span className={styles.fieldError}>
                        {offerFieldErrors.offerPrice[0]}
                      </span>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="offerQuantity">
                      Quantity ({PRODUCE_UNIT_LABELS[state.listing.unit]})
                    </label>
                    <input
                      id="offerQuantity"
                      type="number"
                      min={0}
                      step="0.01"
                      max={state.listing.quantity}
                      value={offerQuantity}
                      onChange={(e) => setOfferQuantity(e.target.value)}
                      required
                    />
                    {offerFieldErrors.quantity && (
                      <span className={styles.fieldError}>
                        {offerFieldErrors.quantity[0]}
                      </span>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="offerMessage">Message (optional)</label>
                    <textarea
                      id="offerMessage"
                      rows={3}
                      maxLength={500}
                      value={offerMessage}
                      onChange={(e) => setOfferMessage(e.target.value)}
                      placeholder="Any details for the farmer…"
                    />
                    {offerFieldErrors.message && (
                      <span className={styles.fieldError}>
                        {offerFieldErrors.message[0]}
                      </span>
                    )}
                  </div>

                  <div className={styles.offerFormActions}>
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={submittingOffer}
                    >
                      {submittingOffer ? "Sending…" : "Send Offer"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={closeOfferForm}
                      disabled={submittingOffer}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
