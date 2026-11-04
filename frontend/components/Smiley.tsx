import type { CSSProperties } from "react";

import type { Rating } from "@/lib/questions";

type Props = { rating: Rating; active?: boolean; className?: string };

/** A paint-swatch face. When `active` it reacts: the mouth exaggerates and the eyes change. */
export function Smiley({ rating, active = false, className }: Props) {
  const curve = (rating - 3) * (active ? 10 : 6); // negative frowns, positive smiles
  const mouth = `M20 ${42 - curve / 2} Q32 ${42 + curve} 44 ${42 - curve / 2}`;
  // Chrome animates the CSS `d` property; other browsers fall back to the attribute.
  const mouthStyle = { d: `path("${mouth}")` } as CSSProperties;
  const ink = "var(--face-ink)";

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" fill="var(--swatch)" />
      {active && rating >= 4 ? (
        <path d="M18 27q5-6 10 0M36 27q5-6 10 0" stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <circle cx="23" cy="26" r={active ? 4 : 3.5} fill={ink} />
          <circle cx="41" cy="26" r={active ? 4 : 3.5} fill={ink} />
        </>
      )}
      {active && rating <= 2 && (
        <path d="M17 20l9-3.5M47 20l-9-3.5" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      )}
      <path
        d={mouth}
        style={mouthStyle}
        fill="none"
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
