import { useId, type FormEvent, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import type { Segment } from "@/lib/questions";
import type { DetailErrors, Details } from "@/lib/validation";

import styles from "./AboutYou.module.css";
import { ArrowRightIcon, HomeIcon, RollerIcon } from "./icons";
import screen from "./screen.module.css";
import { TopBar } from "./TopBar";

type TextField = Exclude<keyof Details, "segment">;

const SEGMENT_CARDS: readonly { value: Segment; label: string; blurb: string; icon: ReactNode }[] = [
  { value: "homeowner", label: "Homeowner", blurb: "Painting my own space", icon: <HomeIcon size={28} /> },
  { value: "painter", label: "Painter", blurb: "I paint for a living", icon: <RollerIcon size={28} /> },
];

type Props = {
  details: Details;
  errors: DetailErrors;
  submitError: string | null;
  submitting: boolean;
  onSegment: (segment: Segment) => void;
  onChange: (field: TextField, value: string) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AboutYou({ details, errors, submitError, submitting, onSegment, onChange, onBack, onSubmit }: Props) {
  return (
    <form className={`${screen.screen} ${screen.enter}`} onSubmit={onSubmit} noValidate aria-labelledby="about-heading">
      <TopBar title="About you" onBack={onBack} />

      <div className={`${screen.body} ${styles.body}`}>
        <div>
          <h2 id="about-heading" className={`${screen.heading} ${styles.title}`} tabIndex={-1} data-step-heading>
            Almost done!
          </h2>
          <p className={styles.subtitle}>So we can thank you, or make things right.</p>
        </div>

        <fieldset
          className={styles.segments}
          role="radiogroup"
          aria-labelledby="segment-legend"
          aria-required="true"
          aria-invalid={Boolean(errors.segment)}
          aria-describedby={errors.segment ? "segment-error" : undefined}
        >
          <legend id="segment-legend" className={styles.label}>
            I&apos;m a…
          </legend>
          <div className={styles.segmentGrid}>
            {SEGMENT_CARDS.map((card) => (
              <label key={card.value} className={styles.segment} data-selected={details.segment === card.value}>
                <input
                  className={styles.segmentInput}
                  type="radio"
                  name="segment"
                  value={card.value}
                  checked={details.segment === card.value}
                  onChange={() => onSegment(card.value)}
                />
                <span className={styles.segmentIcon}>{card.icon}</span>
                <span className={styles.segmentLabel}>{card.label}</span>
                <span className={styles.segmentBlurb}>{card.blurb}</span>
              </label>
            ))}
          </div>
          {errors.segment && (
            <p id="segment-error" className={styles.error}>
              {errors.segment}
            </p>
          )}
        </fieldset>

        <Field
          label="Your name"
          autoComplete="name"
          value={details.name}
          error={errors.name}
          onChange={(e) => onChange("name", e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={details.email}
          error={errors.email}
          onChange={(e) => onChange("email", e.target.value)}
        />
        <Field
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          value={details.phone}
          error={errors.phone}
          onChange={(e) => onChange("phone", e.target.value)}
        />
        <TextArea
          label="Anything else?"
          optional
          rows={3}
          maxLength={1000}
          value={details.comment}
          error={errors.comment}
          onChange={(e) => onChange("comment", e.target.value)}
        />

        {submitError && (
          <p className={styles.alert} role="alert">
            {submitError}
          </p>
        )}
        <p className={styles.privacy}>We only use your details to follow up on your feedback.</p>
      </div>

      <div className={screen.actions}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Sending…" : "Send feedback"} {!submitting && <ArrowRightIcon />}
        </button>
      </div>
    </form>
  );
}

type FieldProps = { label: string; error?: string; optional?: boolean };

function Field({ label, error, optional, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label} {optional && <span className={styles.optional}>(optional)</span>}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({ label, error, optional, ...textarea }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label} {optional && <span className={styles.optional}>(optional)</span>}
      </label>
      <textarea
        id={id}
        className={`${styles.input} ${styles.textarea}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...textarea}
      />
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
