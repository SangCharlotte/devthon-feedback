import { FeedbackFlow } from "@/components/FeedbackFlow";
import { ThemeToggle } from "@/components/ThemeToggle";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.logo} aria-hidden="true" />
          Company X Paints
        </span>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <FeedbackFlow />
      </main>

      <footer className={styles.footer}>
        Takes under a minute · We only use your details to follow up on your feedback
      </footer>
    </div>
  );
}
