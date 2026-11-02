import type { Category } from "./api";

// Same-origin /api proxy: the browser sends the HttpOnly session cookie automatically.
const API_BASE = "/api";

export type Channel = "web" | "sms";
export type Sentiment = "positive" | "neutral" | "mixed" | "negative";
export type AlertStatus = "open" | "resolved";
export type Role = "manager" | "rep";

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
};

export type NewStaff = { username: string; display_name: string; password: string; role: Role };
export type StaffChange = Partial<{ display_name: string; role: Role; is_active: boolean; password: string }>;

export type DayPoint = { date: string; responses: number; average: number | null };
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
};

export type ReplyDraft = { subject: string; body: string };

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

export type ResponseQuery = {
  q?: string;
  category?: Category;
  channel?: Channel;
  days?: number;
  limit?: number;
  offset?: number;
};

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

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
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
  staff: () => request<StaffMember[]>("/staff"),
  addStaff: (member: NewStaff) => request<StaffMember>("/staff", { method: "POST", body: JSON.stringify(member) }),
  updateStaff: (id: number, change: StaffChange) =>
    request<StaffMember>(`/staff/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  stats: (days: number) => request<Stats>(`/stats${queryString({ days })}`),
  alerts: (status?: AlertStatus) => request<AlertItem[]>(`/alerts${queryString({ status })}`),
  updateAlert: (id: number, change: { is_read?: boolean; status?: AlertStatus }) =>
    request<AlertItem>(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  responses: (query: ResponseQuery) =>
    request<ResponsePage>(`/responses${queryString(query)}`),
  aiStatus: () => request<{ enabled: boolean; demo: boolean }>("/ai/status"),
  summarize: (days: number) => request<AiSummary>(`/ai/summary${queryString({ days })}`, { method: "POST" }),
  draftReply: (alertId: number) => request<ReplyDraft>(`/alerts/${alertId}/draft`, { method: "POST" }),
  sendReply: (alertId: number, reply: ReplyDraft) =>
    request<AlertItem>(`/alerts/${alertId}/reply`, { method: "POST", body: JSON.stringify(reply) }),
  inviteBySms: (name: string, phone: string) =>
    request<{ customer_id: number; sent: boolean }>("/sms/invite", {
      method: "POST",
      body: JSON.stringify({ name, phone }),
    }),
};
