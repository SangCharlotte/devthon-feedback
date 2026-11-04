import type { Category } from "@/lib/api";
import type { DayPoint, Stats, TopicCount } from "@/lib/admin";

export type Trend = "up" | "down" | "flat";
/** `good` says whether the change is welcome: fewer detractors is a fall, but good news. */
export type Delta = { text: string; trend: Trend; good: boolean };

export type KpiId = "rating" | "respondents" | "positive" | "negative";
export type Kpi = { id: KpiId; label: string; value: string; unit?: string; secondary?: string; delta: Delta | null };

const share = (part: number, total: number) => (total === 0 ? null : (part / total) * 100);

function delta(
  change: number | null,
  text: (abs: number) => string,
  higherIsBetter: boolean,
  epsilon: number,
): Delta | null {
  if (change === null || !Number.isFinite(change)) return null;
  if (Math.abs(change) < epsilon) return { text: "No change", trend: "flat", good: true };
  const trend: Trend = change > 0 ? "up" : "down";
  return { text: `${change > 0 ? "+" : "−"}${text(Math.abs(change))}`, trend, good: change > 0 === higherIsBetter };
}

function minus(current: number | null, previous: number | null | undefined) {
  return current === null || previous === null || previous === undefined ? null : current - previous;
}

/** The four headline cards, each compared with the equal-length period just before. */
export function kpis(stats: Stats): Kpi[] {
  const prev = stats.previous;
  const prevTotal = prev ? prev.split.detractor + prev.split.passive + prev.split.promoter : 0;
  const catShare = (c: Category) => share(stats.split[c], stats.total_responses);
  const prevShare = (c: Category) => (prev ? share(prev.split[c], prevTotal) : null);
  const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v)}`);
  const pts = (v: number) => `${Math.round(v)} pts`;

  return [
    {
      id: "rating",
      label: "Overall rating",
      value: stats.average_score === null ? "–" : stats.average_score.toFixed(1),
      unit: "/ 5",
      delta: delta(minus(stats.average_score, prev?.average_score), (v) => v.toFixed(1), true, 0.05),
    },
    {
      id: "respondents",
      label: "Total respondents",
      value: stats.total_respondents.toLocaleString(),
      secondary: `${stats.total_responses.toLocaleString()} responses`,
      delta: delta(
        prev && prev.total_respondents > 0
          ? ((stats.total_respondents - prev.total_respondents) / prev.total_respondents) * 100
          : null,
        (v) => `${Math.round(v)}%`,
        true,
        0.5,
      ),
    },
    {
      id: "positive",
      label: "Positive feedback",
      value: pct(catShare("promoter")),
      unit: "%",
      secondary: "promoters",
      delta: delta(minus(catShare("promoter"), prevShare("promoter")), pts, true, 0.5),
    },
    {
      id: "negative",
      label: "Negative feedback",
      value: pct(catShare("detractor")),
      unit: "%",
      secondary: "detractors",
      delta: delta(minus(catShare("detractor"), prevShare("detractor")), pts, false, 0.5),
    },
  ];
}

export type Tone = "positive" | "mixed" | "negative";

/** A theme is green when mostly praised, amber when split, red when mostly complaints. */
export function topicTone(topic: TopicCount): Tone {
  const negative = topic.count === 0 ? 0 : topic.negative / topic.count;
  return negative > 0.5 ? "negative" : negative >= 0.25 ? "mixed" : "positive";
}

/**
 * Share of positive (promoter), neutral (passive) and negative (detractor)
 * responses per day, in percent, over a trailing window of `window` days.
 * A few responses a day swing a raw daily share between 0% and 100%; the
 * window shows the direction instead. No responses in the window is a gap.
 */
export function sentimentShares(
  daily: DayPoint[],
  window = 1,
): Record<"positive" | "neutral" | "negative", (number | null)[]> {
  const sums = daily.map((_, i) => {
    const span = daily.slice(Math.max(0, i - window + 1), i + 1);
    const add = (pick: (d: DayPoint) => number) => span.reduce((sum, d) => sum + pick(d), 0);
    return { promoter: add((d) => d.promoter), passive: add((d) => d.passive), detractor: add((d) => d.detractor) };
  });
  const of = (pick: (d: (typeof sums)[number]) => number) =>
    sums.map((d) => share(pick(d), d.detractor + d.passive + d.promoter));
  return { positive: of((d) => d.promoter), neutral: of((d) => d.passive), negative: of((d) => d.detractor) };
}
