import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertItem, Me, ResponseItem, StaffMember, Stats } from "@/lib/admin";

import { Dashboard } from "./Dashboard";
import { AiSummary } from "./AiSummary";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";
import { ReplyComposer } from "./ReplyComposer";
import { ResponsesLog } from "./ResponsesLog";
import { TeamPanel } from "./TeamPanel";
import { TrendChart } from "./TrendChart";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const STATS: Stats = {
  days: 30,
  total_respondents: 128,
  all_time_respondents: 400,
  total_responses: 150,
  average_score: 3.84,
  split: { detractor: 15, passive: 30, promoter: 105 },
  daily: [
    { date: "2026-10-20", responses: 3, average: 3.5 },
    { date: "2026-10-21", responses: 0, average: null },
    { date: "2026-10-22", responses: 4, average: 4.25 },
  ],
  projection: [{ date: "2026-10-23", average: 4.4 }],
  trend_per_day: 0.1,
  alerts: { open: 1, unread: 1 },
  sentiment: { positive: 20, neutral: 4, mixed: 3, negative: 6, untagged: 2 },
};

const ALERT: AlertItem = {
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

const RESPONSE: ResponseItem = {
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
};

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

/** Fake backend: each route returns a Response or undefined to fall through. */
function stubApi(...routes: Route[]) {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const OWNER: Me = { username: "admin", display_name: "admin", role: "manager", is_owner: true };
const REP_ME: Me = { username: "wanjiru", display_name: "Wanjiru Kamau", role: "rep", is_owner: false };
const MEMBER: StaffMember = {
  id: 3,
  username: "wanjiru",
  display_name: "Wanjiru Kamau",
  role: "rep",
  is_active: true,
  created_at: "2026-10-20T08:00:00Z",
  last_login_at: null,
};

const signedInAs =
  (me: Me): Route =>
  (url) =>
    url.pathname === "/api/auth/me" ? json(me) : undefined;
const loggedIn = signedInAs(OWNER);
const dashboardData: Route = (url, init) => {
  if (url.pathname === "/api/stats") return json(STATS);
  if (url.pathname === "/api/alerts") return json([ALERT]);
  if (url.pathname === "/api/responses") return json({ items: [RESPONSE], total: 1 });
  if (url.pathname === "/api/staff" && !init?.method) return json([MEMBER]);
  if (url.pathname === "/api/alerts/7" && init?.method === "PATCH") {
    return json({ ...ALERT, ...JSON.parse(String(init.body)), is_read: true });
  }
  return undefined;
};

beforeEach(() => router.replace.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("LoginForm", () => {
  it("signs in and opens the dashboard", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url) => (url.pathname === "/api/auth/login" ? json({ username: "admin" }) : undefined));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "paint-secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ username: "admin", password: "paint-secret" });
  });

  it("explains a wrong password and clears it", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(() => json({ detail: "Wrong username or password" }, 401));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says when to come back after too many failed logins", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(() => json({ detail: "Too many failed logins. Try again in 15 minutes." }, 429));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "guess");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed logins. Try again in 15 minutes.");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("Dashboard", () => {
  it("sends visitors without a session to the login page", async () => {
    stubApi(() => json({ detail: "Not logged in" }, 401));
    render(<Dashboard />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });

  it("shows the headline number, split and open alerts", async () => {
    stubApi(loggedIn, dashboardData);
    render(<Dashboard />);

    expect(await screen.findByText("128")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Promoters.*105.*70%/ })).toBeInTheDocument();
    const alerts = screen.getByRole("region", { name: /Needs follow-up/ });
    expect(within(alerts).getByText("Chebet Kiprop")).toBeInTheDocument();
    expect(within(alerts).getByRole("link", { name: "chebet@example.com" })).toHaveAttribute(
      "href",
      "mailto:chebet@example.com",
    );
    expect(document.title).toBe("(1) Dashboard · Company X Paints");
  });

  it("resolves an alert", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(loggedIn, dashboardData);
    render(<Dashboard />);

    const alerts = await screen.findByRole("region", { name: /Needs follow-up/ });
    await user.click(await within(alerts).findByRole("button", { name: "Resolved" }));

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/alerts/7");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: "resolved" });
  });

  it("re-asks the API when the date range changes", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(loggedIn, dashboardData);
    render(<Dashboard />);
    await screen.findByText("128");

    await user.click(screen.getByRole("button", { name: "Last 7 days" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/stats?days=7")).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ResponsesLog", () => {
  it("searches and opens one person's per-question breakdown", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(dashboardData);
    render(<ResponsesLog days={30} refreshKey={0} onError={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search responses" }), "chebet");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=chebet"))).toBe(true),
    );

    await user.click(await screen.findByRole("button", { name: /Chebet Kiprop/ }));
    expect(screen.getByText("Product experience").nextSibling).toHaveTextContent("1/5");
    expect(screen.getByText("Customer care").nextSibling).toHaveTextContent("2/5");
    expect(screen.getByText("“Colour faded”")).toBeInTheDocument();
  });
});

describe("TrendChart", () => {
  it("offers every value, including projections, as a table", () => {
    render(<TrendChart daily={STATS.daily} projection={STATS.projection} />);

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(5); // header + 3 days + 1 projected day
    expect(rows[2]).toHaveTextContent("21 Oct–0");
    expect(rows[4]).toHaveTextContent("4.40 (projected)");
    expect(screen.getByRole("img")).toHaveAccessibleName(/latest 4.25 on 22 Oct.*Projected 4.4/);
  });

  it("says so when there is no data", () => {
    render(<TrendChart daily={[{ date: "2026-10-22", responses: 0, average: null }]} projection={[]} />);
    expect(screen.getByText("No feedback in this period yet.")).toBeInTheDocument();
  });
});

describe("AI features", () => {
  const SUMMARY = {
    headline: "Peeling complaints are up this month",
    themes: [{ title: "Peeling", detail: "About 6 customers, mostly exterior walls.", sentiment: "negative" }],
    actions: ["Check the September batch"],
    days: 30,
    comments_used: 150,
    comments_total: 212,
    generated_at: "2026-10-23T08:00:00Z",
  };

  it("summarises on click and says how much it read", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url, init) =>
      url.pathname === "/api/ai/summary" && init?.method === "POST" ? json(SUMMARY) : undefined,
    );
    render(<AiSummary days={30} enabled sentiment={STATS.sentiment} onError={vi.fn()} />);

    expect(screen.getByText(/20 positive/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); // nothing runs until someone asks
    await user.click(screen.getByRole("button", { name: "Summarise the last 30 days" }));

    expect(await screen.findByText("Peeling complaints are up this month")).toBeInTheDocument();
    expect(screen.getByText(/the latest 150 of 212 comments/)).toBeInTheDocument();
    expect(screen.getByText(/AI-generated/)).toBeInTheDocument();
  });

  it("explains an AI failure without breaking the dashboard", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(() => json({ detail: "AI summary unavailable: Can't reach the AI service" }, 503));
    const onError = vi.fn();
    render(<AiSummary days={30} enabled sentiment={STATS.sentiment} onError={onError} />);

    await user.click(screen.getByRole("button", { name: /Summarise/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Can't reach the AI service.*data is safe/);
    expect(onError).not.toHaveBeenCalled(); // handled in the card, not a dashboard-wide error
  });

  it("labels demo mode so it can't pass for real AI", () => {
    render(<AiSummary days={30} enabled demo sentiment={STATS.sentiment} onError={vi.fn()} />);
    expect(screen.getByRole("note")).toHaveTextContent(/Demo mode.*not real AI/);
  });

  it("explains how to switch AI on when it's off", () => {
    render(<AiSummary days={30} enabled={false} sentiment={STATS.sentiment} onError={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/AI insights are switched off/)).toBeInTheDocument();
  });

  it("sends the reply as the rep edited it, not the AI's draft", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === "/api/alerts/7/draft") return json({ subject: "We're sorry", body: "AI wording" });
      if (url.pathname === "/api/alerts/7/reply" && init?.method === "POST") {
        return json({ ...ALERT, replied_at: "2026-10-23T09:00:00Z", replied_by: "admin" });
      }
      return undefined;
    });
    const onSent = vi.fn();
    render(<ReplyComposer alert={ALERT} aiEnabled onSent={onSent} onCancel={vi.fn()} onError={vi.fn()} />);

    const body = await screen.findByDisplayValue("AI wording");
    expect(screen.getByText(/AI draft.*Nothing is sent until you do/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/reply"))).toBe(false);

    await user.clear(body);
    await user.type(body, "Hi Chebet, I will call you at 3pm today. - Amina");
    await user.click(screen.getByRole("button", { name: "Send email" }));

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const reply = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/reply"));
    expect(JSON.parse(String(reply?.[1]?.body))).toEqual({
      subject: "We're sorry",
      body: "Hi Chebet, I will call you at 3pm today. - Amina",
    });
  });

  it("lets the rep write the reply themselves when the AI fails", async () => {
    stubApi(() => json({ detail: "AI draft unavailable" }, 503));
    render(<ReplyComposer alert={ALERT} aiEnabled onSent={vi.fn()} onCancel={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("write one yourself");
    expect(screen.getByLabelText(/Message to/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled(); // empty so far
  });

  it("shows the AI tags in a person's breakdown", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(dashboardData);
    render(<ResponsesLog days={30} refreshKey={0} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /Chebet Kiprop/ }));
    expect(screen.getByText("durability")).toBeInTheDocument();
    expect(screen.getByText("✦ AI tags")).toBeInTheDocument();
  });
});

describe("Loading state", () => {
  it("doesn't claim there are no alerts before they have loaded", async () => {
    stubApi(loggedIn, (url) => (url.pathname === "/api/stats" ? new Promise<never>(() => {}) : undefined));
    render(<Dashboard />);
    expect(await screen.findByText("Loading alerts…")).toBeInTheDocument();
    expect(screen.queryByText(/No open alerts/)).not.toBeInTheDocument();
  });
});

describe("Team accounts", () => {
  it("shows managers the Team card", async () => {
    stubApi(loggedIn, dashboardData);
    render(<Dashboard />);
    const team = await screen.findByRole("region", { name: "Team" });
    expect(await within(team).findByText("Wanjiru Kamau")).toBeInTheDocument();
    expect(within(team).getByText("Never signed in")).toBeInTheDocument();
  });

  it("hides the Team card from care reps and offers them a password change", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(signedInAs(REP_ME), dashboardData);
    render(<Dashboard />);

    expect(await screen.findByText("128")).toBeInTheDocument();
    expect(screen.getByText("Wanjiru Kamau")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Team" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Password" }));
    expect(screen.getByRole("region", { name: "Change your password" })).toBeInTheDocument();
  });

  it("gives the owner no password button: that password lives in .env", async () => {
    stubApi(loggedIn, dashboardData);
    render(<Dashboard />);
    await screen.findByText("128");
    expect(screen.queryByRole("button", { name: "Password" })).not.toBeInTheDocument();
  });

  it("adds a team member with a lowercase username", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url, init) => {
      if (url.pathname !== "/api/staff") return undefined;
      if (init?.method === "POST") {
        return json({ ...MEMBER, id: 4, username: "amina", display_name: "Amina Otieno" }, 201);
      }
      return json([]);
    });
    render(<TeamPanel currentUsername="admin" onError={vi.fn()} />);
    await screen.findByText(/No team members yet/);

    await user.type(screen.getByLabelText("Full name"), "Amina Otieno");
    await user.type(screen.getByLabelText("Username"), "Amina");
    await user.type(screen.getByLabelText("Temporary password"), "temp-pass-2026");
    await user.click(screen.getByRole("button", { name: "Add to team" }));

    expect(await screen.findByText("Amina Otieno")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      display_name: "Amina Otieno",
      username: "amina",
      password: "temp-pass-2026",
      role: "rep",
    });
  });

  it("refuses a short temporary password before calling the server", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url) => (url.pathname === "/api/staff" ? json([]) : undefined));
    render(<TeamPanel currentUsername="admin" onError={vi.fn()} />);
    await screen.findByText(/No team members yet/);

    await user.type(screen.getByLabelText("Full name"), "Amina");
    await user.type(screen.getByLabelText("Username"), "amina");
    await user.type(screen.getByLabelText("Temporary password"), "short");
    await user.click(screen.getByRole("button", { name: "Add to team" }));

    expect(screen.getByRole("status")).toHaveTextContent("at least 10 characters");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("deactivates someone and says they were signed out", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === "/api/staff/3" && init?.method === "PATCH") return json({ ...MEMBER, is_active: false });
      return url.pathname === "/api/staff" ? json([MEMBER]) : undefined;
    });
    render(<TeamPanel currentUsername="admin" onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("signed out everywhere");
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ is_active: false });
  });

  it("never offers a manager the buttons to deactivate or demote themselves", async () => {
    stubApi((url) => (url.pathname === "/api/staff" ? json([{ ...MEMBER, role: "manager" }]) : undefined));
    render(<TeamPanel currentUsername="wanjiru" onError={vi.fn()} />);
    await screen.findByText("Wanjiru Kamau");
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make care rep" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("checks the two new passwords match", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(() => json(REP_ME));
    render(<PasswordForm onDone={vi.fn()} onError={vi.fn()} />);

    await user.type(screen.getByLabelText("Current password"), "temp-pass-2026");
    await user.type(screen.getByLabelText("New password"), "my-new-password");
    await user.type(screen.getByLabelText("Repeat new password"), "my-new-passwrod");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("status")).toHaveTextContent("don't match");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Repeat new password"));
    await user.type(screen.getByLabelText("Repeat new password"), "my-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText(/signed out on your other devices/)).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      current_password: "temp-pass-2026",
      new_password: "my-new-password",
    });
  });
});
