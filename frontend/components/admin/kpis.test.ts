import { describe, expect, it } from "vitest";

import { parseStats } from "@/lib/admin";

import { kpis, sentimentShares, topicTone } from "./kpis";
import { STATS } from "./testing";

describe("sentimentShares", () => {
  it("leaves a gap on days nobody answered", () => {
    const { positive, negative } = sentimentShares(STATS.daily);
    expect(positive).toEqual([(2 / 3) * 100, null, 75]);
    expect(negative[1]).toBeNull();
  });

  it("pools a trailing window so one response can't swing the line", () => {
    const { positive } = sentimentShares(STATS.daily, 7);
    expect(positive).toEqual([(2 / 3) * 100, (2 / 3) * 100, (5 / 7) * 100]);
  });
});

it("colours a theme by how many of its comments are negative", () => {
  expect(topicTone({ topic: "coverage", count: 10, negative: 1 })).toBe("positive");
  expect(topicTone({ topic: "delivery", count: 10, negative: 3 })).toBe("mixed");
  expect(topicTone({ topic: "peeling", count: 10, negative: 8 })).toBe("negative");
});

it("shows no change rather than a misleading arrow for a tiny move", () => {
  const rating = kpis({ ...STATS, average_score: 3.66 })[0];
  expect(rating.delta).toEqual({ text: "No change", trend: "flat", good: true });
});

it("fills fields an older backend doesn't send", () => {
  const { segments, topics, tagged_comments, questions, previous, ...old } = STATS;
  void [segments, topics, tagged_comments, questions, previous];
  const parsed = parseStats({ ...old, daily: [{ date: "2026-10-22", responses: 2, average: 4 }] });
  expect(parsed.topics).toEqual([]);
  expect(parsed.previous).toBeNull();
  expect(parsed.daily[0]).toMatchObject({ detractor: 0, passive: 0, promoter: 0 });
  expect(kpis(parsed).every((k) => k.delta === null)).toBe(true);
});
