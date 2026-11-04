/** "22 Oct, 14:05" in the viewer's own timezone. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const UNITS: [limit: number, size: number, unit: string][] = [
  [60, 1, "s"],
  [3600, 60, "m"],
  [86400, 3600, "h"],
  [604800, 86400, "d"],
];

/** "just now", "5m ago", "2h ago", "3d ago", then a plain date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  for (const [limit, size, unit] of UNITS) {
    if (seconds < limit) return `${Math.floor(seconds / size)}${unit} ago`;
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Chebet Kiprop" -> "CK", "admin" -> "AD". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
