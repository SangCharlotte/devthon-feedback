import { describe, expect, it } from "vitest";

import { donutArcs, linearScale, linePath, percent, shortDate, tickIndexes } from "./chart";

describe("linearScale", () => {
  it("maps scores onto an upside-down pixel axis", () => {
    const y = linearScale([1, 5], [200, 0]);
    expect(y(1)).toBe(200);
    expect(y(3)).toBe(100);
    expect(y(5)).toBe(0);
  });
});

describe("linePath", () => {
  it("lifts the pen over missing days", () => {
    const path = linePath([{ x: 0, y: 10 }, { x: 5, y: 20 }, null, { x: 15, y: 5 }, { x: 20, y: 0 }]);
    expect(path).toBe("M0,10L5,20M15,5L20,0");
  });

  it("is empty when there is no data", () => {
    expect(linePath([null, null])).toBe("");
  });
});

describe("tickIndexes", () => {
  it("spreads ticks and keeps both ends", () => {
    expect(tickIndexes(30, 4)).toEqual([0, 10, 19, 29]);
    expect(tickIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(tickIndexes(0, 5)).toEqual([]);
  });
});

describe("donutArcs", () => {
  it("draws one segment per non-zero value", () => {
    const arcs = donutArcs([1, 0, 3], { radius: 50, thickness: 12 });
    expect(arcs[0]).toMatch(/^M/);
    expect(arcs[1]).toBeNull();
    expect(arcs[2]).toMatch(/^M/);
  });

  it("uses the large-arc flag for segments over half the ring", () => {
    const [small, big] = donutArcs([1, 3], { radius: 50, thickness: 12 });
    expect(small).toContain(" 0 0 1 ");
    expect(big).toContain(" 0 1 1 ");
  });

  it("draws a full ring when one category is everything", () => {
    const arcs = donutArcs([0, 0, 7], { radius: 50, thickness: 12 });
    expect(arcs[2]).toContain("Z M");
  });

  it("draws nothing without data", () => {
    expect(donutArcs([0, 0, 0], { radius: 50, thickness: 12 })).toEqual([null, null, null]);
  });
});

it("formats calendar dates without timezone drift", () => {
  expect(shortDate("2026-10-22")).toBe("22 Oct");
});

it("formats percentages", () => {
  expect(percent(1, 3)).toBe("33%");
  expect(percent(0, 0)).toBe("0%");
});
