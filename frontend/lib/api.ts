import type { QuestionId, Rating, Segment } from "./questions";
import type { DetailErrors, Details } from "./validation";

// Same-origin path: next.config.ts forwards /api/* to FastAPI.
const API_BASE = "/api";

export type Category = "detractor" | "passive" | "promoter";

type Answers = Record<QuestionId, Rating>;
export type FeedbackPayload = Omit<Details, "comment" | "segment"> & {
  comment?: string;
  segment: Segment;
} & Answers;

export type FeedbackResult = {
  id: number;
  mean: number;
  category: Category;
  alert_created: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: DetailErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function submitFeedback(payload: FeedbackPayload): Promise<FeedbackResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError("We couldn't reach our servers. Check your connection and try again.");
  }

  if (response.status === 422) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError("Please check the highlighted fields.", fieldErrorsFrom(body));
  }
  if (!response.ok) {
    throw new ApiError("Something went wrong on our side. Please try again.");
  }
  return response.json();
}

type ValidationIssue = { loc?: unknown[]; msg?: string };
const DETAIL_FIELDS: readonly (keyof Details)[] = ["segment", "name", "email", "phone", "comment"];

/** Map FastAPI's 422 body ({detail: [{loc: ["body", "email"], msg}]}) to per-field messages. */
function fieldErrorsFrom(body: unknown): DetailErrors {
  const errors: DetailErrors = {};
  const issues = (body as { detail?: unknown } | null)?.detail;
  if (!Array.isArray(issues)) return errors;

  for (const issue of issues as ValidationIssue[]) {
    const field = issue.loc?.[1];
    if (DETAIL_FIELDS.includes(field as keyof Details) && issue.msg) {
      const message = issue.msg.replace(/^Value error, /, "");
      errors[field as keyof Details] = message.charAt(0).toUpperCase() + message.slice(1);
    }
  }
  return errors;
}
