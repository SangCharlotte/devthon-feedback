import type { ReactNode } from "react";

import { BrushStroke, Logo, PaintCan } from "@/components/brand/Brand";

import styles from "./login.module.css";

/** The green brand panel beside the sign-in form; it shrinks to a header band on phones. */
export function LoginScreen({ children }: { children: ReactNode }) {
  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-label="Company X Insights">
        <BrushStroke tone="warm" className={styles.strokeTop} />
        <BrushStroke tone="green" className={styles.strokeBottom} />
        <Logo size={38} className={styles.logo} />
        <div className={styles.pitch}>
          <h2>Every customer, heard.</h2>
          <p>Ratings, comments and SMS replies from homeowners and painters, live in one place.</p>
        </div>
        <div className={styles.can}>
          <PaintCan size={120} />
        </div>
      </section>
      <div className={styles.formSide}>{children}</div>
    </main>
  );
}
