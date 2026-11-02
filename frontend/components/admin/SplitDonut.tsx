"use client";

import { useState } from "react";

import type { Category } from "@/lib/api";
import { donutArcs, percent } from "@/lib/chart";

import styles from "./SplitDonut.module.css";

export const CATEGORIES: readonly { id: Category; label: string; rule: string }[] = [
  { id: "detractor", label: "Detractors", rule: "average below 3" },
  { id: "passive", label: "Passives", rule: "average exactly 3" },
  { id: "promoter", label: "Promoters", rule: "average above 3" },
];

const SIZE = 180;
const RADIUS = SIZE / 2;

export function SplitDonut({ split }: { split: Record<Category, number> }) {
  const [active, setActive] = useState<Category | null>(null);
  const values = CATEGORIES.map((c) => split[c.id]);
  const total = values.reduce((sum, v) => sum + v, 0);
  const arcs = donutArcs(values, { radius: RADIUS, thickness: 26 });
  const focus = CATEGORIES.find((c) => c.id === active);

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.donut}
        width={SIZE}
        height={SIZE}
        viewBox={`${-RADIUS} ${-RADIUS} ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        {total === 0 && <circle className={styles.track} r={RADIUS - 13} />}
        {CATEGORIES.map((c, i) =>
          arcs[i] ? (
            <path
              key={c.id}
              d={arcs[i]!}
              fillRule="evenodd"
              className={styles.segment}
              style={{ fill: `var(--cat-${c.id})` }}
              data-dim={active !== null && active !== c.id}
              onPointerEnter={() => setActive(c.id)}
              onPointerLeave={() => setActive(null)}
            />
          ) : null,
        )}
        {/* The centre doubles as the tooltip: total by default, the hovered slice otherwise. */}
        <text className={styles.centreValue} y="-2">
          {focus ? percent(split[focus.id], total) : total}
        </text>
        <text className={styles.centreLabel} y="20">
          {focus ? focus.label.toLowerCase() : total === 1 ? "response" : "responses"}
        </text>
      </svg>

      <ul className={styles.legend}>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.legendItem}
              data-active={active === c.id}
              onPointerEnter={() => setActive(c.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(c.id)}
              onBlur={() => setActive(null)}
            >
              <i className={styles.swatch} style={{ background: `var(--cat-${c.id})` }} />
              <span className={styles.name}>
                {c.label}
                <small>{c.rule}</small>
              </span>
              <span className={styles.count}>
                <strong>{split[c.id]}</strong> {percent(split[c.id], total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
