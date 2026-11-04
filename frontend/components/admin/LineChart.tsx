"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { linePath, linearScale, shortDate, smoothPath, tickIndexes, type Point } from "@/lib/chart";

import styles from "./LineChart.module.css";
import { useElementWidth } from "./useElementWidth";

export type Series = {
  id: string;
  label: string;
  /** A CSS colour, normally a theme variable such as "var(--cat-promoter)". */
  color: string;
  /** One value per date; null is a day without data and leaves a gap. */
  values: (number | null)[];
  dashed?: boolean;
  /** Drawn before the first value, so a projection joins the line it continues. */
  lead?: { index: number; value: number };
};

type Props = {
  dates: string[];
  series: Series[];
  domain: [number, number];
  ticks: number[];
  format: (value: number) => string;
  tickFormat?: (value: number) => string;
  /** Screen-reader description of the whole chart. */
  summary: string;
  /** Extra line per day for the tooltip and table, e.g. "3 responses". */
  note?: { label: string; text: (index: number) => string };
  /** Shade dates from this index on, e.g. a projection. */
  zone?: { from: number; label: string };
  /** Series whose latest value gets a pill at the end of its line. */
  highlight?: string;
  smooth?: boolean;
  height?: number;
};

const MARGIN = { top: 20, right: 60, bottom: 28, left: 40 };

export function LineChart({
  dates,
  series,
  domain,
  ticks,
  format,
  tickFormat = format,
  summary,
  note,
  zone,
  highlight,
  smooth = false,
  height = 260,
}: Props) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);

  const plotRight = width - MARGIN.right;
  const plotBottom = height - MARGIN.bottom;
  const x = linearScale([0, Math.max(1, dates.length - 1)], [MARGIN.left, plotRight]);
  const y = linearScale(domain, [plotBottom, MARGIN.top]);
  const step = dates.length > 1 ? (plotRight - MARGIN.left) / (dates.length - 1) : 0;
  const draw = smooth ? smoothPath : linePath;
  const hasData = series.some((s) => s.values.some((v) => v !== null));
  const showDots = dates.length <= 31;

  const lines = series.map((s) => {
    const points: (Point | null)[] = s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) }));
    if (s.lead) points.splice(s.lead.index, 1, { x: x(s.lead.index), y: y(s.lead.value) });
    const lastIndex = s.values.findLastIndex((v) => v !== null);
    return { ...s, points, lastIndex };
  });
  const pill = lines.find((l) => l.id === highlight && l.lastIndex >= 0);

  function nearest(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const index = Math.round((event.clientX - box.left - MARGIN.left) / (step || 1));
    setActive(Math.min(dates.length - 1, Math.max(0, index)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const move = event.key === "ArrowLeft" ? -1 : 1;
    setActive((i) => Math.min(dates.length - 1, Math.max(0, (i ?? dates.length) + move)));
  }

  const readings = (index: number) =>
    lines.filter((l) => l.values[index] !== null).map((l) => ({ ...l, value: l.values[index]! }));

  return (
    <figure className={styles.figure}>
      <div className={styles.legend} aria-hidden="true">
        {series.map((s) => (
          <span key={s.id}>
            <i className={styles.key} data-dashed={s.dashed ?? false} style={{ borderColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className={styles.plot}
        tabIndex={hasData ? 0 : -1}
        role="img"
        aria-label={`${summary}${hasData ? " Use the left and right arrow keys to read each day." : ""}`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true">
          {zone && zone.from < dates.length && (
            <g>
              <rect
                className={styles.zone}
                x={x(zone.from - 0.5)}
                y={MARGIN.top}
                width={plotRight - x(zone.from - 0.5) + 8}
                height={plotBottom - MARGIN.top}
              />
              <text className={styles.zoneLabel} x={plotRight + 6} y={MARGIN.top - 6} textAnchor="end">
                {zone.label}
              </text>
            </g>
          )}

          {ticks.map((value) => (
            <g key={value}>
              <line className={styles.grid} x1={MARGIN.left} x2={plotRight} y1={y(value)} y2={y(value)} />
              <text className={styles.tick} x={MARGIN.left - 10} y={y(value)} dy="0.32em" textAnchor="end">
                {tickFormat(value)}
              </text>
            </g>
          ))}

          {tickIndexes(dates.length, width < 480 ? 3 : 6).map((i) => (
            <text key={i} className={styles.tick} x={x(i)} y={height - 6} textAnchor="middle">
              {shortDate(dates[i])}
            </text>
          ))}

          {lines.map((line) => (
            <g key={line.id} style={{ color: line.color }}>
              <path className={styles.line} data-dashed={line.dashed ?? false} d={draw(line.points)} />
              {line.points.map((p, i) =>
                p && (showDots || i === line.lastIndex || isolated(line.points, i)) ? (
                  <circle key={i} className={styles.dot} cx={p.x} cy={p.y} r={i === line.lastIndex ? 4.5 : 3} />
                ) : null,
              )}
            </g>
          ))}

          {pill && (
            <g className={styles.pill} style={{ color: pill.color }}>
              <rect x={x(pill.lastIndex) + 8} y={y(pill.values[pill.lastIndex]!) - 12} width={46} height={24} rx={12} />
              <text x={x(pill.lastIndex) + 31} y={y(pill.values[pill.lastIndex]!)} dy="0.34em" textAnchor="middle">
                {format(pill.values[pill.lastIndex]!)}
              </text>
            </g>
          )}

          {active !== null && (
            <g>
              <line className={styles.crosshair} x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={plotBottom} />
              {readings(active).map((r) => (
                <circle
                  key={r.id}
                  className={styles.dot}
                  style={{ color: r.color }}
                  cx={x(active)}
                  cy={y(r.value)}
                  r={5.5}
                />
              ))}
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

        {active !== null && (
          <div className={styles.tooltip} style={{ left: Math.min(Math.max(x(active), 80), width - 80) }}>
            <strong>{shortDate(dates[active])}</strong>
            {readings(active).map((r) => (
              <span key={r.id}>
                <i style={{ background: r.color }} />
                {r.label} <b>{format(r.value)}</b>
              </span>
            ))}
            {note && <small>{note.text(active)}</small>}
          </div>
        )}

        {!hasData && <p className={styles.empty}>No feedback in this period yet.</p>}
      </div>
      {/* The plot is one image to screen readers; announce the day being explored here. */}
      <p className="visually-hidden" aria-live="polite">
        {active !== null &&
          `${shortDate(dates[active])}: ${
            readings(active)
              .map((r) => `${r.label} ${format(r.value)}`)
              .join(", ") || "no data"
          }${note ? `, ${note.text(active)}` : ""}`}
      </p>

      <details className={styles.table}>
        <summary>Show as table</summary>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {series.map((s) => (
                  <th key={s.id} scope="col">
                    {s.label}
                  </th>
                ))}
                {note && <th scope="col">{note.label}</th>}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, i) => (
                <tr key={date}>
                  <th scope="row">{shortDate(date)}</th>
                  {series.map((s) => (
                    <td key={s.id}>{s.values[i] === null ? "–" : format(s.values[i]!)}</td>
                  ))}
                  {note && <td>{note.text(i)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** A point with no neighbours has no line through it, so it always gets a dot. */
function isolated(points: (Point | null)[], i: number) {
  return !points[i - 1] && !points[i + 1];
}
