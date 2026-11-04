"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Category } from "@/lib/api";
import {
  adminApi,
  exportUrl,
  type Channel,
  type ResponseFilters,
  type ResponseItem,
  type Segment,
  type Sentiment,
} from "@/lib/admin";
import { plural, timeAgo } from "@/lib/format";

import { useAdmin } from "./AdminContext";
import { CATEGORIES, SEGMENTS, SENTIMENTS } from "./domain";
import { Icon } from "./icons";
import styles from "./inbox.module.css";
import { InsightsPanel } from "./InsightsPanel";
import { ResponseDetail } from "./ResponseDetail";
import { Avatar, PageHeader, RangeSelect, ScorePill, SentimentBadge } from "./ui";

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

export type InboxStart = { q?: string; sentiment?: Sentiment; segment?: Segment };

/** Every individual response, filterable, with a drill-down into one person's scores. */
export function FeedbackInbox({ start }: { start: InboxStart }) {
  const { days, tick, handleError } = useAdmin();
  const [query, setQuery] = useState(start.q ?? "");
  const [search, setSearch] = useState(start.q?.trim() ?? "");
  const [sentiment, setSentiment] = useState<Sentiment | undefined>(start.sentiment);
  const [category, setCategory] = useState<Category | undefined>();
  const [channel, setChannel] = useState<Channel | undefined>();
  const [segment, setSegment] = useState<Segment | undefined>(start.segment);
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<ResponseItem | null>(null);
  const shown = useRef<{ key: string | null; ids: Set<number> }>({ key: null, ids: new Set() });
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());

  // Debounce: wait until typing pauses before searching, instead of one request per key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const filters: ResponseFilters = { q: search, sentiment, category, channel, segment, days };
  const key = JSON.stringify(filters);
  // "Loading" is derived: the rows on screen don't belong to the current filters yet.
  const loading = query.trim() !== search || loadedKey !== key || loadingMore;

  // Runs on new filters (replace the list) and on every poll (prepend what's new).
  useEffect(() => {
    let cancelled = false;
    adminApi
      .responses({ ...(JSON.parse(key) as ResponseFilters), limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        const same = shown.current.key === key;
        const arrivals = same ? page.items.filter((i) => !shown.current.ids.has(i.id)) : [];
        shown.current = {
          key,
          ids: new Set([...(same ? shown.current.ids : []), ...page.items.map((i) => i.id)]),
        };
        setItems((current) => (same ? [...arrivals, ...current] : page.items));
        setFresh(new Set(arrivals.map((i) => i.id)));
        setTotal(page.total);
      })
      .catch((error) => !cancelled && handleError(error))
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [key, tick, handleError]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await adminApi.responses({ ...filters, limit: PAGE_SIZE, offset: items.length });
      const next = page.items.filter((i) => !shown.current.ids.has(i.id));
      next.forEach((i) => shown.current.ids.add(i.id));
      setItems((current) => [...current, ...next]);
      setTotal(page.total);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedId = selected?.id;
  const closeDetail = useCallback(() => {
    setSelected(null);
    if (selectedId !== undefined) rowRefs.current.get(selectedId)?.focus();
  }, [selectedId]);

  return (
    <>
      <PageHeader title="Feedback Inbox" subtitle="All customer feedback in one place" icon="mail">
        <RangeSelect />
      </PageHeader>

      <div className={styles.layout}>
        <section className={`card ${styles.inbox}`} aria-label="Responses">
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <Icon name="search" size={18} />
              <input
                type="search"
                aria-label="Search responses"
                placeholder="Search name, email, phone or comment"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <a className={styles.export} href={exportUrl(filters)} download>
              <Icon name="download" size={18} /> Export
            </a>
          </div>
          <div className={styles.filters}>
            <FilterSelect
              label="Sentiment"
              all="All Sentiment"
              value={sentiment}
              options={SENTIMENTS}
              onChange={setSentiment}
            />
            <FilterSelect
              label="Category"
              all="All categories"
              value={category}
              options={CATEGORIES}
              onChange={setCategory}
            />
            <FilterSelect
              label="Channel"
              all="All channels"
              value={channel}
              options={[
                { id: "web", label: "Web" },
                { id: "sms", label: "SMS" },
                { id: "ussd", label: "USSD" },
              ]}
              onChange={setChannel}
            />
            <FilterSelect
              label="Segment"
              all="All customers"
              value={segment}
              options={SEGMENTS}
              onChange={setSegment}
            />
          </div>

          <p className={styles.count} aria-live="polite">
            Showing {items.length} of {plural(total, "response")}
          </p>

          {/* Refetching keeps the old rows on screen, faded, instead of flashing empty. */}
          <ul className={styles.list} data-loading={loading}>
            {items.map((item) => (
              <li key={item.id} data-new={fresh.has(item.id)}>
                <button
                  type="button"
                  className={styles.row}
                  aria-haspopup="dialog"
                  aria-expanded={selected?.id === item.id}
                  ref={(node) => {
                    if (node) rowRefs.current.set(item.id, node);
                    else rowRefs.current.delete(item.id);
                  }}
                  onClick={() => setSelected(item)}
                >
                  <Avatar name={item.customer_name} />
                  <span className={styles.rowText}>
                    <span className={styles.rowHead}>
                      <strong>{item.customer_name}</strong>
                      <small>{timeAgo(item.created_at)}</small>
                      {item.ai_sentiment ? (
                        <SentimentBadge sentiment={item.ai_sentiment} />
                      ) : (
                        <ScorePill mean={item.mean} category={item.category} />
                      )}
                    </span>
                    <span className={styles.quote}>
                      {item.comment ? `“${item.comment}”` : `No comment · scored ${item.q1}, ${item.q2}, ${item.q3}`}
                    </span>
                  </span>
                  <Icon name="chevronRight" className={styles.chevron} />
                </button>
              </li>
            ))}
          </ul>

          {!loading && items.length === 0 && <p className={styles.empty}>No responses match these filters.</p>}
          {items.length < total && (
            <button type="button" className={`btn btn-secondary ${styles.more}`} disabled={loading} onClick={loadMore}>
              Load more
            </button>
          )}
        </section>

        <InsightsPanel />
      </div>

      {selected && <ResponseDetail item={selected} onClose={closeDetail} />}
    </>
  );
}

function FilterSelect<T extends string>({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: T | undefined;
  options: readonly { id: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <label className={styles.filter}>
      <span className="visually-hidden">Filter by {label.toLowerCase()}</span>
      <select value={value ?? ""} onChange={(event) => onChange((event.target.value || undefined) as T | undefined)}>
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} />
    </label>
  );
}
