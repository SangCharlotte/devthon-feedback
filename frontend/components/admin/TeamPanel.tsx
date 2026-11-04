"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";

import { adminApi, UnauthorizedError, type Role, type StaffChange, type StaffMember } from "@/lib/admin";
import { dateTime } from "@/lib/format";

import styles from "./admin.module.css";
import { Avatar } from "./ui";

export const MIN_PASSWORD = 10;
const USERNAME_PATTERN = /^[a-z0-9._-]{2,50}$/;

type Props = { currentUsername: string; onError: (error: unknown) => void };

/** Managers only: add care reps, change roles, reset passwords, take access away. */
export function TeamPanel({ currentUsername, onError }: Props) {
  const id = useId();
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ display_name: "", username: "", password: "", role: "rep" as Role });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Problems stay in this card; only an expired session leaves the page.
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof UnauthorizedError) onError(error);
      else setMessage(error instanceof Error ? error.message : "Something went wrong.");
    },
    [onError],
  );

  useEffect(() => {
    adminApi.staff().then(setMembers, fail);
  }, [fail]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const username = form.username.trim().toLowerCase();
    if (!form.display_name.trim() || !USERNAME_PATTERN.test(username)) {
      setMessage("Enter a name and a username (letters, numbers, . - _ only).");
      return;
    }
    if (form.password.length < MIN_PASSWORD) {
      setMessage(`The temporary password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const added = await adminApi.addStaff({ ...form, username, display_name: form.display_name.trim() });
      setMembers((current) => [...(current ?? []), added]);
      setForm({ display_name: "", username: "", password: "", role: "rep" });
      setMessage(`Added ${added.display_name}. Give them the temporary password; they can change it after signing in.`);
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  }

  async function update(member: StaffMember, change: StaffChange, done: string) {
    setMessage(null);
    try {
      const updated = await adminApi.updateStaff(member.id, change);
      setMembers((current) => current?.map((m) => (m.id === updated.id ? updated : m)) ?? null);
      setMessage(done);
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function resetPassword(event: FormEvent, member: StaffMember) {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD) {
      setMessage(`The new password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    const ok = await update(
      member,
      { password: newPassword },
      `New password set for ${member.display_name}. They've been signed out everywhere.`,
    );
    if (ok) {
      setResetting(null);
      setNewPassword("");
    }
  }

  return (
    <div>
      {members === null ? (
        <p className={styles.muted}>Loading the team…</p>
      ) : members.length === 0 ? (
        <p className={styles.muted}>No team members yet. Add your first care rep below.</p>
      ) : (
        <ul className={styles.teamList}>
          {members.map((member) => {
            const isMe = member.username === currentUsername;
            return (
              <li key={member.id} className={styles.teamRow} data-inactive={!member.is_active}>
                <Avatar name={member.display_name} />
                <div className={styles.teamWho}>
                  <strong>{member.display_name}</strong> <span className={styles.handle}>@{member.username}</span>
                  <div className={styles.teamMeta}>
                    <span className={styles.roleBadge} data-role={member.role}>
                      {member.is_owner ? "Owner" : member.role === "manager" ? "Manager" : "Care rep"}
                    </span>
                    {!member.is_active && <span className={styles.roleBadge}>Deactivated</span>}
                    <span>
                      {member.last_login_at ? `Last signed in ${dateTime(member.last_login_at)}` : "Never signed in"}
                    </span>
                  </div>
                </div>
                {/* The owner account lives in the server's .env; the API refuses changes to it. */}
                {member.is_owner ? (
                  <p className={styles.ownerNote}>Managed in the server&apos;s .env</p>
                ) : (
                  <div className={styles.teamActions}>
                    {!isMe && member.is_active && (
                      <button
                        type="button"
                        className={`btn btn-secondary ${styles.compact}`}
                        onClick={() =>
                          update(
                            member,
                            { role: member.role === "manager" ? "rep" : "manager" },
                            `${member.display_name} is now a ${member.role === "manager" ? "care rep" : "manager"}.`,
                          )
                        }
                      >
                        {member.role === "manager" ? "Make care rep" : "Make manager"}
                      </button>
                    )}
                    {member.is_active && (
                      <button
                        type="button"
                        className={`btn btn-secondary ${styles.compact}`}
                        aria-expanded={resetting === member.id}
                        onClick={() => {
                          setResetting(resetting === member.id ? null : member.id);
                          setNewPassword("");
                        }}
                      >
                        Reset password
                      </button>
                    )}
                    {!isMe && (
                      <button
                        type="button"
                        className={`btn btn-secondary ${styles.compact}`}
                        onClick={() =>
                          update(
                            member,
                            { is_active: !member.is_active },
                            member.is_active
                              ? `${member.display_name} can no longer sign in, and was signed out everywhere.`
                              : `${member.display_name} can sign in again.`,
                          )
                        }
                      >
                        {member.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                )}
                {resetting === member.id && (
                  <form className={styles.resetForm} onSubmit={(event) => resetPassword(event, member)} noValidate>
                    <label htmlFor={`${id}-reset-${member.id}`}>New password for {member.display_name}</label>
                    <input
                      id={`${id}-reset-${member.id}`}
                      className={styles.input}
                      type="text"
                      autoComplete="off"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                    <button type="submit" className="btn btn-primary">
                      Set password
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className={styles.form} onSubmit={add} noValidate>
        <h3 className={styles.subTitle}>Add a team member</h3>
        <label htmlFor={`${id}-name`}>Full name</label>
        <input
          id={`${id}-name`}
          className={styles.input}
          autoComplete="off"
          value={form.display_name}
          onChange={(event) => setForm({ ...form, display_name: event.target.value })}
        />
        <label htmlFor={`${id}-username`}>Username</label>
        <input
          id={`${id}-username`}
          className={styles.input}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. wanjiru"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
        />
        <label htmlFor={`${id}-password`}>Temporary password</label>
        <input
          id={`${id}-password`}
          className={styles.input}
          type="text"
          autoComplete="off"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <label htmlFor={`${id}-role`}>Role</label>
        <select
          id={`${id}-role`}
          className={styles.select}
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
        >
          <option value="rep">Care rep: dashboard, alerts and replies</option>
          <option value="manager">Manager: also manages the team</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Adding…" : "Add to team"}
        </button>
      </form>
      <p className={styles.muted} role="status">
        {message}
      </p>
    </div>
  );
}
