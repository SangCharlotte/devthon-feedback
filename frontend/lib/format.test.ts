import { describe, expect, it } from "vitest";

import { initials, timeAgo } from "./format";

describe("timeAgo", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");

  it("reads like a chat app", () => {
    expect(timeAgo("2026-11-04T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-11-04T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-11-04T10:00:00Z", now)).toBe("2h ago");
    expect(timeAgo("2026-11-01T12:00:00Z", now)).toBe("3d ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toBe("1 Oct");
  });
});

it("takes initials from the first and last name", () => {
  expect(initials("Chebet Kiprop")).toBe("CK");
  expect(initials("Mary Wanjiru Otieno")).toBe("MO");
  expect(initials("admin")).toBe("AD");
  expect(initials("  ")).toBe("?");
});
