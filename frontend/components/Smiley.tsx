import type { Rating } from "@/lib/questions";

/** A paint-swatch face whose mouth curves from a frown (1) to a big smile (5). */
export function Smiley({ rating, className }: { rating: Rating; className?: string }) {
  const curve = (rating - 3) * 7; // -14 (frown) ... 0 (flat) ... +14 (smile)
  const mouth = `M20 ${42 - curve / 2} Q32 ${42 + curve} 44 ${42 - curve / 2}`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="28" fill="var(--swatch)" />
      <circle cx="23" cy="26" r="3.5" fill="var(--face-ink)" />
      <circle cx="41" cy="26" r="3.5" fill="var(--face-ink)" />
      <path
        d={mouth}
        fill="none"
        stroke="var(--face-ink)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
