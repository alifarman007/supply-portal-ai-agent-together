export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/**
 * The demo data set is anchored to a fixed date, so deadline countdowns are
 * measured against it rather than the wall clock — otherwise every open tender
 * would read as already expired.
 */
export const DEMO_NOW = new Date("2026-06-30T10:00:00+06:00");

/** Whole days from `ref` until `iso`; negative once the date has passed. */
export function daysUntil(iso: string | Date, ref: Date = DEMO_NOW): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Math.ceil((d.getTime() - ref.getTime()) / 86_400_000);
}

export function relativeTime(iso: string | Date, ref: Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = ref.getTime() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
