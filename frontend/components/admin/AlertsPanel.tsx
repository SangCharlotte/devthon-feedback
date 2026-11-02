"use client";

import { useState } from "react";

import { adminApi, type AlertItem } from "@/lib/admin";
import { dateTime } from "@/lib/format";

import styles from "./admin.module.css";
import { ReplyComposer } from "./ReplyComposer";

type Props = {
  alerts: AlertItem[];
  aiEnabled: boolean;
  onUpdated: (alert: AlertItem) => void;
  onError: (error: unknown) => void;
};

/** Detractors waiting for a call back: the care rep's to-do list. */
export function AlertsPanel({ alerts, aiEnabled, onUpdated, onError }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<number | null>(null);

  async function update(alert: AlertItem, change: Parameters<typeof adminApi.updateAlert>[1]) {
    setBusyId(alert.id);
    try {
      onUpdated(await adminApi.updateAlert(alert.id, change));
    } catch (error) {
      onError(error);
    } finally {
      setBusyId(null);
    }
  }

  if (alerts.length === 0) {
    return <p className={styles.muted}>No open alerts. Every unhappy customer has been followed up.</p>;
  }

  return (
    <ul className={styles.alertList}>
      {alerts.map((alert) => (
        <li key={alert.id} className={styles.alert} data-unread={!alert.is_read}>
          <div className={styles.alertHead}>
            <strong>{alert.customer_name}</strong>
            {!alert.is_read && <span className={styles.newBadge}>New</span>}
            <span className={styles.scorePill} data-category="detractor">
              {alert.mean.toFixed(2)}
            </span>
          </div>
          <p className={styles.alertMeta}>
            {dateTime(alert.created_at)} · via {alert.channel === "sms" ? "SMS" : "web"} ·{" "}
            {alert.email_sent_at ? "care team emailed" : "email not delivered"}
          </p>
          {alert.replied_at && (
            <p className={styles.replied}>
              ✓ Replied {dateTime(alert.replied_at)}
              {alert.replied_by && ` by ${alert.replied_by}`}
            </p>
          )}
          <p className={styles.contact}>
            {alert.customer_email && <a href={`mailto:${alert.customer_email}`}>{alert.customer_email}</a>}
            {alert.customer_phone && <a href={`tel:${alert.customer_phone}`}>{alert.customer_phone}</a>}
          </p>
          {replyingId === alert.id ? (
            <ReplyComposer
              alert={alert}
              aiEnabled={aiEnabled}
              onCancel={() => setReplyingId(null)}
              onError={onError}
              onSent={(updated) => {
                setReplyingId(null);
                onUpdated(updated);
              }}
            />
          ) : (
            alert.customer_email && (
              <button
                type="button"
                className={`btn btn-secondary ${styles.replyButton}`}
                onClick={() => setReplyingId(alert.id)}
              >
                {aiEnabled ? "✦ Draft a reply" : "Write a reply"}
              </button>
            )
          )}
          <div className={styles.actions}>
            {!alert.is_read && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busyId === alert.id}
                onClick={() => update(alert, { is_read: true })}
              >
                Mark read
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busyId === alert.id}
              onClick={() => update(alert, { status: "resolved" })}
            >
              Resolved
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
