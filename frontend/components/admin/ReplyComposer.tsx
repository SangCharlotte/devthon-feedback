"use client";

import { useEffect, useId, useState } from "react";

import { adminApi, UnauthorizedError, type AlertItem, type DeliveryStatus } from "@/lib/admin";

import styles from "./admin.module.css";

type Props = {
  alert: AlertItem;
  aiEnabled: boolean;
  onSent: (alert: AlertItem) => void;
  onCancel: () => void;
  onError: (error: unknown) => void;
};

/**
 * Human in the loop: the AI may suggest a reply, but it lands in an editable box.
 * Only the care rep's "Send" button emails the customer, with exactly what's in the box.
 */
export function ReplyComposer({ alert, aiEnabled, onSent, onCancel, onError }: Props) {
  const id = useId();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(aiEnabled);
  const [fromAi, setFromAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
  // No email (e.g. feature-phone customers): the backend sends the body by SMS instead.
  const viaSms = !alert.customer_email;
  const recipient = alert.customer_email ?? alert.customer_phone;

  useEffect(() => {
    let cancelled = false;
    // Best effort: if the check fails we simply show no warning.
    adminApi.deliveryStatus().then(
      (status) => !cancelled && setDelivery(status),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aiEnabled) return;
    let cancelled = false;
    adminApi
      .draftReply(alert.id)
      .then((draft) => {
        if (cancelled) return;
        setSubject(draft.subject);
        setBody(draft.body);
        setFromAi(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof UnauthorizedError) onError(error);
        // The AI is optional: if it fails, the rep simply writes the reply themselves.
        else setNote("The AI couldn't draft a reply right now. You can write one yourself.");
      })
      .finally(() => !cancelled && setDrafting(false));
    return () => {
      cancelled = true;
    };
  }, [alert.id, aiEnabled, onError]);

  async function send() {
    setSending(true);
    setNote(null);
    try {
      // SMS has no subject line, but the record still needs one.
      const subjectLine = subject.trim() || (viaSms ? "SMS reply" : "");
      onSent(await adminApi.sendReply(alert.id, { subject: subjectLine, body: body.trim() }));
    } catch (error) {
      if (error instanceof UnauthorizedError) onError(error);
      else setNote(error instanceof Error ? error.message : "Couldn't send the reply.");
      setSending(false);
    }
  }

  const notDelivered = viaSms
    ? delivery?.sms === "sandbox" &&
      "SMS is in sandbox mode (AT_USERNAME=sandbox): this customer won't receive the text."
    : delivery?.email === "test" &&
      "Email is in test mode (Mailpit): this customer won't receive the reply. Set a real SMTP provider in .env.";

  const ready = (viaSms || subject.trim() !== "") && body.trim() !== "" && !drafting && !sending;

  return (
    <div className={styles.composer}>
      {drafting ? (
        <p className={styles.muted} role="status">
          ✦ Drafting a reply…
        </p>
      ) : (
        fromAi && (
          <p className={styles.aiNote}>✦ AI draft. Read it, make it yours, then send. Nothing is sent until you do.</p>
        )
      )}
      {notDelivered && (
        <p className={styles.warning} role="note">
          ⚠ {notDelivered}
        </p>
      )}
      {!viaSms && (
        <>
          <label htmlFor={`${id}-subject`}>Subject</label>
          <input
            id={`${id}-subject`}
            className={styles.input}
            value={subject}
            disabled={drafting}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
          />
        </>
      )}
      <label htmlFor={`${id}-body`}>
        {viaSms ? "SMS" : "Message"} to {recipient}
      </label>
      <textarea
        id={`${id}-body`}
        className={`${styles.input} ${styles.textarea}`}
        value={body}
        disabled={drafting}
        maxLength={5000}
        rows={8}
        onChange={(event) => setBody(event.target.value)}
      />
      {note && (
        <p className={styles.error} role="alert">
          {note}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={send} disabled={!ready}>
          {sending ? "Sending…" : viaSms ? "Send SMS" : "Send email"}
        </button>
      </div>
    </div>
  );
}
