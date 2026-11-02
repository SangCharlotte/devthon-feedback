"use client";

import { useRef, type CSSProperties } from "react";

import { RATINGS, SWATCHES, type Rating } from "@/lib/questions";

import { Smiley } from "./Smiley";
import styles from "./RatingPicker.module.css";

type Props = {
  name: string;
  legend: string;
  hint?: string;
  value: Rating | null;
  /** viaPointer is true for taps/clicks, false for keyboard arrows. */
  onChange: (rating: Rating, viaPointer: boolean) => void;
};

/**
 * Five real radio buttons (so keyboards and screen readers work for free),
 * visually replaced by animated paint-swatch smileys.
 */
export function RatingPicker({ name, legend, hint, value, onChange }: Props) {
  const pointerDown = useRef(false);

  return (
    <fieldset className={styles.picker} role="radiogroup" aria-labelledby={`${name}-legend`}>
      <legend id={`${name}-legend`} className={styles.legend}>
        {legend}
      </legend>
      {hint && <p className={styles.hint}>{hint}</p>}

      <div className={styles.options} data-has-value={value !== null}>
        {RATINGS.map((rating) => {
          const id = `${name}-${rating}`;
          const swatch = SWATCHES[rating];
          return (
            <label
              key={rating}
              htmlFor={id}
              className={styles.option}
              data-selected={value === rating}
              style={{ "--swatch": swatch.color } as CSSProperties}
              onPointerDown={() => (pointerDown.current = true)}
            >
              <input
                id={id}
                className={styles.input}
                type="radio"
                name={name}
                value={rating}
                checked={value === rating}
                onChange={() => {
                  onChange(rating, pointerDown.current);
                  pointerDown.current = false;
                }}
              />
              <Smiley rating={rating} className={styles.face} />
              <span className={styles.label}>{swatch.label}</span>
            </label>
          );
        })}
      </div>

      <p className={styles.status} aria-live="polite">
        {value === null ? (
          "Tap a face"
        ) : (
          <>
            <span
              className={styles.chip}
              style={{ background: SWATCHES[value].color }}
              aria-hidden="true"
            />
            {SWATCHES[value].paint}: {SWATCHES[value].label}
          </>
        )}
      </p>
    </fieldset>
  );
}
