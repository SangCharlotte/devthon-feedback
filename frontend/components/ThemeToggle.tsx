"use client";

import { MoonIcon, SunIcon } from "./customer/icons";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** No React state needed: CSS shows the right icon from the <html data-theme> attribute. */
export function ThemeToggle() {
  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage blocked (private mode): the theme still changes, it just won't be remembered.
    }
  }

  return (
    <button type="button" className={styles.toggle} onClick={toggle} aria-label="Toggle colour theme">
      <SunIcon className={styles.sun} />
      <MoonIcon className={styles.moon} />
    </button>
  );
}
