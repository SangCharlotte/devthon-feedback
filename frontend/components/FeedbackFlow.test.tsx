import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackFlow } from "./FeedbackFlow";

function mockApi(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

type User = ReturnType<typeof userEvent.setup>;

/** Tap one face per question; each tap auto-advances to the next screen. */
async function answerQuestions(user: User, ratings: [string, string, string]) {
  await user.click(screen.getByRole("radio", { name: ratings[0] }));
  await screen.findByRole("radiogroup", { name: "Rate our customer care" });
  await user.click(screen.getByRole("radio", { name: ratings[1] }));
  await screen.findByRole("radiogroup", { name: "Are you happy with the product?" });
  await user.click(screen.getByRole("radio", { name: ratings[2] }));
  await screen.findByRole("heading", { name: "Almost done!" });
}

async function fillDetails(user: User, email = "wanjiku@example.com") {
  await user.type(screen.getByLabelText("Your name"), "Wanjiku Kamau");
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Phone number"), "0712 345 678");
}

describe("FeedbackFlow", () => {
  it("walks through three questions and submits", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi(201, { id: 1, mean: 4.67, category: "promoter", alert_created: false });
    render(<FeedbackFlow />);

    expect(screen.getByText("Question 1 of 3")).toBeInTheDocument();
    await answerQuestions(user, ["Excellent", "Good", "Excellent"]);
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("heading", { name: "Thank you, Wanjiku!" })).toBeInTheDocument();
    expect(screen.getByText("You made our day!")).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(JSON.parse(init.body)).toEqual({
      name: "Wanjiku Kamau",
      email: "wanjiku@example.com",
      phone: "0712 345 678",
      q1: 5,
      q2: 4,
      q3: 5,
    });
  });

  it("tells a detractor the care team will be in touch", async () => {
    const user = userEvent.setup({ delay: null });
    mockApi(201, { id: 2, mean: 2.33, category: "detractor", alert_created: true });
    render(<FeedbackFlow />);

    await answerQuestions(user, ["Poor", "Okay", "Poor"]);
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("We're sorry we let you down")).toBeInTheDocument();
    expect(screen.getByText(/customer care team will contact you/)).toBeInTheDocument();
  });

  it("blocks submission and explains invalid details", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = mockApi(201, {});
    render(<FeedbackFlow />);

    await answerQuestions(user, ["Good", "Good", "Good"]);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(screen.getByText("Please tell us your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows server-side validation errors next to the right field", async () => {
    const user = userEvent.setup({ delay: null });
    mockApi(422, {
      detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }],
    });
    render(<FeedbackFlow />);

    await answerQuestions(user, ["Good", "Good", "Good"]);
    await fillDetails(user, "someone@nowhere.invalid");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Value is not a valid email address")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted fields.");
  });

  it("keeps the answers when the network fails, so the customer can retry", async () => {
    const user = userEvent.setup({ delay: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<FeedbackFlow />);

    await answerQuestions(user, ["Good", "Good", "Good"]);
    await fillDetails(user);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't reach our servers");
    expect(screen.getByLabelText("Your name")).toHaveValue("Wanjiku Kamau");
  });

  it("lets the customer go back and change an answer", async () => {
    const user = userEvent.setup({ delay: null });
    render(<FeedbackFlow />);

    await user.click(screen.getByRole("radio", { name: "Poor" }));
    await screen.findByText("Question 2 of 3");
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("radio", { name: "Poor" })).toBeChecked();
  });
});
