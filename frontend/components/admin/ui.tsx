"use client";

import type { ReactNode } from "react";

import type { Category } from "@/lib/api";
import type { Sentiment } from "@/lib/admin";
import { initials } from "@/lib/format";

import styles from "./admin.module.css";
import { RANGES, useAdmin, type Days } from "./AdminContext";
import { SENTIMENTS } from "./domain";
import { Icon, type IconName } from "./icons";

export function PageHeader({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageTitle}>
        {icon && (
          <span className={styles.pageIcon}>
            <Icon name={icon} size={24} />
          </span>
        )}
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      {children && <div className={styles.pageActions}>{children}</div>}
    </div>
  );
}

/** The shared date range: changing it here changes it on every page. */
export function RangeSelect() {
  const { days, setDays } = useAdmin();
  return (
    <label className={styles.range}>
      <span className="visually-hidden">Date range</span>
      <Icon name="dashboard" size={18} />
      <select value={days} onChange={(event) => setDays(Number(event.target.value) as Days)}>
        {RANGES.map((range) => (
          <option key={range} value={range}>
            Last {range} days
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} />
    </label>
  );
}

const AVATAR_TONES = ["green", "yellow", "orange", "red", "violet"] as const;

/** Pastel initials; the colour is hashed from the name so a person keeps theirs. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      className={styles.avatar}
      data-tone={AVATAR_TONES[hash % AVATAR_TONES.length]}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span className={styles.badge} data-sentiment={sentiment}>
      {SENTIMENTS.find((s) => s.id === sentiment)!.label}
    </span>
  );
}

/** A mean score coloured by its category: red for detractors, amber passives, green promoters. */
export function ScorePill({ mean, category, digits = 2 }: { mean: number; category: Category; digits?: number }) {
  return (
    <span className={styles.score} data-category={category}>
      {mean.toFixed(digits)}
    </span>
  );
}

export function Card({
  title,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={`card ${styles.card} ${className ?? ""}`} aria-labelledby={id}>
      <div className={styles.cardHead}>
        <h2 id={id} className={styles.cardTitle}>
          {icon && <Icon name={icon} size={20} />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
