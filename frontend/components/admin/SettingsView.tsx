"use client";

import styles from "./admin.module.css";
import { useAdmin } from "./AdminContext";
import { PasswordForm } from "./PasswordForm";
import { TeamPanel } from "./TeamPanel";
import { Card, PageHeader } from "./ui";

export function SettingsView() {
  const { me, handleError } = useAdmin();

  return (
    <>
      <PageHeader title="Settings" subtitle="Your team and your account" icon="settings" />
      <div className={styles.settingsGrid}>
        {me.role === "manager" && (
          <Card title="Team" icon="users">
            <p className={styles.muted}>
              Everyone signs in as themselves, so each reply shows who sent it. Deactivating someone signs them out at
              once.
            </p>
            <TeamPanel currentUsername={me.username} onError={handleError} />
          </Card>
        )}
        {me.is_owner ? (
          <Card title="Your account" icon="key">
            <p className={styles.muted}>
              You are signed in as the owner. This account&apos;s password is set in the server&apos;s <code>.env</code>{" "}
              file, so it can&apos;t be changed here.
            </p>
          </Card>
        ) : (
          <div id="password">
            <Card title="Change your password" icon="key">
              <PasswordForm onError={handleError} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
