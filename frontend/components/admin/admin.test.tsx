import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REFRESH_MS } from "./AdminContext";
import { AlertsView } from "./AlertsView";
import { DashboardView } from "./DashboardView";
import { FeedbackInbox } from "./FeedbackInbox";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";
import { ReplyComposer } from "./ReplyComposer";
import { SettingsView } from "./SettingsView";
import { TeamPanel } from "./TeamPanel";
import {
  adminData,
  ALERT,
  calledWith,
  json,
  MEMBER,
  OWNER,
  renderInShell,
  REP_ME,
  RESPONSE,
  signedInAs,
  STATS,
  stubApi,
} from "./testing";
import { TrendChart } from "./TrendChart";

const router = { replace: vi.fn(), push: vi.fn() };
let pathname = "/admin";
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
  pathname = "/admin";
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const loggedIn = signedInAs(OWNER);

describe("LoginForm", () => {
  it("signs in and opens the dashboard", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url) => (url.pathname === "/api/auth/login" ? json(OWNER) : undefined));
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "paint-secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      username: "admin",
      password: "paint-secret",
    });
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
});

describe("Admin shell", () => {
  it("sends visitors without a session to the login page", async () => {
    stubApi(() => json({ detail: "Not logged in" }, 401));
    renderInShell(<DashboardView />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("goes back to login when the session ends mid-visit", async () => {
    let expired = false;
    stubApi((url) => (expired && url.pathname !== "/api/auth/me" ? json({}, 401) : undefined), loggedIn, adminData);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderInShell(<DashboardView />);
    await screen.findByRole("list", { name: "Key numbers" });

    expired = true;
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });

  it("badges unread alerts in the nav, the bell and the tab title", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);

    await screen.findByRole("list", { name: "Key numbers" });
    const alertsLink = screen.getByRole("link", { name: /^Alerts/ });
    expect(alertsLink).toHaveTextContent("Alerts1 unread");
    expect(alertsLink).toHaveAttribute("href", "/admin/alerts");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("(1) Dashboard · Company X Paints");

    const bell = screen.getByRole("button", { name: "Alerts, 1 unread" });
    await user.click(bell);
    expect(bell).toHaveAttribute("aria-expanded", "true");
    expect(within(bell.parentElement!).getByText("Chebet Kiprop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all alerts/ })).toHaveAttribute("href", "/admin/alerts");
  });

  it("searches the inbox from the top bar", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);

    await user.type(await screen.findByRole("searchbox", { name: "Search feedback" }), "peeling{Enter}");
    expect(router.push).toHaveBeenCalledWith("/admin/feedback?q=peeling");
  });

  it("offers staff a password change in the account menu, but not the .env owner", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(signedInAs(REP_ME), adminData);
    const { unmount } = renderInShell(<DashboardView />);
    await user.click(await screen.findByRole("button", { name: "Account menu for Wanjiru Kamau" }));
    expect(screen.getByText("Care rep")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change password" })).toHaveAttribute("href", "/admin/settings#password");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    unmount();

    stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);
    await user.click(await screen.findByRole("button", { name: "Account menu for admin" }));
    expect(screen.getByText("Owner · manager")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change password" })).not.toBeInTheDocument();
  });
});

describe("Dashboard", () => {
  it("shows the KPIs with their change since the previous period", async () => {
    stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);

    const kpis = await screen.findByRole("list", { name: "Key numbers" });
    const [rating, respondents, positive, negative] = within(kpis).getAllByRole("listitem");
    expect(rating).toHaveTextContent(/Overall rating3\.8\/ 5\+0\.2 vs prev\. 30 days/);
    expect(respondents).toHaveTextContent(/128150 responses\+28%/);
    expect(positive).toHaveTextContent(/70%promoters\+10 pts/);
    // Fewer detractors is a fall, but it's good news: shown green, not red.
    expect(negative).toHaveTextContent(/10%detractors−10 pts/);
    expect(within(negative).getByText(/vs prev/)).toHaveAttribute("data-good", "true");
    expect(within(positive).getByText(/vs prev/)).toHaveAttribute("data-good", "true");
  });

  it("shows segments, themes and the attention card", async () => {
    stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);

    expect(await screen.findByRole("button", { name: /Painters.*48.*38%/ })).toBeInTheDocument();
    const themes = screen.getByRole("region", { name: "Top Feedback Themes" });
    expect(within(themes).getByText("peeling").closest("li")).toHaveAttribute("data-tone", "negative");
    expect(within(themes).getByText("coverage").closest("li")).toHaveTextContent("36%"); // 12 of 33 tagged
    const attention = screen.getByRole("region", { name: "Attention Needed" });
    expect(attention).toHaveTextContent("15 negative reviews in the last 30 days");
    expect(within(attention).getByRole("link", { name: /View Details/ })).toHaveAttribute("href", "/admin/alerts");
  });

  it("asks for the new range everywhere when it changes", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(loggedIn, adminData);
    renderInShell(<DashboardView />);
    await screen.findByRole("list", { name: "Key numbers" });

    await user.selectOptions(screen.getByLabelText("Date range"), "7");
    await waitFor(() =>
      expect(calledWith(fetchMock, (u) => u.pathname === "/api/stats" && u.search === "?days=7")).toBe(true),
    );
    expect(sessionStorage.getItem("admin-days")).toBe("7");
  });

  it("slides new feedback in when the poll finds it", async () => {
    let items = [RESPONSE];
    stubApi(
      loggedIn,
      (url) => (url.pathname === "/api/responses" ? json({ items, total: items.length }) : undefined),
      adminData,
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderInShell(<DashboardView />);
    const latest = await screen.findByRole("region", { name: "Latest feedback" });
    expect(await within(latest).findByText("Chebet Kiprop")).toBeInTheDocument();
    expect(within(latest).getByText("Chebet Kiprop").closest("li")).toHaveAttribute("data-new", "false");

    items = [{ ...RESPONSE, id: 71, customer_name: "Amina Otieno", comment: "Lovely finish" }, RESPONSE];
    await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS));
    expect((await within(latest).findByText("Amina Otieno")).closest("li")).toHaveAttribute("data-new", "true");
  });

  it("still works against a backend without the new stats fields", async () => {
    const { segments, topics, tagged_comments, questions, previous, ...old } = STATS;
    void [segments, topics, tagged_comments, questions, previous];
    stubApi(loggedIn, (url) => (url.pathname === "/api/stats" ? json(old) : undefined), adminData);
    renderInShell(<DashboardView />);

    const kpis = await screen.findByRole("list", { name: "Key numbers" });
    expect(kpis).toHaveTextContent("128");
    expect(kpis).not.toHaveTextContent("vs prev");
    expect(screen.getByText(/Themes come from AI comment tagging/)).toBeInTheDocument();
  });
});

describe("Feedback inbox", () => {
  it("filters by sentiment and exports exactly what's filtered", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(loggedIn, adminData);
    renderInShell(<FeedbackInbox start={{ segment: "painter" }} />);
    await screen.findByText("Chebet Kiprop");

    await user.selectOptions(screen.getByLabelText("Filter by sentiment"), "negative");
    await waitFor(() =>
      expect(
        calledWith(fetchMock, (u) => u.pathname === "/api/responses" && u.searchParams.get("sentiment") === "negative"),
      ).toBe(true),
    );
    const href = new URL(screen.getByRole("link", { name: "Export" }).getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/api/responses/export");
    expect(Object.fromEntries(href.searchParams)).toEqual({ sentiment: "negative", segment: "painter", days: "30" });
  });

  it("opens one person's per-question scores, and Escape closes it", async () => {
    const user = userEvent.setup({ delay: null });
    stubApi(loggedIn, adminData);
    renderInShell(<FeedbackInbox start={{}} />);

    const row = await screen.findByRole("button", { name: /Chebet Kiprop/ });
    await user.click(row);
    const detail = screen.getByRole("dialog", { name: "Chebet Kiprop" });
    expect(within(detail).getByText("Product experience").closest("div")).toHaveTextContent("1/5");
    expect(within(detail).getByText("Customer care").closest("div")).toHaveTextContent("2/5");
    expect(within(detail).getByText("Happy with product").closest("div")).toHaveTextContent("2/5");
    expect(detail).toHaveTextContent("1.67 / 5 mean");
    expect(detail).toHaveTextContent("Detractor");
    expect(within(detail).getByText("Painter")).toBeInTheDocument();
    expect(within(detail).getByText("durability")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /Open: needs a call back/ })).toHaveAttribute(
      "href",
      "/admin/alerts",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("explains AI is off and keeps the inbox working", async () => {
    stubApi(loggedIn, adminData);
    renderInShell(<FeedbackInbox start={{}} />);

    expect(await screen.findByText(/AI insights are switched off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What are customers saying?" })).not.toBeInTheDocument();
    expect(await screen.findByText("Chebet Kiprop")).toBeInTheDocument();
  });

  it("summarises on request, and an AI failure stays in its panel", async () => {
    const user = userEvent.setup({ delay: null });
    let fail = false;
    stubApi(
      signedInAs(OWNER, { enabled: true, demo: true }),
      (url, init) => {
        if (url.pathname !== "/api/ai/summary" || init?.method !== "POST") return undefined;
        if (fail) return json({ detail: "AI summary unavailable: Can't reach the AI service" }, 503);
        return json({
          headline: "Peeling complaints are up this month",
          themes: [{ title: "Peeling", detail: "About 6 customers, mostly exterior walls.", sentiment: "negative" }],
          actions: ["Check the September batch"],
          days: 30,
          comments_used: 150,
          comments_total: 212,
          generated_at: "2026-10-23T08:00:00Z",
        });
      },
      adminData,
    );
    renderInShell(<FeedbackInbox start={{}} />);

    expect(await screen.findByRole("note")).toHaveTextContent(/Demo mode.*not real AI/);
    await user.click(screen.getByRole("button", { name: "What are customers saying?" }));
    expect(await screen.findByText("Peeling complaints are up this month")).toBeInTheDocument();
    expect(screen.getByText(/the latest 150 of 212 comments/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "AI Insights" }));
    expect(screen.getByText("Check the September batch")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Sentiment" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/Negative6 18%/);

    fail = true;
    await user.click(screen.getByRole("tab", { name: "Summary" }));
    await user.click(screen.getByRole("button", { name: "Summarise again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Can't reach the AI service.*data is safe/);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("Alerts", () => {
  it("resolves an alert and moves between open and resolved", async () => {
    const user = userEvent.setup({ delay: null });
    let resolved = false;
    const fetchMock = stubApi(
      loggedIn,
      (url, init) => {
        if (url.pathname === "/api/alerts/7" && init?.method === "PATCH") resolved = true;
        if (url.pathname === "/api/alerts" && resolved && url.searchParams.get("status") === "open") return json([]);
        return undefined;
      },
      adminData,
    );
    pathname = "/admin/alerts";
    renderInShell(<AlertsView />);

    const card = (await screen.findByRole("heading", { name: /Chebet Kiprop/ })).closest("li")!;
    expect(within(card).getByRole("link", { name: /chebet@example.com/ })).toHaveAttribute(
      "href",
      "mailto:chebet@example.com",
    );
    await user.click(within(card).getByRole("button", { name: "Resolved" }));

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/alerts/7");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: "resolved" });
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Chebet Kiprop/ })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Resolved" }));
    expect(await screen.findByText("Nothing resolved yet.")).toBeInTheDocument();
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

  it("warns when emails are only caught by Mailpit", async () => {
    stubApi((url) => (url.pathname === "/api/alerts/delivery" ? json({ email: "test", sms: "live" }) : undefined));
    render(<ReplyComposer alert={ALERT} aiEnabled={false} onSent={vi.fn()} onCancel={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole("note")).toHaveTextContent("this customer won't receive the reply");
  });

  it("shows no delivery warning when email is live", async () => {
    const fetchMock = stubApi((url) =>
      url.pathname === "/api/alerts/delivery" ? json({ email: "live", sms: "sandbox" }) : undefined,
    );
    render(<ReplyComposer alert={ALERT} aiEnabled={false} onSent={vi.fn()} onCancel={vi.fn()} onError={vi.fn()} />);

    await waitFor(() => expect(calledWith(fetchMock, (url) => url.pathname === "/api/alerts/delivery")).toBe(true));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("lets the rep write the reply themselves when the AI fails", async () => {
    stubApi(() => json({ detail: "AI draft unavailable" }, 503));
    render(<ReplyComposer alert={ALERT} aiEnabled onSent={vi.fn()} onCancel={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("write one yourself");
    expect(screen.getByLabelText(/Message to/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled();
  });
});

describe("Reports", () => {
  it("offers every trend value, including the projection, as a table", () => {
    render(<TrendChart daily={STATS.daily} projection={STATS.projection} />);

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(5); // header + 3 days + 1 projected day
    expect(rows[2]).toHaveTextContent("21 Oct––0 responses");
    expect(rows[4]).toHaveTextContent("23 Oct–4.40projected");
    expect(screen.getByRole("img")).toHaveAccessibleName(/latest 4.25 on 22 Oct.*Projected 4.4 by 23 Oct/);
  });

  it("says so when there is no data", () => {
    render(<TrendChart daily={[{ ...STATS.daily[1] }]} projection={[]} />);
    expect(screen.getByText("No feedback in this period yet.")).toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("shows managers the team, and the owner no password form", async () => {
    stubApi(loggedIn, adminData);
    renderInShell(<SettingsView />);
    const team = await screen.findByRole("region", { name: "Team" });
    expect(await within(team).findByText("Wanjiru Kamau")).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("gives care reps a password form and no team", async () => {
    stubApi(signedInAs(REP_ME), adminData);
    renderInShell(<SettingsView />);
    expect(await screen.findByLabelText("Current password")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Team" })).not.toBeInTheDocument();
  });

  it("never offers actions on the owner's row: the server refuses them", async () => {
    stubApi((url) =>
      url.pathname === "/api/staff"
        ? json([
            { ...MEMBER, id: 1, username: "admin", display_name: "admin", role: "manager", is_owner: true },
            MEMBER,
          ])
        : undefined,
    );
    render(<TeamPanel currentUsername="wanjiru" onError={vi.fn()} />);

    const ownerRow = (await screen.findByText("admin")).closest("li")!;
    expect(within(ownerRow).queryByRole("button")).not.toBeInTheDocument();
    expect(ownerRow).toHaveTextContent("Owner");
    const memberRow = screen.getByText("Wanjiru Kamau").closest("li")!;
    expect(within(memberRow).getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("adds a team member with a lowercase username", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi((url, init) => {
      if (url.pathname !== "/api/staff") return undefined;
      if (init?.method === "POST")
        return json({ ...MEMBER, id: 4, username: "amina", display_name: "Amina Otieno" }, 201);
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

  it("checks the two new passwords match", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = stubApi(() => json(REP_ME));
    render(<PasswordForm onError={vi.fn()} />);

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
  });
});
