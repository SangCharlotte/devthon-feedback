"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { Category } from "@/lib/api";
import { adminApi, type Channel, type ResponseItem } from "@/lib/admin";
import { dateTime, plural } from "@/lib/format";
import { QUESTIONS, SWATCHES, type Rating } from "@/lib/questions";

import styles from "./admin.module.css";
import { CATEGORIES } from "./SplitDonut";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

type Props = { days: number; refreshKey: number; onError: (error: unknown) => void };

/** Searchable drill-down: every individual rating, with the 1-5 score for each question. */
export function ResponsesLog({ days, refreshKey, onError }: Props) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | undefined>();
  const [channel, setChannel] = useState<Channel | undefined>();
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Debounce: wait until typing pauses before searching, instead of one request per key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // "Loading" is derived, not stored: we're loading whenever the results on screen
  // don't belong to the current filters yet (or the user is still typing).
  const key = JSON.stringify([search, category, channel, days, refreshKey]);
  const loading = query.trim() !== search || loadedKey !== key || loadingMore;

  useEffect(() => {
    let cancelled = false; // ignore answers to outdated searches that arrive late
    adminApi
      .responses({ q: search, category, channel, days, limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((error) => !cancelled && onError(error))
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [key, search, category, channel, days, onError]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await adminApi.responses({
        q: search,
        category,
        channel,
        days,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((current) => [...current, ...page.items]);
      setTotal(page.total);
    } catch (error) {
      onError(error);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search name, email, phone or comment"
          aria-label="Search responses"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.chips} role="group" aria-label="Filter by category">
          <Chip active={category === undefined} onClick={() => setCategory(undefined)}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              <i className={styles.dot} style={{ background: `var(--cat-${c.id})` }} />
              {c.label}
            </Chip>
          ))}
        </div>
        <select
          className={styles.select}
          aria-label="Filter by channel"
          value={channel ?? ""}
          onChange={(event) => setChannel((event.target.value || undefined) as Channel | undefined)}
        >
          <option value="">Web and SMS</option>
          <option value="web">Web only</option>
          <option value="sms">SMS only</option>
        </select>
      </div>

      <p className={styles.muted} aria-live="polite">
        Showing {items.length} of {plural(total, "response")}
      </p>

      {/* Refetching keeps the old rows on screen, faded, instead of flashing empty. */}
      <ul className={styles.log} data-loading={loading}>
        {items.map((item) => {
          const open = expanded === item.id;
          return (
            <li key={item.id} className={styles.logRow}>
              <button
                type="button"
                className={styles.logSummary}
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : item.id)}
              >
                <span className={styles.logName}>
                  <strong>{item.customer_name}</strong>
                  <small>
                    {dateTime(item.created_at)} · {item.channel === "sms" ? "SMS" : "Web"}
                  </small>
                </span>
                <span className={styles.scorePill} data-category={item.category}>
                  {item.mean.toFixed(2)}
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  ▾
                </span>
              </button>

              {open && (
                <div className={styles.logDetail}>
                  <dl className={styles.breakdown}>
                    {QUESTIONS.map((question) => {
                      const score = item[question.id] as Rating;
                      return (
                        <div key={question.id}>
                          <dt>{question.short}</dt>
                          <dd>
                            <span className={styles.meter} aria-hidden="true">
                              {[1, 2, 3, 4, 5].map((step) => (
                                <i
                                  key={step}
                                  style={step <= score ? { background: SWATCHES[score].color } : undefined}
                                />
                              ))}
                            </span>
                            <strong>{score}/5</strong> <small>{SWATCHES[score].label}</small>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                  {item.comment && <blockquote className={styles.comment}>“{item.comment}”</blockquote>}
                  {item.ai_sentiment && (
                    <p className={styles.tags}>
                      <span className={styles.tag}>
                        <i className={styles.dot} data-sentiment={item.ai_sentiment} aria-hidden="true" />
                        {item.ai_sentiment}
                      </span>
                      {item.ai_topics.map((topic) => (
                        <span key={topic} className={styles.tag}>
                          {topic}
                        </span>
                      ))}
                      <span className={styles.aiNote}>✦ AI tags</span>
                    </p>
                  )}
                  <p className={styles.contact}>
                    {item.customer_email && (
                      <a href={`mailto:${item.customer_email}`}>{item.customer_email}</a>
                    )}
                    {item.customer_phone && <a href={`tel:${item.customer_phone}`}>{item.customer_phone}</a>}
                    {item.alert_status && <span>Alert: {item.alert_status}</span>}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!loading && items.length === 0 && <p className={styles.muted}>No responses match.</p>}
      {items.length < total && (
        <button type="button" className={`btn btn-secondary ${styles.more}`} disabled={loading} onClick={loadMore}>
          Load more
        </button>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
