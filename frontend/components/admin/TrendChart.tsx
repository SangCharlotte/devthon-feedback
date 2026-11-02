"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import type { DayPoint, ProjectedPoint } from "@/lib/admin";
import { linePath, linearScale, shortDate, tickIndexes } from "@/lib/chart";

import styles from "./TrendChart.module.css";
import { useElementWidth } from "./useElementWidth";

const HEIGHT = 240;
const MARGIN = { top: 16, right: 44, bottom: 28, left: 28 };
const SCORES = [1, 2, 3, 4, 5];

type Slot = { date: string; average: number | null; responses: number | null; projected: boolean };

type Props = { daily: DayPoint[]; projection: ProjectedPoint[] };

export function TrendChart({ daily, projection }: Props) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);

  // History and projection share one x-axis: projection slots follow the last real day.
  const slots: Slot[] = [
    ...daily.map((d) => ({ ...d, projected: false })),
    ...projection.map((p) => ({ ...p, responses: null, projected: true })),
  ];
  const plotRight = width - MARGIN.right;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const x = linearScale([0, Math.max(1, slots.length - 1)], [MARGIN.left, plotRight]);
  const y = linearScale([1, 5], [plotBottom, MARGIN.top]);

  const actual = daily.map((d, i) => (d.average === null ? null : { x: x(i), y: y(d.average) }));
  const lastIndex = daily.findLastIndex((d) => d.average !== null);
  const last = lastIndex >= 0 ? daily[lastIndex] : null;
  // The dashed projection starts from the last real point so the two lines join up.
  const projected = last
    ? linePath([
        { x: x(lastIndex), y: y(last.average!) },
        ...projection.map((p, i) => ({ x: x(daily.length + i), y: y(p.average) })),
      ])
    : "";
  // A day with no neighbours has no line through it: give it a dot so it's still visible.
  const isolated = actual.filter(
    (p, i) => p && i !== lastIndex && !actual[i - 1] && !actual[i + 1],
  ) as { x: number; y: number }[];

  const ticks = tickIndexes(slots.length, width < 480 ? 3 : 5);
  const step = slots.length > 1 ? (plotRight - MARGIN.left) / (slots.length - 1) : 0;

  function nearest(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const index = Math.round((event.clientX - box.left - MARGIN.left) / (step || 1));
    setActive(Math.min(slots.length - 1, Math.max(0, index)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const move = event.key === "ArrowLeft" ? -1 : 1;
    setActive((i) => Math.min(slots.length - 1, Math.max(0, (i ?? slots.length) + move)));
  }

  const hovered = active === null ? null : slots[active];
  const hasData = lastIndex >= 0;

  return (
    <figure className={styles.figure}>
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.keySolid} /> Daily average
        </span>
        {projection.length > 0 && (
          <span>
            <i className={styles.keyDashed} /> Projection, next {projection.length} days
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className={styles.plot}
        tabIndex={hasData ? 0 : -1}
        role="img"
        aria-label={summary(daily, projection)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {projection.length > 0 && (
            <g>
              <rect
                className={styles.forecastZone}
                x={x(daily.length - 0.5)}
                y={MARGIN.top}
                width={plotRight - x(daily.length - 0.5) + 8}
                height={plotBottom - MARGIN.top}
              />
              <text className={styles.zoneLabel} x={plotRight + 4} y={MARGIN.top - 4} textAnchor="end">
                Projected
              </text>
            </g>
          )}

          {SCORES.map((score) => (
            <g key={score}>
              <line
                className={score === 3 ? styles.passiveLine : styles.grid}
                x1={MARGIN.left}
                x2={plotRight}
                y1={y(score)}
                y2={y(score)}
              />
              <text className={styles.tick} x={MARGIN.left - 10} y={y(score)} dy="0.32em" textAnchor="end">
                {score}
              </text>
            </g>
          ))}

          {ticks.map((i) => (
            <text key={i} className={styles.tick} x={x(i)} y={HEIGHT - 8} textAnchor="middle">
              {shortDate(slots[i].date)}
            </text>
          ))}

          <path className={styles.projection} d={projected} />
          <path className={styles.line} d={linePath(actual)} />
          {isolated.map((p) => (
            <circle key={`${p.x}`} className={styles.dot} cx={p.x} cy={p.y} r={4} />
          ))}

          {last && (
            <g>
              <circle className={styles.dot} cx={x(lastIndex)} cy={y(last.average!)} r={5} />
              <text className={styles.endLabel} x={x(lastIndex) + 9} y={y(last.average!)} dy="0.32em">
                {last.average!.toFixed(1)}
              </text>
            </g>
          )}

          {hovered && active !== null && (
            <g>
              <line className={styles.crosshair} x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={plotBottom} />
              {hovered.average !== null && (
                <circle className={styles.dot} cx={x(active)} cy={y(hovered.average)} r={5} />
              )}
            </g>
          )}

          {/* Invisible hit area: aim at a date, not at a 2px line. */}
          {hasData && (
            <rect
              className={styles.hit}
              x={MARGIN.left - step / 2}
              y={MARGIN.top}
              width={plotRight - MARGIN.left + step}
              height={plotBottom - MARGIN.top}
              onPointerMove={nearest}
              onPointerDown={nearest}
              onPointerLeave={() => setActive(null)}
            />
          )}
        </svg>

        {hovered && active !== null && (
          <div
            className={styles.tooltip}
            style={{ left: Math.min(Math.max(x(active), 70), width - 70) }}
          >
            <strong>{hovered.average === null ? "No responses" : hovered.average.toFixed(2)}</strong>
            <span>
              {shortDate(hovered.date)} ·{" "}
              {hovered.projected
                ? "projected"
                : `${hovered.responses} response${hovered.responses === 1 ? "" : "s"}`}
            </span>
          </div>
        )}

        {!hasData && <p className={styles.empty}>No feedback in this period yet.</p>}
      </div>
      {/* The plot is one image to screen readers; announce the day being explored here. */}
      <p className={styles.srOnly} aria-live="polite">
        {hovered &&
          `${shortDate(hovered.date)}: ${hovered.average === null ? "no responses" : hovered.average.toFixed(2)}${hovered.projected ? ", projected" : ""}`}
      </p>

      <details className={styles.table}>
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Average score</th>
              <th scope="col">Responses</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.date}>
                <td>{shortDate(slot.date)}</td>
                <td>
                  {slot.average === null ? "–" : slot.average.toFixed(2)}
                  {slot.projected && " (projected)"}
                </td>
                <td>{slot.responses ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function summary(daily: DayPoint[], projection: ProjectedPoint[]): string {
  const known = daily.filter((d) => d.average !== null);
  if (known.length === 0) return "Score trend: no feedback in this period.";
  const latest = known[known.length - 1];
  const ahead = projection[projection.length - 1];
  return (
    `Daily average score over ${daily.length} days, latest ${latest.average} on ${shortDate(latest.date)}.` +
    (ahead ? ` Projected ${ahead.average} by ${shortDate(ahead.date)}.` : "") +
    " Use the left and right arrow keys to read each day."
  );
}
