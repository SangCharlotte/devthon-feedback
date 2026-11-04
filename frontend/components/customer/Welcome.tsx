import { BrushStroke } from "@/components/brand/Brand";

import { HouseIllustration } from "./HouseIllustration";
import { ArrowRightIcon } from "./icons";
import screen from "./screen.module.css";
import { TopBar } from "./TopBar";
import styles from "./Welcome.module.css";

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <section className={`${screen.screen} ${screen.enter}`} aria-labelledby="welcome-heading">
      <BrushStroke tone="warm" className={styles.stroke} />
      <TopBar />

      <div className={`${screen.body} ${styles.body}`}>
        <h1 id="welcome-heading" className={`${screen.heading} ${styles.title}`} tabIndex={-1} data-step-heading>
          Hello! <span aria-hidden="true">👋</span>
        </h1>
        <p className={styles.lead}>How was your paint experience?</p>

        <HouseIllustration className={styles.art} />

        <p className={styles.note}>Your feedback helps us serve you better.</p>
        <p className={styles.meta}>3 quick questions · under a minute</p>
      </div>

      <div className={screen.actions}>
        <button type="button" className="btn btn-primary" onClick={onStart}>
          Start Feedback <ArrowRightIcon />
        </button>
      </div>
    </section>
  );
}
