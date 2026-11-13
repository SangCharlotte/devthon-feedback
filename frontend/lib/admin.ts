import type { Category } from "./api";
import type { QuestionId } from "./questions";

// Same-origin /api proxy: the browser sends the HttpOnly session cookie automatically.
const API_BASE = "/api";

export type Channel = "web" | "sms" | "ussd";

export const CHANNEL_LABELS: Record<Channel, string> = { web: "Web form", sms: "SMS", ussd: "USSD" };
export type Sentiment = "positive" | "neutral" | "mixed" | "negative";
export type AlertStatus = "open" | "resolved";
export type Role = "manager" | "rep";
export type Segment = "homeowner" | "painter";

/** Who is signed in. The owner is the account from the server's .env file. */
export type Me = { username: string; display_name: string; role: Role; is_owner: boolean };

export type StaffMember = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  /** The .env account: the server refuses role, password and activation changes to it. */
  is_owner: boolean;
};

export type NewStaff = { username: string; display_name: string; password: string; role: Role };
export type StaffChange = Partial<{ display_name: string; role: Role; is_active: boolean; password: string }>;

export type DayPoint = {
  date: string;
  responses: number;
  average: number | null;
  detractor: number;
  passive: number;
  promoter: number;
};
export type ProjectedPoint = { date: string; average: number };

export type Stats = {
  days: number;
  total_respondents: number;
  all_time_respondents: number;
  total_responses: number;
  average_score: number | null;
  split: Record<Category, number>;
  daily: DayPoint[];
  projection: ProjectedPoint[];
  trend_per_day: number | null;
  alerts: { open: number; unread: number };
  sentiment: Record<Sentiment | "untagged", number>;
  segments: Record<Segment, number>;
  /** AI topics by count, at most 8. `negative` counts the comments tagged negative. */
  topics: TopicCount[];
  /** Comments with an AI sentiment: the denominator for topic shares. */
  tagged_comments: number;
  questions: Record<QuestionId, number | null>;
  /** The equal-length window just before this one; null when the server doesn't send it. */
  previous: PeriodTotals | null;
};

export type TopicCount = { topic: string; count: number; negative: number };

export type PeriodTotals = {
  total_responses: number;
  total_respondents: number;
  average_score: number | null;
  split: Record<Category, number>;
};

export type AlertItem = {
  id: number;
  status: AlertStatus;
  is_read: boolean;
  created_at: string;
  resolved_at: string | null;
  email_sent_at: string | null;
  sms_sent_at: string | null;
  replied_at: string | null;
  replied_by: string | null;
  response_id: number;
  channel: Channel;
  mean: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
};

export type ResponseItem = {
  id: number;
  created_at: string;
  channel: Channel;
  q1: number;
  q2: number;
  q3: number;
  mean: number;
  category: Category;
  comment: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  alert_status: AlertStatus | null;
  ai_sentiment: Sentiment | null;
  ai_topics: string[];
  segment: Segment | null;
};

export type ReplyDraft = { subject: string; body: string };
/** "test"/"sandbox": the message is accepted but never reaches the customer. */
export type DeliveryStatus = { email: "live" | "test" | "off"; sms: "live" | "sandbox" | "off" };

export type AiSummary = {
  headline: string;
  themes: { title: string; detail: string; sentiment: Sentiment }[];
  actions: string[];
  days: number;
  comments_used: number;
  comments_total: number;
  generated_at: string;
};

export type ResponsePage = { items: ResponseItem[]; total: number };

export type ResponseFilters = {
  q?: string;
  category?: Category;
  channel?: Channel;
  sentiment?: Sentiment;
  segment?: Segment;
  days?: number;
};

export type ResponseQuery = ResponseFilters & { limit?: number; offset?: number };

/** Thrown on 401 so the dashboard can send the user back to the login page. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Your session has ended. Please log in again.");
    this.name = "UnauthorizedError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection.");
  }
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function queryString(params: { [key: string]: string | number | undefined }): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

type Raw<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type RawStats = Omit<Raw<Stats, "segments" | "topics" | "tagged_comments" | "questions" | "previous">, "daily"> & {
  daily: Raw<DayPoint, "detractor" | "passive" | "promoter">[];
};

/** Fill fields an older backend doesn't send yet, so the UI only ever sees one shape. */
export function parseStats(raw: RawStats): Stats {
  return {
    ...raw,
    daily: raw.daily.map((d) => ({ detractor: 0, passive: 0, promoter: 0, ...d })),
    segments: raw.segments ?? { homeowner: 0, painter: 0 },
    topics: raw.topics ?? [],
    tagged_comments: raw.tagged_comments ?? 0,
    questions: raw.questions ?? { q1: null, q2: null, q3: null },
    previous: raw.previous ?? null,
  };
}

function parseResponses(page: { items: Raw<ResponseItem, "segment">[]; total: number }): ResponsePage {
  return { ...page, items: page.items.map((item) => ({ ...item, segment: item.segment ?? null })) };
}

type RawMember = Raw<StaffMember, "is_owner">;
const parseMember = (m: RawMember): StaffMember => ({ ...m, is_owner: m.is_owner ?? false });

/** Same filters as the inbox, minus paging; the browser sends the session cookie with the download. */
export function exportUrl(filters: ResponseFilters): string {
  return `${API_BASE}/responses/export${queryString(filters)}`;
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<Me>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<Me>("/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    request<Me>("/auth/password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  staff: () => request<RawMember[]>("/staff").then((members) => members.map(parseMember)),
  addStaff: (member: NewStaff) =>
    request<RawMember>("/staff", { method: "POST", body: JSON.stringify(member) }).then(parseMember),
  updateStaff: (id: number, change: StaffChange) =>
    request<RawMember>(`/staff/${id}`, { method: "PATCH", body: JSON.stringify(change) }).then(parseMember),
  stats: (days: number) => request<RawStats>(`/stats${queryString({ days })}`).then(parseStats),
  alerts: (status?: AlertStatus) => request<AlertItem[]>(`/alerts${queryString({ status })}`),
  updateAlert: (id: number, change: { is_read?: boolean; status?: AlertStatus }) =>
    request<AlertItem>(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  responses: (query: ResponseQuery) =>
    request<{ items: Raw<ResponseItem, "segment">[]; total: number }>(`/responses${queryString(query)}`).then(
      parseResponses,
    ),
  aiStatus: () => request<{ enabled: boolean; demo: boolean }>("/ai/status"),
  summarize: (days: number) => request<AiSummary>(`/ai/summary${queryString({ days })}`, { method: "POST" }),
  draftReply: (alertId: number) => request<ReplyDraft>(`/alerts/${alertId}/draft`, { method: "POST" }),
  deliveryStatus: () => request<DeliveryStatus>("/alerts/delivery"),
  sendReply: (alertId: number, reply: ReplyDraft) =>
    request<AlertItem>(`/alerts/${alertId}/reply`, { method: "POST", body: JSON.stringify(reply) }),
  inviteBySms: (name: string, phone: string) =>
    request<{ customer_id: number; sent: boolean }>("/sms/invite", {
      method: "POST",
      body: JSON.stringify({ name, phone }),
    }),
};
