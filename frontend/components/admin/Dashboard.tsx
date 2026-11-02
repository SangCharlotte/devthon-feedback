"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { adminApi, UnauthorizedError, type AlertItem, type Me, type Stats } from "@/lib/admin";
import { plural } from "@/lib/format";

import { ThemeToggle } from "../ThemeToggle";
import styles from "./admin.module.css";
import { AiSummary } from "./AiSummary";
import { AlertsPanel } from "./AlertsPanel";
import { PasswordForm } from "./PasswordForm";
import { ResponsesLog } from "./ResponsesLog";
import { SmsInvite } from "./SmsInvite";
import { SplitDonut } from "./SplitDonut";
import { TeamPanel } from "./TeamPanel";
import { TrendChart } from "./TrendChart";

const RANGES = [7, 30, 90] as const;
// Polling: simple and reliable. Every 20 s we ask "anything new?".
const REFRESH_MS = 20_000;

type Toast = { id: number; text: string };

export function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDemo, setAiDemo] = useState(false);
  const seenAlerts = useRef<Set<number> | null>(null);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof UnauthorizedError) router.replace("/admin/login");
      else setProblem(error instanceof Error ? error.message : "Something went wrong.");
    },
    [router],
  );

  // The page is public HTML; the API decides who may see data. 401 -> login page.
  useEffect(() => {
    adminApi.me().then((me) => {
      setMe(me);
      // AI is optional: if the status check fails, we just leave the AI buttons hidden.
      adminApi.aiStatus().then(
        (status) => {
          setAiEnabled(status.enabled);
          setAiDemo(status.demo);
        },
        () => setAiEnabled(false),
      );
    }, handleError);
  }, [handleError]);

  const refresh = useCallback(async () => {
    try {
      const [nextStats, openAlerts] = await Promise.all([adminApi.stats(days), adminApi.alerts("open")]);
      setStats(nextStats);
      setAlerts(openAlerts);
      setProblem(null);

      // In-app notification for detractors that arrived since the last check.
      const seen = seenAlerts.current;
      if (seen) {
        const fresh = openAlerts.filter((a) => !seen.has(a.id));
        if (fresh.length > 0) {
          setToasts((current) => [
            ...current,
            ...fresh.map((a) => ({
              id: a.id,
              text: `New detractor: ${a.customer_name} (${a.customer_email ?? a.customer_phone}) scored ${a.mean.toFixed(2)}`,
            })),
          ]);
          setRefreshKey((k) => k + 1); // new response: refresh the log too
        }
      }
      seenAlerts.current = new Set([...(seen ?? []), ...openAlerts.map((a) => a.id)]);
    } catch (error) {
      handleError(error);
    }
  }, [days, handleError]);

  useEffect(() => {
    if (!me) return;
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [me, refresh]);

  // Unread count in the browser tab, so a rep on another tab still notices.
  const unread = stats?.alerts.unread ?? 0;
  useEffect(() => {
    document.title = `${unread > 0 ? `(${unread}) ` : ""}Dashboard · Company X Paints`;
  }, [unread]);

  function onAlertUpdated(updated: AlertItem) {
    setAlerts((current) =>
      updated.status === "open" ? current.map((a) => (a.id === updated.id ? updated : a)) : current.filter((a) => a.id !== updated.id),
    );
    setRefreshKey((k) => k + 1);
    void refresh();
  }

  async function logout() {
    await adminApi.logout().catch(() => undefined);
    router.replace("/admin/login");
  }

  if (!me) return <p className={styles.loading}>Checking your session…</p>;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.logo} aria-hidden="true" />
          Insights
        </span>
        <div className={styles.headerActions}>
          <span className={styles.muted}>
            {me.display_name}
            {me.role === "manager" && " · manager"}
          </span>
          {/* The owner's password lives in the server's .env, so only staff get this button. */}
          {!me.is_owner && (
            <button
              type="button"
              className={`btn btn-secondary ${styles.compact}`}
              aria-expanded={showPassword}
              onClick={() => setShowPassword((open) => !open)}
            >
              Password
            </button>
          )}
          <button type="button" className={`btn btn-secondary ${styles.compact}`} onClick={logout}>
            Log out
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* One filter row scopes every number below it, so they always agree. */}
      <div className={styles.rangeRow} role="group" aria-label="Date range">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className={styles.chip}
            aria-pressed={days === range}
            onClick={() => setDays(range)}
          >
            Last {range} days
          </button>
        ))}
      </div>

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      {showPassword && (
        <section className={`card ${styles.accountCard}`} aria-labelledby="password-title">
          <h2 id="password-title" className={styles.cardTitle}>
            Change your password
          </h2>
          <PasswordForm onDone={() => setShowPassword(false)} onError={handleError} />
        </section>
      )}

      <div className={styles.grid} data-loading={stats?.days !== days}>
        <section className={`card ${styles.hero}`} aria-labelledby="total-title">
          <h2 id="total-title" className={styles.cardTitle}>
            Total respondents
          </h2>
          <p className={styles.heroValue}>{stats ? stats.total_respondents.toLocaleString() : "–"}</p>
          {stats && (
            <p className={styles.muted}>
              {plural(stats.total_responses, "response")} in the last {stats.days} days ·{" "}
              {stats.all_time_respondents.toLocaleString()} all time
              {stats.average_score !== null && <> · average score {stats.average_score.toFixed(2)}</>}
            </p>
          )}
        </section>

        <section className={`card ${styles.alertsCard}`} aria-labelledby="alerts-title">
          <h2 id="alerts-title" className={styles.cardTitle}>
            Needs follow-up {alerts.length > 0 && <span className={styles.countBadge}>{alerts.length}</span>}
          </h2>
          {/* Stats and alerts arrive together: until then, don't claim "no open alerts". */}
          {stats ? (
            <AlertsPanel alerts={alerts} aiEnabled={aiEnabled} onUpdated={onAlertUpdated} onError={handleError} />
          ) : (
            <p className={styles.muted}>Loading alerts…</p>
          )}
        </section>

        <section className={`card ${styles.trend}`} aria-labelledby="trend-title">
          <h2 id="trend-title" className={styles.cardTitle}>
            Score trend
          </h2>
          <p className={styles.muted}>
            Average score per day, 1 to 5. Below 3 is a detractor.
            {stats?.trend_per_day != null && <> {trendWords(stats.trend_per_day)}</>}
          </p>
          {stats && <TrendChart daily={stats.daily} projection={stats.projection} />}
        </section>

        <section className={`card ${styles.split}`} aria-labelledby="split-title">
          <h2 id="split-title" className={styles.cardTitle}>
            Customer split
          </h2>
          {stats && <SplitDonut split={stats.split} />}
        </section>

        <section className={`card ${styles.aiCard}`} aria-labelledby="ai-title">
          <h2 id="ai-title" className={styles.cardTitle}>
            ✦ What customers are saying
          </h2>
          <AiSummary
            days={days}
            enabled={aiEnabled}
            demo={aiDemo}
            sentiment={stats?.sentiment}
            onError={handleError}
          />
        </section>

        <section className={`card ${styles.invite}`} aria-labelledby="invite-title">
          <h2 id="invite-title" className={styles.cardTitle}>
            Invite by SMS
          </h2>
          <SmsInvite onError={handleError} />
        </section>

        <section className={`card ${styles.logCard}`} aria-labelledby="log-title">
          <h2 id="log-title" className={styles.cardTitle}>
            Individual ratings
          </h2>
          <ResponsesLog days={days} refreshKey={refreshKey} onError={handleError} />
        </section>

        {me.role === "manager" && (
          <section className={`card ${styles.teamCard}`} aria-labelledby="team-title">
            <h2 id="team-title" className={styles.cardTitle}>
              Team
            </h2>
            <p className={styles.muted}>
              Everyone signs in as themselves, so each reply shows who sent it. Deactivating someone signs them out
              at once.
            </p>
            <TeamPanel currentUsername={me.username} onError={handleError} />
          </section>
        )}
      </div>

      <div className={styles.toasts} aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} role="status">
            <span>{toast.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function trendWords(perDay: number): string {
  const perWeek = perDay * 7;
  if (Math.abs(perWeek) < 0.05) return "Holding steady.";
  return `${perWeek > 0 ? "Improving" : "Slipping"} by about ${Math.abs(perWeek).toFixed(2)} points a week.`;
}
