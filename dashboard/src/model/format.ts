// Small formatting helpers shared by models and screens.

/** Milliseconds as seconds with one decimal, for example 1200 → "1.2 s". */
export function formatSeconds(ms: number): string {
  const tenths = Math.round(ms / 100) / 10;
  return `${tenths.toFixed(1)} s`;
}

/** Date in the reader's time zone, for example "3 Nov 2026". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/** Date and time in the reader's time zone, for example "3 Nov 2026, 14:22". */
export function formatLocalDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Newest first. */
export function byStartedAtDesc<T extends { startedAt: string }>(a: T, b: T): number {
  return Date.parse(b.startedAt) - Date.parse(a.startedAt);
}
