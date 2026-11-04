"use client";

import { useState } from "react";

import { donutArcs, percent } from "@/lib/chart";

import styles from "./Donut.module.css";

export type Slice = { id: string; label: string; value: number; color: string; note?: string };

type Props = {
  slices: readonly Slice[];
  /** Centre caption under the total, e.g. ["response", "responses"]. */
  unit: [one: string, many: string];
  size?: number;
};

/** Donut with a legend that doubles as its accessible, keyboard-reachable readout. */
export function Donut({ slices, unit, size = 180 }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const radius = size / 2;
  const thickness = Math.round(size * 0.15);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const arcs = donutArcs(
    slices.map((s) => s.value),
    { radius, thickness },
  );
  const focus = slices.find((s) => s.id === active);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.donut}
        width={size}
        height={size}
        viewBox={`${-radius} ${-radius} ${size} ${size}`}
        aria-hidden="true"
      >
        {total === 0 && <circle className={styles.track} r={radius - thickness / 2} strokeWidth={thickness} />}
        {slices.map((s, i) =>
          arcs[i] ? (
            <path
              key={s.id}
              d={arcs[i]!}
              fillRule="evenodd"
              className={styles.segment}
              style={{ fill: s.color }}
              data-dim={active !== null && active !== s.id}
              onPointerEnter={() => setActive(s.id)}
              onPointerLeave={() => setActive(null)}
            />
          ) : null,
        )}
        {/* The centre doubles as the tooltip: total by default, the hovered slice otherwise. */}
        <text className={styles.centreValue} y="-2">
          {focus ? percent(focus.value, total) : total.toLocaleString()}
        </text>
        <text className={styles.centreLabel} y="20">
          {focus ? focus.label.toLowerCase() : total === 1 ? unit[0] : unit[1]}
        </text>
      </svg>

      <ul className={styles.legend}>
        {slices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={styles.legendItem}
              data-active={active === s.id}
              onPointerEnter={() => setActive(s.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.id)}
              onBlur={() => setActive(null)}
            >
              <i className={styles.swatch} style={{ background: s.color }} />
              <span className={styles.name}>
                {s.label}
                {s.note && <small>{s.note}</small>}
              </span>
              <span className={styles.count}>
                <strong>{s.value.toLocaleString()}</strong> {percent(s.value, total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
