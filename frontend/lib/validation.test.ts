import { describe, expect, it } from "vitest";

import { normalizePhone, validateDetails } from "./validation";

describe("normalizePhone", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["0712 345 678", "+254712345678"],
    ["+254 712-345-678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["00254712345678", "+254712345678"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["", "12", "07123abc78", "+1234567890123456"])("rejects %j", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("validateDetails", () => {
  const valid = {
    segment: "homeowner",
    name: "Wanjiku",
    email: "w@example.com",
    phone: "0712345678",
    comment: "",
  } as const;

  it("accepts valid details", () => {
    expect(validateDetails(valid)).toEqual({});
  });

  it("flags every invalid field", () => {
    const errors = validateDetails({ segment: null, name: "  ", email: "nope", phone: "12", comment: "" });
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "phone", "segment"]);
  });

  it("requires a homeowner or painter choice", () => {
    expect(validateDetails({ ...valid, segment: null }).segment).toBe("Please choose homeowner or painter");
    expect(validateDetails({ ...valid, segment: "painter" })).toEqual({});
  });

  it("limits comment length", () => {
    expect(validateDetails({ ...valid, comment: "x".repeat(1001) }).comment).toBeDefined();
  });
});
