/** Small, dependency-free chart maths: scales, line paths with gaps, donut arcs. */

export type Point = { x: number; y: number };

/** Map a value from a data domain onto pixels, e.g. score 1..5 -> y 200..0. */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]): (value: number) => number {
  const ratio = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * ratio;
}

/**
 * SVG path through the points, lifting the pen at every null.
 * Days nobody answered become a visible gap instead of a fake straight line.
 */
export function linePath(points: (Point | null)[]): string {
  let d = "";
  let penDown = false;
  for (const point of points) {
    if (point === null) {
      penDown = false;
      continue;
    }
    d += `${penDown ? "L" : "M"}${round(point.x)},${round(point.y)}`;
    penDown = true;
  }
  return d;
}

/**
 * Like linePath, but each run of points is a monotone cubic curve (the
 * Fritsch–Carlson method): smooth, yet it never overshoots a data point, so a
 * share line can't bulge past 100% or dip below 0%.
 */
export function smoothPath(points: (Point | null)[]): string {
  const runs: Point[][] = [[]];
  for (const point of points) {
    if (point === null) runs.push([]);
    else runs[runs.length - 1].push(point);
  }
  return runs.map(monotoneRun).join("");
}

function monotoneRun(run: Point[]): string {
  if (run.length === 0) return "";
  const start = `M${round(run[0].x)},${round(run[0].y)}`;
  if (run.length === 1) return start;
  const slopes = run.slice(1).map((p, i) => (p.y - run[i].y) / (p.x - run[i].x || 1));
  const tangents = run.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === run.length - 1) return slopes[i - 1];
    const [a, b] = [slopes[i - 1], slopes[i]];
    if (a * b <= 0) return 0; // a peak or valley: flat tangent, no overshoot
    const [dxA, dxB] = [run[i].x - run[i - 1].x, run[i + 1].x - run[i].x];
    return (3 * (dxA + dxB)) / ((2 * dxB + dxA) / a + (dxB + 2 * dxA) / b);
  });
  let d = start;
  for (let i = 0; i < run.length - 1; i++) {
    const [p, q] = [run[i], run[i + 1]];
    const third = (q.x - p.x) / 3;
    d +=
      `C${round(p.x + third)},${round(p.y + tangents[i] * third)} ` +
      `${round(q.x - third)},${round(q.y - tangents[i + 1] * third)} ${round(q.x)},${round(q.y)}`;
  }
  return d;
}

/** Indexes of ~count evenly spaced ticks, always including the first and last. */
export function tickIndexes(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const step = (length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

/**
 * Donut segments as annulus paths. A small angular gap between segments lets
 * the card's surface show through, so neighbours read as separate pieces.
 */
export function donutArcs(
  values: number[],
  { radius, thickness, gapPx = 2 }: { radius: number; thickness: number; gapPx?: number },
): (string | null)[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  const visible = values.filter((v) => v > 0).length;
  if (total === 0) return values.map(() => null);
  if (visible === 1) {
    // One category is 100%: a full ring (an arc can't start and end at the same point).
    const inner = radius - thickness;
    const ring = `M${radius},0A${radius},${radius} 0 1 1 ${-radius},0A${radius},${radius} 0 1 1 ${radius},0Z M${inner},0A${inner},${inner} 0 1 0 ${-inner},0A${inner},${inner} 0 1 0 ${inner},0Z`;
    return values.map((v) => (v > 0 ? ring : null));
  }

  const gap = gapPx / radius; // radians that span gapPx at the outer edge
  let angle = -Math.PI / 2; // start at 12 o'clock
  return values.map((value) => {
    if (value === 0) return null;
    const sweep = (value / total) * Math.PI * 2;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    angle += sweep;
    return annulus(radius, radius - thickness, start, Math.max(start, end));
  });
}

function annulus(outer: number, inner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${round(r * Math.cos(a))},${round(r * Math.sin(a))}`;
  return (
    `M${p(outer, start)}A${outer},${outer} 0 ${large} 1 ${p(outer, end)}` +
    `L${p(inner, end)}A${inner},${inner} 0 ${large} 0 ${p(inner, start)}Z`
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "2026-10-22" -> "22 Oct". Dates are calendar days, so format them in UTC to avoid shifting. */
export function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function percent(part: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}
