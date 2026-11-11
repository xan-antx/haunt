/*
 * Money amounts in rendered text, for the `dark_pattern` Detector (Requirement 19.3; design "Bebe /
 * Detectors / dark_pattern").
 *
 * Recognised: an amount written after `₹`, `Rs`, `Rs.`, `INR`, `$`, `€` or `£` (one optional space in
 * between), with Indian grouping (`1,00,000`, `12,34,567.50`), Western grouping (`2,490.00`,
 * `1,234,567`) or no grouping (`2490`), and at most two decimals. A number that runs on into more
 * digits (`₹2,490.005`, `₹1,234,5678`) is not an amount. Digits are ASCII digits, which is how Lantern
 * Bills writes amounts in every language.
 *
 * Everything here is pure. `AMOUNT_PATTERN_SOURCE` is also handed to the Detector's page-side script,
 * so the page and the engine agree on what an amount is; the numbers are always worked out here.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';

/** One amount found in a text. */
export interface Amount {
  currency: Currency;
  /** The value in hundredths (paise, cents, pence): `₹2,490.00` is 249000. */
  minor: number;
  /** The amount as written, for example `₹2,490.00` or `Rs. 99`. */
  text: string;
  /** Where `text` starts in the searched string. */
  index: number;
}

const CURRENCY_SOURCE = String.raw`(₹|\bRs\.?|\bINR|\$|€|£)[ \u00a0]?`;
const NUMBER_SOURCE =
  String.raw`(\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.(\d{1,2}))?(?!\d|[.,]\d)`;

/** Regular expression source of one amount (use with the `g` flag). Group 1: currency, 2: whole part, 3: decimals. */
export const AMOUNT_PATTERN_SOURCE = CURRENCY_SOURCE + NUMBER_SOURCE;

function currencyOf(symbol: string): Currency {
  if (symbol === '$') return 'USD';
  if (symbol === '€') return 'EUR';
  if (symbol === '£') return 'GBP';
  return 'INR';
}

/** Every amount in `text`, in order. */
export function findAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  const re = new RegExp(AMOUNT_PATTERN_SOURCE, 'g');
  for (const m of text.matchAll(re)) {
    const whole = Number(m[2]!.replace(/,/g, ''));
    const decimals = m[3] === undefined ? 0 : Number(m[3].padEnd(2, '0'));
    if (!Number.isSafeInteger(whole * 100 + decimals)) continue;
    out.push({ currency: currencyOf(m[1]!), minor: whole * 100 + decimals, text: m[0], index: m.index });
  }
  return out;
}

/**
 * The bill amount of a page: the amount (same currency and value) that the text shows most often, and
 * the earliest of them when several are shown equally often. A page can show a smaller figure first,
 * such as a banner's "Up to ₹150 a month", while the bill is repeated in its details and its summary.
 * Returns the first occurrence of that amount, or `null` when the text has no amount.
 */
export function billAmount(text: string): Amount | null {
  const counts = new Map<string, { amount: Amount; count: number }>();
  for (const a of findAmounts(text)) {
    const id = `${a.currency}:${a.minor}`;
    const seen = counts.get(id);
    if (seen) seen.count += 1;
    else counts.set(id, { amount: a, count: 1 });
  }
  let best: { amount: Amount; count: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return best?.amount ?? null;
}

/** The first amount in `text`, or `null`. */
export function firstAmount(text: string): Amount | null {
  return findAmounts(text)[0] ?? null;
}

const SYMBOL: Record<Currency, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/** Groups the digits of a whole number: Indian (`1,00,000`) for rupees, Western (`100,000`) otherwise. */
function groupDigits(digits: string, indian: boolean): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const groups: string[] = [];
  for (let end = rest.length; end > 0; end -= size) groups.unshift(rest.slice(Math.max(0, end - size), end));
  return `${groups.join(',')},${last3}`;
}

/** Writes an amount with its symbol and two decimals, for example `₹2,589.00` or `₹1,00,000.50`. */
export function formatAmount(currency: Currency, minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minor));
  const whole = groupDigits(String(Math.floor(abs / 100)), currency === 'INR');
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${SYMBOL[currency]}${whole}.${cents}`;
}
