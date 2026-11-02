"use client";

import { useState } from "react";

import { adminApi, UnauthorizedError, type AiSummary as Summary, type Sentiment, type Stats } from "@/lib/admin";
import { dateTime, plural } from "@/lib/format";

import styles from "./admin.module.css";

export const SENTIMENTS: readonly { id: Sentiment; label: string }[] = [
  { id: "positive", label: "Positive" },
  { id: "mixed", label: "Mixed" },
  { id: "neutral", label: "Neutral" },
  { id: "negative", label: "Negative" },
];

type Props = {
  days: number;
  enabled: boolean;
  demo?: boolean;
  sentiment: Stats["sentiment"] | undefined;
  onError: (error: unknown) => void;
};

/** One click: the AI reads the period's comments and writes a plain-English briefing. */
export function AiSummary({ days, enabled, demo = false, sentiment, onError }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function summarize() {
    setBusy(true);
    setProblem(null);
    try {
      setSummary(await adminApi.summarize(days));
    } catch (error) {
      // An AI problem is shown here, in the card; the rest of the dashboard carries on.
      if (error instanceof UnauthorizedError) onError(error);
      else setProblem(error instanceof Error ? error.message : "AI summary failed");
    } finally {
      setBusy(false);
    }
  }

  const tagged = sentiment ? SENTIMENTS.reduce((sum, s) => sum + sentiment[s.id], 0) : 0;
  const stale = summary !== null && summary.days !== days;

  return (
    <div>
      {sentiment && tagged > 0 && (
        <p className={styles.mood}>
          <span className={styles.muted}>Comment mood:</span>{" "}
          {SENTIMENTS.filter((s) => sentiment[s.id] > 0).map((s) => (
            <span key={s.id} className={styles.moodItem}>
              <i className={styles.dot} data-sentiment={s.id} aria-hidden="true" />
              {sentiment[s.id]} {s.label.toLowerCase()}
            </span>
          ))}
          {sentiment.untagged > 0 && <span className={styles.muted}>· {sentiment.untagged} not tagged yet</span>}
        </p>
      )}

      {demo && (
        <p className={styles.demoBanner} role="note">
          <strong>Demo mode.</strong> Tags, summaries and reply drafts come from simple keyword rules,
          not real AI. Add <code>AI_API_KEY</code> to the backend&apos;s <code>.env</code> for the real thing.
        </p>
      )}

      {!enabled ? (
        <p className={styles.muted}>
          AI insights are switched off. Add <code>AI_API_KEY</code> to the backend&apos;s <code>.env</code> to turn
          them on. Everything else works without it.
        </p>
      ) : (
        <button type="button" className={`btn btn-primary ${styles.more}`} disabled={busy} onClick={summarize}>
          {busy ? "Reading the comments…" : summary ? "Summarise again" : `Summarise the last ${days} days`}
        </button>
      )}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}. Your feedback data is safe; try again in a moment.
        </p>
      )}

      {summary && (
        <div className={styles.summary} data-stale={stale} aria-live="polite">
          <p className={styles.headline}>{summary.headline}</p>
          <ul className={styles.themes}>
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
              <h3 className={styles.subTitle}>Suggested next steps</h3>
              <ol className={styles.actionsList}>
                {summary.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </>
          )}
          <p className={styles.aiNote}>
            ✦ AI-generated from{" "}
            {summary.comments_used < summary.comments_total
              ? `the latest ${summary.comments_used} of ${summary.comments_total} comments`
              : plural(summary.comments_total, "comment")}{" "}
            in the last {summary.days} days, {dateTime(summary.generated_at)}. Check the log before acting on it.
            {stale && " (Made for a different date range: summarise again to update.)"}
          </p>
        </div>
      )}
    </div>
  );
}
