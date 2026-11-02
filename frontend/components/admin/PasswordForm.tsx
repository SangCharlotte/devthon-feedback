"use client";

import { useId, useState, type FormEvent } from "react";

import { adminApi, UnauthorizedError } from "@/lib/admin";

import styles from "./admin.module.css";
import { MIN_PASSWORD } from "./TeamPanel";

type Props = { onDone: () => void; onError: (error: unknown) => void };

/** A rep replaces the temporary password their manager gave them. */
export function PasswordForm({ onDone, onError }: Props) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD) return setMessage(`Use at least ${MIN_PASSWORD} characters.`);
    if (next !== repeat) return setMessage("The new passwords don't match.");
    setSaving(true);
    setMessage(null);
    try {
      await adminApi.changePassword(current, next);
      setMessage("Password changed. You've been signed out on your other devices.");
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (error) {
      if (error instanceof UnauthorizedError) onError(error);
      else setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.inviteForm} onSubmit={submit} noValidate>
      <label htmlFor={`${id}-current`}>Current password</label>
      <input
        id={`${id}-current`}
        className={styles.input}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <label htmlFor={`${id}-new`}>New password</label>
      <input
        id={`${id}-new`}
        className={styles.input}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      <label htmlFor={`${id}-repeat`}>Repeat new password</label>
      <input
        id={`${id}-repeat`}
        className={styles.input}
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(event) => setRepeat(event.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Change password"}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onDone}>
        Close
      </button>
      <p className={styles.muted} role="status">
        {message}
      </p>
    </form>
  );
}
