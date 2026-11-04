"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { adminApi, UnauthorizedError, type AiSummary } from "@/lib/admin";
import { percent } from "@/lib/chart";
import { dateTime, plural } from "@/lib/format";

import { useAdmin } from "./AdminContext";
import { SENTIMENTS } from "./domain";
import { Icon } from "./icons";
import styles from "./inbox.module.css";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "sentiment", label: "Sentiment" },
  { id: "insights", label: "AI Insights" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** One click: the AI reads the period's comments and writes a plain-English briefing. */
export function InsightsPanel() {
  const { days, ai, handleError } = useAdmin();
  const [tab, setTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  async function summarize() {
    setBusy(true);
    setProblem(null);
    try {
      setSummary(await adminApi.summarize(days));
    } catch (error) {
      // An AI problem stays in this panel; the inbox carries on (brief rule 03).
      if (error instanceof UnauthorizedError) handleError(error);
      else setProblem(error instanceof Error ? error.message : "AI summary failed");
    } finally {
      setBusy(false);
    }
  }

  function onTabKey(event: KeyboardEvent, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next = (index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const stale = summary !== null && summary.days !== days;
  const ask = ai.enabled ? (
    <button type="button" className={`btn btn-primary ${styles.ask}`} disabled={busy} onClick={summarize}>
      <Icon name="sparkle" size={18} />
      {busy ? "Reading the comments…" : summary ? "Summarise again" : "What are customers saying?"}
    </button>
  ) : (
    <p className={styles.mutedLine}>
      AI insights are switched off. Add <code>AI_API_KEY</code> to the backend&apos;s <code>.env</code> to turn them on.
      Everything else works without it.
    </p>
  );

  return (
    <section className={`card ${styles.insights}`} aria-label="Insights">
      <div className={styles.tabs} role="tablist" aria-label="Insights">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => onTabKey(event, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {ai.demo && (
          <p className={styles.demo} role="note">
            <strong>Demo mode.</strong> Tags, summaries and reply drafts come from simple keyword rules, not real AI.
            Add <code>AI_API_KEY</code> to the backend&apos;s <code>.env</code> for the real thing.
          </p>
        )}
        {tab === "summary" && (
          <>
            <h2 className={styles.panelTitle}>
              <Icon name="sparkle" size={20} /> What customers are saying
            </h2>
            {summary ? (
              <div className={styles.summary} data-stale={stale} aria-live="polite">
                <p className={styles.headline}>{summary.headline}</p>
                <ul className={styles.themeChips}>
                  {summary.themes.map((theme) => (
                    <li key={theme.title} data-sentiment={theme.sentiment}>
                      {theme.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              ai.enabled && (
                <p className={styles.mutedLine}>
                  Ask the AI to read the last {days} days of comments and pick out the themes.
                </p>
              )
            )}
            {ask}
          </>
        )}
        {tab === "sentiment" && <SentimentBars />}
        {tab === "insights" &&
          (summary ? (
            <div className={styles.summary} data-stale={stale}>
              <ul className={styles.themeDetails}>
                {summary.themes.map((theme) => (
                  <li key={theme.title}>
                    <i className={styles.dot} data-sentiment={theme.sentiment} aria-hidden="true" />
                    <span>
                      <strong>{theme.title}.</strong> {theme.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {summary.actions.length > 0 && (
                <>
                  <h3 className={styles.drawerTitle}>Suggested next steps</h3>
                  <ol className={styles.actionsList}>
                    {summary.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          ) : (
            <>
              <p className={styles.mutedLine}>Theme details and suggested next steps appear after a summary.</p>
              {ask}
            </>
          ))}

        {problem && (
          <p className={styles.error} role="alert">
            {problem}. Your feedback data is safe; try again in a moment.
          </p>
        )}
        {summary && tab !== "sentiment" && (
          <p className={styles.aiNote}>
            ✦ AI-generated from{" "}
            {summary.comments_used < summary.comments_total
              ? `the latest ${summary.comments_used} of ${summary.comments_total} comments`
              : plural(summary.comments_total, "comment")}{" "}
            in the last {summary.days} days, {dateTime(summary.generated_at)}. Check the inbox before acting on it.
            {stale && " (Made for a different date range: summarise again to update.)"}
          </p>
        )}
      </div>
    </section>
  );
}

function SentimentBars() {
  const { stats } = useAdmin();
  if (!stats) return null;
  const tagged = SENTIMENTS.reduce((sum, s) => sum + stats.sentiment[s.id], 0);
  if (tagged === 0) {
    return <p className={styles.mutedLine}>No comments have a sentiment tag in the last {stats.days} days yet.</p>;
  }
  return (
    <>
      <h2 className={styles.panelTitle}>Comment sentiment</h2>
      <ul className={styles.bars}>
        {SENTIMENTS.map((s) => (
          <li key={s.id}>
            <span className={styles.barLabel}>
              {s.label}
              <span>
                <strong>{stats.sentiment[s.id]}</strong> {percent(stats.sentiment[s.id], tagged)}
              </span>
            </span>
            <span className={styles.barTrack} aria-hidden="true">
              <i style={{ width: percent(stats.sentiment[s.id], tagged), background: s.color }} />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.mutedLine}>
        {plural(tagged, "tagged comment")} in the last {stats.days} days
        {stats.sentiment.untagged > 0 && `, ${stats.sentiment.untagged} not tagged yet`}.
      </p>
    </>
  );
}
