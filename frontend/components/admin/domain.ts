import type { Category } from "@/lib/api";
import type { Segment, Sentiment } from "@/lib/admin";

export const CATEGORIES: readonly { id: Category; label: string; one: string; rule: string; color: string }[] = [
  { id: "detractor", label: "Detractors", one: "Detractor", rule: "average below 3", color: "var(--cat-detractor)" },
  { id: "passive", label: "Passives", one: "Passive", rule: "average exactly 3", color: "var(--cat-passive)" },
  { id: "promoter", label: "Promoters", one: "Promoter", rule: "average above 3", color: "var(--cat-promoter)" },
];

export const SENTIMENTS: readonly { id: Sentiment; label: string; color: string }[] = [
  { id: "positive", label: "Positive", color: "var(--cat-promoter)" },
  { id: "neutral", label: "Neutral", color: "var(--muted)" },
  { id: "mixed", label: "Mixed", color: "var(--cat-passive)" },
  { id: "negative", label: "Negative", color: "var(--cat-detractor)" },
];

export const SEGMENTS: readonly { id: Segment; label: string; one: string; color: string }[] = [
  { id: "homeowner", label: "Homeowners", one: "Homeowner", color: "var(--seg-homeowner)" },
  { id: "painter", label: "Painters", one: "Painter", color: "var(--seg-painter)" },
];

export const segmentLabel = (id: Segment) => SEGMENTS.find((s) => s.id === id)!.one;
