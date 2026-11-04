"use client";

import { useId, useState, type FormEvent } from "react";

import { adminApi } from "@/lib/admin";
import { normalizePhone } from "@/lib/validation";

import styles from "./admin.module.css";
import { useAdmin } from "./AdminContext";
import { Icon } from "./icons";

/** Text a painter on a feature phone; they reply "4 5 4" and it lands in the inbox. */
export function SmsInvite() {
  const { handleError } = useAdmin();
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
      handleError(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.inviteLayout}>
      <form className={styles.form} onSubmit={submit} noValidate>
        <p className={styles.muted}>
          No app or data bundle needed. The painter replies with three numbers and the answer shows up in the inbox
          within seconds.
        </p>
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
          <Icon name="send" size={18} />
          {sending ? "Sending…" : "Send SMS invite"}
        </button>
        <p className={styles.muted} role="status">
          {message}
        </p>
      </form>
      <PhoneMock name={name.trim().split(/\s+/)[0] || "Otieno"} />
    </div>
  );
}

/** What the painter sees on a basic handset: the invite (as the server words it) and their reply. */
function PhoneMock({ name }: { name: string }) {
  return (
    <figure className={styles.phone}>
      <figcaption className="visually-hidden">Preview of the SMS conversation on a feature phone</figcaption>
      <div className={styles.phoneScreen}>
        <p className={styles.phoneBar} aria-hidden="true">
          <span>Messages</span>
          <span>▮▮▮▯</span>
        </p>
        <p className={styles.smsIn}>
          Hi {name}! Company X wants your feedback. Rate 1-5: our product, customer care, your happiness. Reply with 3
          numbers, e.g. 4 5 4
        </p>
        <p className={styles.smsOut}>4 5 4</p>
        <p className={styles.smsIn}>Thank you for your feedback! - Company X</p>
      </div>
      <div className={styles.keypad} aria-hidden="true">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
          <span key={k}>{k}</span>
        ))}
      </div>
    </figure>
  );
}
