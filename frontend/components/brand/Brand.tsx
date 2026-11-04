import type { CSSProperties } from "react";

/** The Company X mark: two crossed brush strokes, warm over green. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="cx-warm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4b740" />
          <stop offset="1" stopColor="#ef6a2f" />
        </linearGradient>
        <linearGradient id="cx-green" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6cc06a" />
          <stop offset="1" stopColor="#1f6b3a" />
        </linearGradient>
      </defs>
      <path d="M31 6c2 1 3 3 2 5L14 34c-2 2-5 1-6-1s0-3 1-4L27 7c1-1 3-2 4-1z" fill="url(#cx-green)" />
      <path d="M7 8c1-2 4-3 6-1l20 22c2 2 1 5-1 6s-4 0-5-1L7 12c-1-1-1-3 0-4z" fill="url(#cx-warm)" />
    </svg>
  );
}

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
      <LogoMark size={size} />
      <span style={{ fontSize: size * 0.56, letterSpacing: "-0.02em" }}>Company X</span>
    </span>
  );
}

const STROKES = {
  warm: ["#f4b740", "#ef8a2f", "#e5672c"],
  green: ["#8fd17f", "#3f9a52", "#1f6b3a"],
  sunset: ["#ef6a2f", "#f4b740", "#3f9a52"],
} as const;

/**
 * A dry-brush paint swash. Purely decorative: position it with `className` / `style`.
 * `tone` picks the paint; the three bands give it a hand-painted, streaky edge.
 */
export function BrushStroke({
  tone = "sunset",
  className,
  style,
}: {
  tone?: keyof typeof STROKES;
  className?: string;
  style?: CSSProperties;
}) {
  const [a, b, c] = STROKES[tone];
  return (
    <svg className={className} style={style} viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M6 86C60 60 140 40 214 30c40-5 74-6 100-4-30 10-70 22-120 36C130 80 70 96 20 104z" fill={a} opacity="0.92" />
      <path d="M18 98c60-26 140-46 210-56 34-5 62-6 84-4-34 12-82 26-140 42-50 14-100 24-150 26z" fill={b} opacity="0.88" />
      <path d="M40 108c56-20 120-34 180-42 30-4 56-4 76-2-30 10-70 20-118 32-46 10-94 16-138 12z" fill={c} opacity="0.8" />
      <path d="M30 92c80-30 170-48 260-56M50 100c70-20 150-36 230-44" stroke="var(--surface)" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/** A paint tin with the Company X mark on its label. */
export function PaintCan({ size = 96, paint = "#ef8a2f" }: { size?: number; paint?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <ellipse cx="50" cy="92" rx="34" ry="5" fill="#000" opacity="0.12" />
      <path d="M18 30h64v52c0 6-14 10-32 10S18 88 18 82z" fill="#f3f1ec" />
      <path d="M18 30h64v52c0 6-14 10-32 10S18 88 18 82z" fill="url(#can-shade)" />
      <ellipse cx="50" cy="30" rx="32" ry="8" fill="#d9d5cc" />
      <ellipse cx="50" cy="30" rx="27" ry="6" fill={paint} />
      <path d="M30 30c4 8 2 14 6 18 3 3 6-2 6-6" stroke={paint} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M20 22c10-14 50-14 60 0" stroke="#9b978e" strokeWidth="2.5" fill="none" />
      <g transform="translate(36 52) scale(0.7)">
        <LogoPaths />
      </g>
      <defs>
        <linearGradient id="can-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.08" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoPaths() {
  return (
    <>
      <path d="M31 6c2 1 3 3 2 5L14 34c-2 2-5 1-6-1s0-3 1-4L27 7c1-1 3-2 4-1z" fill="#2f8f4e" />
      <path d="M7 8c1-2 4-3 6-1l20 22c2 2 1 5-1 6s-4 0-5-1L7 12c-1-1-1-3 0-4z" fill="#ef8a2f" />
    </>
  );
}
