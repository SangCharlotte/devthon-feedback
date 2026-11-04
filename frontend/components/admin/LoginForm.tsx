"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { adminApi, UnauthorizedError } from "@/lib/admin";

import styles from "./login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(username, password);
      router.replace("/admin");
    } catch (err) {
      // 401 here means wrong credentials, not an expired session.
      setError(err instanceof UnauthorizedError ? "Wrong username or password." : (err as Error).message);
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h1>Welcome back</h1>
      <p className={styles.lead}>Sign in to see what your customers are saying.</p>
      <label htmlFor="username">Username</label>
      <input
        id="username"
        className={styles.input}
        autoComplete="username"
        autoCapitalize="none"
        required
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        className={styles.input}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
