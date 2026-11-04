"use client";

import { useEffect, useState } from "react";

import { adminApi, CHANNEL_LABELS, type AlertItem, type AlertStatus } from "@/lib/admin";
import { dateTime, timeAgo } from "@/lib/format";

import styles from "./admin.module.css";
import { useAdmin } from "./AdminContext";
import { Icon } from "./icons";
import { ReplyComposer } from "./ReplyComposer";
import { Avatar, PageHeader, ScorePill } from "./ui";

/** Detractors waiting for a call back: the care rep's to-do list. */
export function AlertsView() {
  const { tick, stats, refresh, handleError } = useAdmin();
  const [tab, setTab] = useState<AlertStatus>("open");
  const [loaded, setLoaded] = useState<{ tab: AlertStatus; alerts: AlertItem[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi.alerts(tab).then(
      (alerts) => !cancelled && setLoaded({ tab, alerts }),
      (error) => !cancelled && handleError(error),
    );
    return () => {
      cancelled = true;
    };
  }, [tab, tick, handleError]);

  function onUpdated(updated: AlertItem) {
    setLoaded(
      (current) =>
        current && {
          ...current,
          alerts:
            updated.status === current.tab
              ? current.alerts.map((a) => (a.id === updated.id ? updated : a))
              : current.alerts.filter((a) => a.id !== updated.id),
        },
    );
    void refresh();
  }

  const alerts = loaded?.tab === tab ? loaded.alerts : null;
  const open = stats?.alerts.open;

  return (
    <>
      <PageHeader title="Alerts" subtitle="Detractors to call back, newest first" icon="bell" />
      <div className={styles.segmented} role="group" aria-label="Alert status">
        <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>
          Open{open !== undefined && <span className={styles.countBadge}>{open}</span>}
        </button>
        <button type="button" aria-pressed={tab === "resolved"} onClick={() => setTab("resolved")}>
          Resolved
        </button>
      </div>

      {alerts === null ? (
        <p className={styles.muted}>Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <div className={`card ${styles.emptyCard}`}>
          <Icon name="check" size={28} />
          <p>
            {tab === "open" ? "No open alerts. Every unhappy customer has been followed up." : "Nothing resolved yet."}
          </p>
        </div>
      ) : (
        <ul className={styles.alertGrid}>
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </>
  );
}

function AlertCard({ alert, onUpdated }: { alert: AlertItem; onUpdated: (alert: AlertItem) => void }) {
  const { ai, handleError } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);

  async function update(change: Parameters<typeof adminApi.updateAlert>[1]) {
    setBusy(true);
    try {
      onUpdated(await adminApi.updateAlert(alert.id, change));
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`card ${styles.alert}`} data-unread={!alert.is_read} data-status={alert.status}>
      <div className={styles.alertHead}>
        <Avatar name={alert.customer_name} />
        <div>
          <h2>
            {alert.customer_name}
            {!alert.is_read && <span className={styles.newBadge}>New</span>}
          </h2>
          <p className={styles.alertMeta}>
            {timeAgo(alert.created_at)} · via {CHANNEL_LABELS[alert.channel]} ·{" "}
            {alert.email_sent_at ? "care team emailed" : "email not delivered"}
          </p>
        </div>
        <ScorePill mean={alert.mean} category="detractor" />
      </div>

      <p className={styles.contact}>
        {alert.customer_email && (
          <a href={`mailto:${alert.customer_email}`}>
            <Icon name="mail" size={16} />
            {alert.customer_email}
          </a>
        )}
        {alert.customer_phone && (
          <a href={`tel:${alert.customer_phone}`}>
            <Icon name="phone" size={16} />
            {alert.customer_phone}
          </a>
        )}
      </p>

      {alert.replied_at && (
        <p className={styles.replied}>
          <Icon name="check" size={16} /> Replied {dateTime(alert.replied_at)}
          {alert.replied_by && ` by ${alert.replied_by}`}
        </p>
      )}
      {alert.resolved_at && <p className={styles.alertMeta}>Resolved {dateTime(alert.resolved_at)}</p>}

      {alert.status === "open" &&
        (replying ? (
          <ReplyComposer
            alert={alert}
            aiEnabled={ai.enabled}
            onCancel={() => setReplying(false)}
            onError={handleError}
            onSent={(updated) => {
              setReplying(false);
              onUpdated(updated);
            }}
          />
        ) : (
          <div className={styles.actions}>
            {alert.customer_email && (
              <button type="button" className="btn btn-secondary" onClick={() => setReplying(true)}>
                <Icon name={ai.enabled ? "sparkle" : "mail"} size={18} />
                {ai.enabled ? "Draft a reply" : "Write a reply"}
              </button>
            )}
            {!alert.is_read && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => update({ is_read: true })}
              >
                Mark read
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => update({ status: "resolved" })}
            >
              <Icon name="check" size={18} /> Resolved
            </button>
          </div>
        ))}
    </li>
  );
}
