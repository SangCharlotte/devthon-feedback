import type { CSSProperties } from "react";

import type { Category, FeedbackResult } from "@/lib/api";
import { SWATCHES, type Rating } from "@/lib/questions";

import { Smiley } from "./Smiley";
import styles from "./ThankYou.module.css";

const COPY: Record<Category, { face: Rating; lead: string; body: string }> = {
  promoter: {
    face: 5,
    lead: "You made our day!",
    body: "We're thrilled you love our paint. Happy painting!",
  },
  passive: {
    face: 3,
    lead: "Thanks for being honest",
    body: "We're always working to make every coat better, and your feedback helps.",
  },
  detractor: {
    face: 2,
    lead: "We're sorry we let you down",
    body: "Someone from our customer care team will contact you shortly to put things right.",
  },
};

// Fixed positions so server and browser render identical markup.
const SPLATS = [
  { left: "8%", top: "10%", size: 26, color: SWATCHES[1].color, delay: 0 },
  { left: "82%", top: "8%", size: 18, color: SWATCHES[3].color, delay: 80 },
  { left: "88%", top: "55%", size: 30, color: SWATCHES[5].color, delay: 160 },
  { left: "4%", top: "62%", size: 20, color: SWATCHES[4].color, delay: 240 },
  { left: "70%", top: "82%", size: 14, color: SWATCHES[2].color, delay: 320 },
  { left: "22%", top: "86%", size: 16, color: "#33508f", delay: 400 },
];

type Props = { result: FeedbackResult; name: string; onRestart: () => void };

export function ThankYou({ result, name, onRestart }: Props) {
  const copy = COPY[result.category];
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <section className={`card ${styles.thanks}`} aria-live="polite">
      {result.category === "promoter" &&
        SPLATS.map((splat, i) => (
          <span
            key={i}
            className={styles.splat}
            aria-hidden="true"
            style={{
              left: splat.left,
              top: splat.top,
              width: splat.size,
              height: splat.size,
              background: splat.color,
              animationDelay: `${splat.delay}ms`,
            }}
          />
        ))}

      <div
        className={styles.face}
        style={{ "--swatch": SWATCHES[copy.face].color } as CSSProperties}
      >
        <Smiley rating={copy.face} />
      </div>

      <h1 className={styles.title}>Thank you, {firstName}!</h1>
      <p className={styles.lead}>{copy.lead}</p>
      <p className={styles.body}>{copy.body}</p>

      <button type="button" className="btn btn-secondary" onClick={onRestart}>
        Give more feedback
      </button>
    </section>
  );
}
