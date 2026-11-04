import { BrushStroke } from "@/components/brand/Brand";
import { FeedbackFlow } from "@/components/FeedbackFlow";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.canvas}>
      <BrushStroke tone="warm" className={`${styles.decor} ${styles.decorTop}`} />
      <BrushStroke tone="green" className={`${styles.decor} ${styles.decorBottom}`} />
      <BrushStroke tone="sunset" className={`${styles.decor} ${styles.decorSide}`} />

      <main className={styles.phone}>
        <FeedbackFlow />
      </main>
    </div>
  );
}
