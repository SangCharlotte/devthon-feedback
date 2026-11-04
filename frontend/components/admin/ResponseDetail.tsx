"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

import { Smiley } from "@/components/Smiley";
import { CHANNEL_LABELS, type ResponseItem } from "@/lib/admin";
import { dateTime } from "@/lib/format";
import { QUESTIONS, SWATCHES, type Rating } from "@/lib/questions";

import { CATEGORIES, segmentLabel } from "./domain";
import { Icon } from "./icons";
import styles from "./inbox.module.css";
import { Avatar, SentimentBadge } from "./ui";

/** The drill-down: one person's 1-5 score for each question, plus everything we know about them. */
export function ResponseDetail({ item, onClose }: { item: ResponseItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const category = CATEGORIES.find((c) => c.id === item.category)!;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Close details" tabIndex={-1} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className={styles.drawerHead}>
          <Avatar name={item.customer_name} size={52} />
          <div>
            <h2 id="detail-title">{item.customer_name}</h2>
            <p className={styles.mutedLine}>{dateTime(item.created_at)}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close details" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.meanRow} data-category={item.category}>
          <span>
            <strong>{item.mean.toFixed(2)}</strong> / 5 mean
          </span>
          <span className={styles.categoryTag}>{category.one}</span>
        </div>

        <h3 className={styles.drawerTitle}>Scores</h3>
        <dl className={styles.scores}>
          {QUESTIONS.map((question, i) => {
            const score = item[question.id] as Rating;
            return (
              <div key={question.id} style={{ "--swatch": SWATCHES[score].color } as CSSProperties}>
                <Smiley rating={score} className={styles.smiley} />
                <dt>
                  <small>Q{i + 1}</small>
                  {question.short}
                </dt>
                <dd>
                  <span className={styles.meter} aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <i key={step} data-on={step <= score} />
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
          <>
            <h3 className={styles.drawerTitle}>
              <Icon name="sparkle" size={16} /> AI tags
            </h3>
            <p className={styles.tags}>
              <SentimentBadge sentiment={item.ai_sentiment} />
              {item.ai_topics.map((topic) => (
                <span key={topic} className={styles.tag}>
                  {topic}
                </span>
              ))}
            </p>
          </>
        )}

        <h3 className={styles.drawerTitle}>Details</h3>
        <dl className={styles.facts}>
          {item.customer_email && (
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${item.customer_email}`}>{item.customer_email}</a>
              </dd>
            </div>
          )}
          {item.customer_phone && (
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${item.customer_phone}`}>{item.customer_phone}</a>
              </dd>
            </div>
          )}
          <div>
            <dt>Channel</dt>
            <dd>{CHANNEL_LABELS[item.channel]}</dd>
          </div>
          {item.segment && (
            <div>
              <dt>Segment</dt>
              <dd>{segmentLabel(item.segment)}</dd>
            </div>
          )}
          <div>
            <dt>Alert</dt>
            <dd>
              {item.alert_status ? (
                <Link href="/admin/alerts">
                  {item.alert_status === "open" ? "Open: needs a call back" : "Resolved"}
                </Link>
              ) : (
                "None"
              )}
            </dd>
          </div>
        </dl>
      </aside>
    </>
  );
}
