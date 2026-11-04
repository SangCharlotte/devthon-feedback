"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { adminApi, type ResponseItem, type Stats } from "@/lib/admin";
import { percent } from "@/lib/chart";
import { plural, timeAgo } from "@/lib/format";

import { useAdmin } from "./AdminContext";
import styles from "./dashboard.module.css";
import { SEGMENTS } from "./domain";
import { Donut } from "./Donut";
import { Icon, type IconName } from "./icons";
import { kpis, sentimentShares, topicTone, type KpiId } from "./kpis";
import { LineChart } from "./LineChart";
import { Avatar, Card, PageHeader, RangeSelect, ScorePill, SentimentBadge } from "./ui";

const KPI_LOOK: Record<KpiId, { icon: IconName; tone: string }> = {
  rating: { icon: "star", tone: "yellow" },
  respondents: { icon: "users", tone: "violet" },
  positive: { icon: "smile", tone: "green" },
  negative: { icon: "frown", tone: "red" },
};

export function DashboardView() {
  const { stats, days } = useAdmin();

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Real-time insights from your customers">
        <RangeSelect />
      </PageHeader>
      {stats ? (
        <div className={styles.grid} data-loading={stats.days !== days}>
          <KpiRow stats={stats} />
          <Card
            title="Feedback Trend"
            className={styles.trend}
            action={
              <span className={styles.cardNote}>
                {trendWindow(stats.days) > 1 ? `${trendWindow(stats.days)}-day rolling share` : "Daily share"}
              </span>
            }
          >
            <SentimentTrend stats={stats} />
          </Card>
          <Card title="Customer Segments" className={styles.segments}>
            <Donut
              size={160}
              unit={["respondent", "respondents"]}
              slices={SEGMENTS.map((s) => ({ ...s, value: stats.segments[s.id] }))}
            />
          </Card>
          <Card title="Top Feedback Themes" className={styles.themes}>
            <Themes stats={stats} />
          </Card>
          <Attention stats={stats} />
          <Card
            title="Latest feedback"
            className={styles.latest}
            action={
              <Link href="/admin/feedback" className={styles.viewAll}>
                View all <Icon name="arrowRight" size={16} />
              </Link>
            }
          >
            <LatestFeedback />
          </Card>
        </div>
      ) : (
        <p className={styles.loading}>Loading the numbers…</p>
      )}
    </>
  );
}

function KpiRow({ stats }: { stats: Stats }) {
  return (
    <ul className={styles.kpis} aria-label="Key numbers">
      {kpis(stats).map((kpi) => {
        const look = KPI_LOOK[kpi.id];
        return (
          <li key={kpi.id} className={styles.kpi} data-tone={look.tone}>
            <span className={styles.kpiIcon}>
              <Icon name={look.icon} size={22} />
            </span>
            <p className={styles.kpiLabel}>{kpi.label}</p>
            <p className={styles.kpiValue}>
              {kpi.value}
              {kpi.unit && <small>{kpi.unit}</small>}
            </p>
            {kpi.secondary && <p className={styles.kpiSecondary}>{kpi.secondary}</p>}
            {kpi.delta && (
              <p className={styles.delta} data-good={kpi.delta.good} data-trend={kpi.delta.trend}>
                {kpi.delta.trend !== "flat" && (
                  <Icon name={kpi.delta.trend === "up" ? "arrowUp" : "arrowDown"} size={14} />
                )}
                <strong>{kpi.delta.text}</strong> vs prev. {stats.days} days
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Ranges longer than a week plot a trailing 7-day share, so a single unhappy customer doesn't spike the line.
const trendWindow = (days: number) => (days > 7 ? 7 : 1);

function SentimentTrend({ stats }: { stats: Stats }) {
  const window = trendWindow(stats.days);
  const shares = sentimentShares(stats.daily, window);
  const latest = stats.daily.findLast((d) => d.responses > 0);
  return (
    <LineChart
      smooth
      dates={stats.daily.map((d) => d.date)}
      series={[
        { id: "positive", label: "Positive", color: "var(--cat-promoter)", values: shares.positive },
        { id: "neutral", label: "Neutral", color: "var(--cat-passive)", values: shares.neutral },
        { id: "negative", label: "Negative", color: "var(--cat-detractor)", values: shares.negative },
      ]}
      domain={[0, 100]}
      ticks={[0, 25, 50, 75, 100]}
      format={(v) => `${Math.round(v)}%`}
      highlight="positive"
      summary={
        latest
          ? `${window > 1 ? `Trailing ${window}-day` : "Daily"} share of positive, neutral and negative responses over ${stats.days} days. ` +
            `Latest day: ${percent(latest.promoter, latest.responses)} positive, ` +
            `${percent(latest.detractor, latest.responses)} negative.`
          : "Feedback trend: no feedback in this period."
      }
      note={{ label: "Responses that day", text: (i) => plural(stats.daily[i].responses, "response") }}
    />
  );
}

function Themes({ stats }: { stats: Stats }) {
  const { ai } = useAdmin();
  if (stats.topics.length === 0) {
    return (
      <p className={styles.muted}>
        {ai.enabled
          ? "No themes yet. They appear here once the AI has tagged some comments."
          : "Themes come from AI comment tagging, which is switched off."}
      </p>
    );
  }
  return (
    <ul className={styles.chips}>
      {stats.topics.map((topic) => {
        const tone = topicTone(topic);
        return (
          <li key={topic.topic} className={styles.chip} data-tone={tone}>
            <Icon name="bars" size={16} />
            <span className={styles.chipTopic}>{topic.topic}</span>
            <strong>{percent(topic.count, stats.tagged_comments)}</strong>
            <span className="visually-hidden">
              of tagged comments, mostly {tone === "negative" ? "negative" : tone === "mixed" ? "mixed" : "positive"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Attention({ stats }: { stats: Stats }) {
  const negative = stats.split.detractor;
  return (
    <section className={`card ${styles.attention}`} aria-labelledby="attention-title">
      <div className={styles.attentionBody}>
        <span className={styles.attentionIcon}>
          <Icon name="warning" size={24} />
        </span>
        <h2 id="attention-title">Attention Needed</h2>
        <p className={styles.attentionLead}>
          {plural(negative, "negative review")} in the last {stats.days} days
        </p>
        <p className={styles.muted}>
          {stats.alerts.open === 0
            ? "Every unhappy customer has been followed up."
            : `${plural(stats.alerts.open, "open alert")} waiting for a call back.`}
        </p>
        <Link href="/admin/alerts" className={styles.attentionLink}>
          View Details <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      <PaintbrushArt />
    </section>
  );
}

/** A brush loaded with red paint, mid-stroke. Decorative. */
function PaintbrushArt() {
  return (
    <svg className={styles.brushArt} viewBox="0 0 160 140" aria-hidden="true">
      <path
        d="M8 118c30-14 64-20 104-16 14 1 26 4 34 8-30 2-66 8-104 18-14 4-26 2-34-10z"
        style={{ fill: "var(--red)" }}
        opacity="0.85"
      />
      <path
        d="M24 120c34-10 70-14 108-12"
        style={{ stroke: "var(--surface)" }}
        strokeOpacity="0.4"
        strokeWidth="2"
        fill="none"
      />
      <g transform="rotate(-38 96 66)">
        <rect x="88" y="-6" width="16" height="70" rx="8" style={{ fill: "var(--orange)" }} />
        <rect x="92" y="2" width="4" height="52" rx="2" style={{ fill: "var(--surface)" }} opacity="0.35" />
        <rect x="84" y="60" width="24" height="18" rx="3" style={{ fill: "var(--muted)" }} />
        <path d="M84 66h24M84 72h24" style={{ stroke: "var(--surface)" }} strokeOpacity="0.4" strokeWidth="1.5" />
        <path d="M84 78h24l-2 22c-1 8-6 12-10 12s-9-4-10-12z" style={{ fill: "var(--yellow)" }} />
        <path d="M84.6 88h22.8l-1.4 12c-1 8-6 12-10 12s-9-4-10-12z" style={{ fill: "var(--red)" }} />
        <path d="M96 112c0 6 2 10 0 14-2-4 0-8 0-14z" style={{ fill: "var(--red)" }} />
      </g>
      <circle cx="132" cy="122" r="3" style={{ fill: "var(--red)" }} />
    </svg>
  );
}

const LATEST = 5;

/** New responses slide in at the top whenever the shell's poll finds them. */
function LatestFeedback() {
  const { tick, handleError } = useAdmin();
  const [items, setItems] = useState<ResponseItem[] | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .responses({ limit: LATEST })
      .then((page) => {
        if (cancelled) return;
        const known = seen.current;
        setFresh(new Set(known ? page.items.filter((i) => !known.has(i.id)).map((i) => i.id) : []));
        seen.current = new Set([...(known ?? []), ...page.items.map((i) => i.id)]);
        setItems(page.items);
      })
      .catch((error) => !cancelled && handleError(error));
    return () => {
      cancelled = true;
    };
  }, [tick, handleError]);

  if (items === null) return <p className={styles.muted}>Loading…</p>;
  if (items.length === 0) return <p className={styles.muted}>No feedback yet. Share the form link to get started.</p>;

  return (
    <ul className={styles.latestList} aria-live="polite">
      {items.map((item) => (
        <li key={item.id} className={styles.latestItem} data-new={fresh.has(item.id)}>
          <Avatar name={item.customer_name} size={40} />
          <div className={styles.latestText}>
            <p>
              <strong>{item.customer_name}</strong> <span className={styles.muted}>{timeAgo(item.created_at)}</span>
            </p>
            <p className={styles.latestQuote}>
              {item.comment ? `“${item.comment}”` : `Scored ${item.q1} · ${item.q2} · ${item.q3}`}
            </p>
          </div>
          {item.ai_sentiment ? (
            <SentimentBadge sentiment={item.ai_sentiment} />
          ) : (
            <ScorePill mean={item.mean} category={item.category} digits={1} />
          )}
        </li>
      ))}
    </ul>
  );
}
