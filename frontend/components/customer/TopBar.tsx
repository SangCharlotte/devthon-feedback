import { Logo } from "@/components/brand/Brand";

import { ThemeToggle } from "../ThemeToggle";
import { ArrowLeftIcon } from "./icons";
import styles from "./screen.module.css";

type Props = { title: string; onBack: () => void } | { title?: undefined; onBack?: undefined };

/** Back arrow and step title when inside the flow; the Company X logo on the welcome and thank-you screens. */
export function TopBar({ title, onBack }: Props) {
  if (!onBack) {
    return (
      <header className={styles.top} data-logo="true">
        <Logo size={34} />
        <ThemeToggle />
      </header>
    );
  }
  return (
    <header className={styles.top}>
      <button type="button" className={styles.iconButton} onClick={onBack} aria-label="Back">
        <ArrowLeftIcon size={24} />
      </button>
      <p className={styles.topTitle}>{title}</p>
      <ThemeToggle />
    </header>
  );
}
