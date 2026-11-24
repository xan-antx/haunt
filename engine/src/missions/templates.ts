const FUTURE_EXPIRY = '{{futureExpiry}}';
const RUN_STAMP = '{{runStamp}}';

/**
 * The month two years after the month of `start`, in UTC, as `MM/YY`.
 * November 2026 gives `11/28`; December 2026 gives `12/28`.
 */
export function futureExpiry(start: Date): string {
  const month = String(start.getUTCMonth() + 1).padStart(2, '0');
  const year = String((start.getUTCFullYear() + 2) % 100).padStart(2, '0');
  return `${month}/${year}`;
}

/** The start time in UTC as `YYYYMMDD-HHmmss`. */
export function runStamp(start: Date): string {
  const p = (n: number, width = 2): string => String(n).padStart(width, '0');
  return (
    `${p(start.getUTCFullYear(), 4)}${p(start.getUTCMonth() + 1)}${p(start.getUTCDate())}` +
    `-${p(start.getUTCHours())}${p(start.getUTCMinutes())}${p(start.getUTCSeconds())}`
  );
}

/** Replaces every `{{futureExpiry}}` and `{{runStamp}}` in `value` using the Run's start date. */
export function applyTemplates(value: string, start: Date): string {
  let out = value;
  if (out.includes(FUTURE_EXPIRY)) out = out.split(FUTURE_EXPIRY).join(futureExpiry(start));
  if (out.includes(RUN_STAMP)) out = out.split(RUN_STAMP).join(runStamp(start));
  return out;
}
