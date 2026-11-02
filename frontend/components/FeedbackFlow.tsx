"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { ApiError, submitFeedback, type FeedbackResult } from "@/lib/api";
import { QUESTIONS, type QuestionId, type Rating } from "@/lib/questions";
import { validateDetails, type DetailErrors, type Details } from "@/lib/validation";

import styles from "./FeedbackFlow.module.css";
import { RatingPicker } from "./RatingPicker";
import { ThankYou } from "./ThankYou";

const DETAILS_STEP = QUESTIONS.length;
const TOTAL_STEPS = QUESTIONS.length + 1;
const AUTO_ADVANCE_MS = 450;
const EMPTY_DETAILS: Details = { name: "", email: "", phone: "", comment: "" };

type Answers = Partial<Record<QuestionId, Rating>>;

export function FeedbackFlow() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Never fire a pending auto-advance after the component is gone.
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  function goTo(next: number) {
    clearTimeout(advanceTimer.current);
    setStep(next);
  }

  function handleRate(id: QuestionId, rating: Rating, viaPointer: boolean) {
    setAnswers((prev) => ({ ...prev, [id]: rating }));
    // Taps auto-advance after a short pause so the animation is visible.
    // Keyboard users move with arrows, so they press "Next" themselves.
    clearTimeout(advanceTimer.current);
    if (viaPointer) {
      advanceTimer.current = setTimeout(() => setStep((s) => s + 1), AUTO_ADVANCE_MS);
    }
  }

  function updateDetail(field: keyof Details, value: string) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const found = validateDetails(details);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const { q1, q2, q3 } = answers;
    if (!q1 || !q2 || !q3) {
      goTo(QUESTIONS.findIndex((q) => !answers[q.id]));
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitFeedback({
        name: details.name.trim(),
        email: details.email.trim(),
        phone: details.phone.trim(),
        comment: details.comment.trim() || undefined,
        q1,
        q2,
        q3,
      });
      setResult(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        setSubmitError(error.message);
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    goTo(0);
    setAnswers({});
    setDetails(EMPTY_DETAILS);
    setErrors({});
    setSubmitError(null);
    setResult(null);
  }

  if (result) {
    return <ThankYou result={result} name={details.name} onRestart={restart} />;
  }

  const question = QUESTIONS[step];

  return (
    <section className="card">
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step + 1}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* A new key on each step remounts it, which replays the slide-in animation. */}
      <div key={step} className={styles.screen}>
        {question ? (
          <>
            <p className={styles.eyebrow}>
              Question {step + 1} of {QUESTIONS.length}
            </p>
            <RatingPicker
              name={question.id}
              legend={question.title}
              hint={question.hint}
              value={answers[question.id] ?? null}
              onChange={(rating, viaPointer) => handleRate(question.id, rating, viaPointer)}
            />
            <div className={styles.nav}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => goTo(step - 1)}
                disabled={step === 0}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => goTo(step + 1)}
                disabled={!answers[question.id]}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div>
              <p className={styles.eyebrow}>Last step</p>
              <h2 className={styles.title}>Almost done!</h2>
              <p className={styles.subtitle}>So we can thank you, or make things right.</p>
            </div>

            <Field
              label="Your name"
              autoComplete="name"
              value={details.name}
              error={errors.name}
              onChange={(e) => updateDetail("name", e.target.value)}
            />
            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={details.email}
              error={errors.email}
              onChange={(e) => updateDetail("email", e.target.value)}
            />
            <Field
              label="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={details.phone}
              error={errors.phone}
              onChange={(e) => updateDetail("phone", e.target.value)}
            />
            <TextArea
              label="Anything else?"
              optional
              rows={3}
              maxLength={1000}
              value={details.comment}
              error={errors.comment}
              onChange={(e) => updateDetail("comment", e.target.value)}
            />

            {submitError && (
              <p className={styles.alert} role="alert">
                {submitError}
              </p>
            )}

            <div className={styles.nav}>
              <button type="button" className="btn btn-secondary" onClick={() => goTo(DETAILS_STEP - 1)}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

type FieldProps = { label: string; error?: string; optional?: boolean };

function Field({ label, error, optional, ...input }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
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

function TextArea({
  label,
  error,
  optional,
  ...textarea
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
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
