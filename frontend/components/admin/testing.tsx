import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

import type { AlertItem, Me, ResponseItem, StaffMember, Stats } from "@/lib/admin";

import { AdminShell } from "./AdminShell";

export const STATS: Stats = {
  days: 30,
  total_respondents: 128,
  all_time_respondents: 400,
  total_responses: 150,
  average_score: 3.84,
  split: { detractor: 15, passive: 30, promoter: 105 },
  daily: [
    { date: "2026-10-20", responses: 3, average: 3.5, detractor: 1, passive: 0, promoter: 2 },
    { date: "2026-10-21", responses: 0, average: null, detractor: 0, passive: 0, promoter: 0 },
    { date: "2026-10-22", responses: 4, average: 4.25, detractor: 0, passive: 1, promoter: 3 },
  ],
  projection: [{ date: "2026-10-23", average: 4.4 }],
  trend_per_day: 0.1,
  alerts: { open: 1, unread: 1 },
  sentiment: { positive: 20, neutral: 4, mixed: 3, negative: 6, untagged: 2 },
  segments: { homeowner: 80, painter: 48 },
  topics: [
    { topic: "coverage", count: 12, negative: 1 },
    { topic: "peeling", count: 8, negative: 7 },
  ],
  tagged_comments: 33,
  questions: { q1: 3.9, q2: 4.1, q3: 3.5 },
  previous: {
    total_responses: 120,
    total_respondents: 100,
    average_score: 3.64,
    split: { detractor: 24, passive: 24, promoter: 72 },
  },
};

export const ALERT: AlertItem = {
  id: 7,
  status: "open",
  is_read: false,
  created_at: "2026-10-22T08:00:00Z",
  resolved_at: null,
  email_sent_at: "2026-10-22T08:00:05Z",
  sms_sent_at: null,
  replied_at: null,
  replied_by: null,
  response_id: 70,
  channel: "web",
  mean: 1.67,
  customer_name: "Chebet Kiprop",
  customer_email: "chebet@example.com",
  customer_phone: "+254711000222",
};

export const RESPONSE: ResponseItem = {
  id: 70,
  created_at: "2026-10-22T08:00:00Z",
  channel: "web",
  q1: 1,
  q2: 2,
  q3: 2,
  mean: 1.67,
  category: "detractor",
  comment: "Colour faded",
  customer_name: "Chebet Kiprop",
  customer_email: "chebet@example.com",
  customer_phone: "+254711000222",
  alert_status: "open",
  ai_sentiment: "negative",
  ai_topics: ["durability", "colour"],
  segment: "painter",
};

export const OWNER: Me = { username: "admin", display_name: "admin", role: "manager", is_owner: true };
export const REP_ME: Me = { username: "wanjiru", display_name: "Wanjiru Kamau", role: "rep", is_owner: false };
export const MEMBER: StaffMember = {
  id: 3,
  username: "wanjiru",
  display_name: "Wanjiru Kamau",
  role: "rep",
  is_active: true,
  created_at: "2026-10-20T08:00:00Z",
  last_login_at: null,
  is_owner: false,
};

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

/** Fake backend: each route returns a Response or undefined to fall through. */
export function stubApi(...routes: Route[]) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    return json({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const calledWith = (fetchMock: ReturnType<typeof stubApi>, predicate: (url: URL) => boolean) =>
  fetchMock.mock.calls.some(([input]) => predicate(new URL(String(input), "http://localhost")));

export const signedInAs =
  (me: Me, ai = { enabled: false, demo: false }): Route =>
  (url) => {
    if (url.pathname === "/api/auth/me") return json(me);
    if (url.pathname === "/api/ai/status") return json(ai);
    return undefined;
  };

export const adminData: Route = (url, init) => {
  if (url.pathname === "/api/stats") return json(STATS);
  if (url.pathname === "/api/alerts") return json(url.searchParams.get("status") === "resolved" ? [] : [ALERT]);
  if (url.pathname === "/api/responses") return json({ items: [RESPONSE], total: 1 });
  if (url.pathname === "/api/staff" && !init?.method) return json([MEMBER]);
  if (url.pathname === "/api/alerts/7" && init?.method === "PATCH") {
    return json({ ...ALERT, ...JSON.parse(String(init.body)), is_read: true });
  }
  return undefined;
};

export const renderInShell = (page: ReactNode) => render(<AdminShell>{page}</AdminShell>);
