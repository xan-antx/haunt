const FUTURE_EXPIRY = '{{futureExpiry}}';

/**
 * The month two years after the month of `start`, in UTC, as `MM/YY`.
 * November 2026 gives `11/28`; December 2026 gives `12/28`.
 */
export function futureExpiry(start: Date): string {
  const month = String(start.getUTCMonth() + 1).padStart(2, '0');
  const year = String((start.getUTCFullYear() + 2) % 100).padStart(2, '0');
  return `${month}/${year}`;
}

/** Replaces every `{{futureExpiry}}` in `value` using the Run's start date. */
export function applyTemplates(value: string, start: Date): string {
  if (!value.includes(FUTURE_EXPIRY)) return value;
  return value.split(FUTURE_EXPIRY).join(futureExpiry(start));
}
