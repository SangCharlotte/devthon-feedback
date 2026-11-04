"use client";

import type { DayPoint, ProjectedPoint } from "@/lib/admin";
import { shortDate } from "@/lib/chart";
import { plural } from "@/lib/format";

import { LineChart, type Series } from "./LineChart";

/** Daily average score, 1 to 5, with the dashed 7-day projection continuing the line. */
export function TrendChart({ daily, projection }: { daily: DayPoint[]; projection: ProjectedPoint[] }) {
  const dates = [...daily.map((d) => d.date), ...projection.map((p) => p.date)];
  const lastIndex = daily.findLastIndex((d) => d.average !== null);
  const series: Series[] = [
    {
      id: "average",
      label: "Daily average",
      color: "var(--brand)",
      values: [...daily.map((d) => d.average), ...projection.map(() => null)],
    },
  ];
  if (projection.length > 0) {
    series.push({
      id: "projection",
      label: `Projection, next ${projection.length} days`,
      color: "var(--orange)",
      dashed: true,
      values: [...daily.map(() => null), ...projection.map((p) => p.average)],
      lead: lastIndex >= 0 ? { index: lastIndex, value: daily[lastIndex].average! } : undefined,
    });
  }

  return (
    <LineChart
      dates={dates}
      series={series}
      domain={[1, 5]}
      ticks={[1, 2, 3, 4, 5]}
      format={(v) => v.toFixed(2)}
      tickFormat={String}
      summary={summary(daily, projection)}
      note={{
        label: "Responses",
        text: (i) => (i < daily.length ? plural(daily[i].responses, "response") : "projected"),
      }}
      zone={projection.length > 0 ? { from: daily.length, label: "Projected" } : undefined}
      highlight="average"
    />
  );
}

function summary(daily: DayPoint[], projection: ProjectedPoint[]): string {
  const known = daily.filter((d) => d.average !== null);
  if (known.length === 0) return "Score trend: no feedback in this period.";
  const latest = known[known.length - 1];
  const ahead = projection[projection.length - 1];
  return (
    `Daily average score over ${daily.length} days, latest ${latest.average} on ${shortDate(latest.date)}.` +
    (ahead ? ` Projected ${ahead.average} by ${shortDate(ahead.date)}.` : "")
  );
}
