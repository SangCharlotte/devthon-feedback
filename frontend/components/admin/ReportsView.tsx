"use client";

import { QUESTIONS } from "@/lib/questions";

import styles from "./admin.module.css";
import { useAdmin } from "./AdminContext";
import { CATEGORIES, SEGMENTS } from "./domain";
import { Donut } from "./Donut";
import { TrendChart } from "./TrendChart";
import { Card, PageHeader, RangeSelect } from "./ui";

export function ReportsView() {
  const { stats, days } = useAdmin();

  return (
    <>
      <PageHeader title="Reports" subtitle="Score trend, projection and the customer split" icon="reports">
        <RangeSelect />
      </PageHeader>
      {stats ? (
        <div className={styles.reportGrid} data-loading={stats.days !== days}>
          <Card title="Score trend" className={styles.wide}>
            <p className={styles.muted}>
              Average score per day, 1 to 5. Below 3 is a detractor.
              {stats.trend_per_day != null && <> {trendWords(stats.trend_per_day)}</>}
            </p>
            <TrendChart daily={stats.daily} projection={stats.projection} />
          </Card>
          <Card title="Customer split">
            <Donut
              unit={["response", "responses"]}
              slices={CATEGORIES.map((c) => ({ ...c, value: stats.split[c.id], note: c.rule }))}
            />
          </Card>
          <Card title="Average per question">
            <ul className={styles.questionBars}>
              {QUESTIONS.map((q, i) => {
                const value = stats.questions[q.id];
                return (
                  <li key={q.id}>
                    <span className={styles.barLabel}>
                      <span>
                        <small>Q{i + 1}</small> {q.short}
                      </span>
                      <strong>{value === null ? "–" : value.toFixed(2)}</strong>
                    </span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <i
                        style={{ width: `${value === null ? 0 : (value / 5) * 100}%` }}
                        data-category={
                          value === null ? undefined : value < 3 ? "detractor" : value === 3 ? "passive" : "promoter"
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.muted}>Mean score out of 5 for each question, last {stats.days} days.</p>
          </Card>
          <Card title="Segment split">
            <Donut
              unit={["respondent", "respondents"]}
              slices={SEGMENTS.map((s) => ({ ...s, value: stats.segments[s.id] }))}
            />
          </Card>
        </div>
      ) : (
        <p className={styles.muted}>Loading the numbers…</p>
      )}
    </>
  );
}

function trendWords(perDay: number): string {
  const perWeek = perDay * 7;
  if (Math.abs(perWeek) < 0.05) return "Holding steady.";
  return `${perWeek > 0 ? "Improving" : "Slipping"} by about ${Math.abs(perWeek).toFixed(2)} points a week.`;
}
