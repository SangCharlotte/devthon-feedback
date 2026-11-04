"use client";

import Link from "next/link";

import { percent } from "@/lib/chart";

import styles from "./admin.module.css";
import { useAdmin } from "./AdminContext";
import { SEGMENTS } from "./domain";
import { Donut } from "./Donut";
import { Icon } from "./icons";
import { SmsInvite } from "./SmsInvite";
import { Card, PageHeader, RangeSelect } from "./ui";

const BLURB = {
  homeowner: "Buy paint for their own home, usually answer on a smartphone.",
  painter: "Paint for a living. Many answer by SMS or USSD from a feature phone.",
} as const;

export function CustomersView() {
  const { stats, days } = useAdmin();
  const total = stats ? stats.segments.homeowner + stats.segments.painter : 0;

  return (
    <>
      <PageHeader title="Customers" subtitle="Who is giving feedback, and how to reach painters" icon="customers">
        <RangeSelect />
      </PageHeader>
      <div className={styles.customerGrid}>
        <Card title="Segments">
          {stats ? (
            <div className={styles.segmentsBody} data-loading={stats.days !== days}>
              <Donut
                unit={["respondent", "respondents"]}
                slices={SEGMENTS.map((s) => ({ ...s, value: stats.segments[s.id] }))}
              />
              <ul className={styles.segmentCards}>
                {SEGMENTS.map((s) => (
                  <li key={s.id} style={{ borderColor: s.color }}>
                    <p className={styles.segmentName}>
                      {s.label} <strong>{percent(stats.segments[s.id], total)}</strong>
                    </p>
                    <p className={styles.muted}>{BLURB[s.id]}</p>
                    <Link href={`/admin/feedback?segment=${s.id}`} className={styles.textLink}>
                      View their feedback <Icon name="arrowRight" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.muted}>Loading…</p>
          )}
        </Card>
        <Card title="Invite a painter by SMS" icon="phone">
          <SmsInvite />
        </Card>
      </div>
    </>
  );
}
