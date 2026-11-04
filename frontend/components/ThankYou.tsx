import type { CSSProperties } from "react";

import { BrushStroke } from "@/components/brand/Brand";
import type { Category, FeedbackResult } from "@/lib/api";

import { HomeIcon } from "./customer/icons";
import screen from "./customer/screen.module.css";
import { TopBar } from "./customer/TopBar";
import styles from "./ThankYou.module.css";

const COPY: Record<Category, { lead: string; body: string }> = {
  promoter: {
    lead: "You made our day!",
    body: "We're thrilled you love our paint. Happy painting!",
  },
  passive: {
    lead: "Thanks for being honest",
    body: "We're always working to make every coat better, and your feedback helps.",
  },
  detractor: {
    lead: "We're sorry we let you down",
    body: "Someone from our customer care team will contact you shortly to put things right.",
  },
};

const BURST_COLORS = ["var(--orange)", "var(--yellow)", "var(--leaf)", "var(--red)", "var(--brand)"];
// Fixed angles so server and browser render identical markup.
const BURST = Array.from({ length: 14 }, (_, i) => ({
  angle: i * (360 / 14) + (i % 2 ? 8 : 0),
  reach: i % 2 ? 92 : 104,
  color: BURST_COLORS[i % BURST_COLORS.length],
  delay: 180 + (i % 4) * 40,
}));

type Props = { result: FeedbackResult; onRestart: () => void };

export function ThankYou({ result, onRestart }: Props) {
  const copy = COPY[result.category];

  return (
    <section className={`${screen.screen} ${screen.enter}`} aria-labelledby="thanks-heading" aria-live="polite">
      <TopBar />

      <div className={`${screen.body} ${styles.body}`}>
        <div className={styles.badge}>
          {BURST.map((ray, i) => (
            <span
              key={i}
              className={styles.ray}
              aria-hidden="true"
              style={
                {
                  "--angle": `${ray.angle}deg`,
                  "--reach": `${ray.reach}px`,
                  background: ray.color,
                  animationDelay: `${ray.delay}ms`,
                } as CSSProperties
              }
            />
          ))}
          <svg className={styles.check} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
            <circle cx="60" cy="60" r="56" />
            <path d="M36 62l16 16 32-36" />
          </svg>
        </div>

        <h1 id="thanks-heading" className={`${screen.heading} ${styles.title}`} tabIndex={-1} data-step-heading>
          Thank You!
        </h1>
        <p className={styles.subtitle}>Your feedback has been submitted.</p>

        <div className={styles.note} data-category={result.category}>
          <p className={styles.lead}>{copy.lead}</p>
          <p className={styles.noteBody}>{copy.body}</p>
        </div>
      </div>

      <div className={styles.paint} aria-hidden="true">
        <BrushStroke tone="sunset" className={styles.strokeA} />
        <BrushStroke tone="warm" className={styles.strokeB} />
      </div>

      <div className={`${screen.actions} ${styles.actions}`}>
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          <HomeIcon /> Back to Home
        </button>
      </div>
    </section>
  );
}
