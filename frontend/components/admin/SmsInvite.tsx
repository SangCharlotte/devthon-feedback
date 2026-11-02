"use client";

import { useId, useState, type FormEvent } from "react";

import { adminApi } from "@/lib/admin";
import { normalizePhone } from "@/lib/validation";

import styles from "./admin.module.css";

/** Text a painter on a feature phone; they reply "4 5 4" and it lands in the log. */
export function SmsInvite({ onError }: { onError: (error: unknown) => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!name.trim() || !normalized) {
      setMessage("Enter a name and a valid phone number.");
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const result = await adminApi.inviteBySms(name.trim(), normalized);
      setMessage(
        result.sent
          ? `Invite sent to ${normalized}.`
          : "Saved, but the SMS couldn't be sent. Check the Africa's Talking settings.",
      );
      if (result.sent) {
        setName("");
        setPhone("");
      }
    } catch (error) {
      onError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.inviteForm} onSubmit={submit} noValidate>
      <label htmlFor={`${id}-name`}>Painter&apos;s name</label>
      <input
        id={`${id}-name`}
        className={styles.input}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor={`${id}-phone`}>Phone</label>
      <input
        id={`${id}-phone`}
        className={styles.input}
        type="tel"
        inputMode="tel"
        placeholder="0712 345 678"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={sending}>
        {sending ? "Sending…" : "Send SMS invite"}
      </button>
      <p className={styles.muted} role="status">
        {message}
      </p>
    </form>
  );
}
