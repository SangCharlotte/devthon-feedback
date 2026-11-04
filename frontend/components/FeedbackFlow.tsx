"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError, submitFeedback, type FeedbackResult } from "@/lib/api";
import { QUESTIONS, type QuestionId, type Rating, type Segment } from "@/lib/questions";
import { validateDetails, type DetailErrors, type Details } from "@/lib/validation";

import { AboutYou } from "./customer/AboutYou";
import { ArrowRightIcon, LightbulbIcon } from "./customer/icons";
import screen from "./customer/screen.module.css";
import { TopBar } from "./customer/TopBar";
import { Welcome } from "./customer/Welcome";
import styles from "./FeedbackFlow.module.css";
import { RatingPicker } from "./RatingPicker";
import { ThankYou } from "./ThankYou";

type Step = "welcome" | QuestionId | "about";
const STEPS: readonly Step[] = ["welcome", ...QUESTIONS.map((q) => q.id), "about"];
const AUTO_ADVANCE_MS = 450;
const EMPTY_DETAILS: Details = { segment: null, name: "", email: "", phone: "", comment: "" };

type Answers = Partial<Record<QuestionId, Rating>>;

export function FeedbackFlow() {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  const step = STEPS[stepIndex];
  const screenKey = result ? "thanks" : step;

  // Never fire a pending auto-advance after the component is gone.
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  // Each new screen moves focus to its heading, so keyboard and screen reader users start at the top of it.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    root.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [screenKey]);

  function goTo(next: number) {
    clearTimeout(advanceTimer.current);
    setStepIndex(next);
  }

  function handleRate(id: QuestionId, rating: Rating, viaPointer: boolean) {
    setAnswers((prev) => ({ ...prev, [id]: rating }));
    // Taps auto-advance after a short pause so the animation is visible.
    // Keyboard users move with arrows, so they press "Next" themselves.
    clearTimeout(advanceTimer.current);
    if (viaPointer) {
      advanceTimer.current = setTimeout(() => setStepIndex((s) => s + 1), AUTO_ADVANCE_MS);
    }
  }

  function updateDetail(field: Exclude<keyof Details, "segment">, value: string) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function chooseSegment(segment: Segment) {
    setDetails((prev) => ({ ...prev, segment }));
    setErrors((prev) => ({ ...prev, segment: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const found = validateDetails(details);
    setErrors(found);
    if (Object.keys(found).length > 0 || !details.segment) return;

    const { q1, q2, q3 } = answers;
    if (!q1 || !q2 || !q3) {
      const missing = QUESTIONS.find((q) => !answers[q.id]);
      if (missing) goTo(STEPS.indexOf(missing.id));
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitFeedback({
        segment: details.segment,
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

  function renderScreen() {
    if (result) return <ThankYou result={result} onRestart={restart} />;
    if (step === "welcome") return <Welcome onStart={() => goTo(1)} />;
    if (step === "about") {
      return (
        <AboutYou
          details={details}
          errors={errors}
          submitError={submitError}
          submitting={submitting}
          onSegment={chooseSegment}
          onChange={updateDetail}
          onBack={() => goTo(stepIndex - 1)}
          onSubmit={handleSubmit}
        />
      );
    }

    const number = QUESTIONS.findIndex((q) => q.id === step) + 1;
    const question = QUESTIONS[number - 1];
    const percent = Math.round((number / QUESTIONS.length) * 100);
    return (
      <section className={screen.screen} aria-labelledby={`${question.id}-legend`}>
        <TopBar title={`Question ${number} of ${QUESTIONS.length}`} onBack={() => goTo(stepIndex - 1)} />

        <div className={styles.progressRow}>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
          <span className={styles.percent} aria-hidden="true">
            {percent}%
          </span>
        </div>

        {/* A new key on each question remounts the body, which replays the slide-in. */}
        <div key={step} className={`${screen.body} ${styles.questionBody} ${screen.enter}`}>
          <RatingPicker
            name={question.id}
            legend={question.title}
            hint={question.hint}
            value={answers[question.id] ?? null}
            onChange={(rating, viaPointer) => handleRate(question.id, rating, viaPointer)}
          />

          <aside className={styles.tip}>
            <span className={styles.tipIcon}>
              <LightbulbIcon />
            </span>
            <span>
              <strong>Your opinion matters!</strong>
              <span className={styles.tipText}>Honest answers help us make better paint.</span>
            </span>
          </aside>
        </div>

        <div className={screen.actions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => goTo(stepIndex + 1)}
            disabled={!answers[question.id]}
          >
            Next <ArrowRightIcon />
          </button>
        </div>
      </section>
    );
  }

  return (
    <div ref={root} className={styles.flow}>
      {renderScreen()}
    </div>
  );
}
