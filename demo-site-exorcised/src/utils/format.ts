import type { TFunction } from 'i18next';

/*
 * Dates are written with month names and patterns from the translation files, not Intl.DateTimeFormat:
 * browsers ship with different locale data, and some (Chromium among them) have no Punjabi month names,
 * so Intl would print "2026 M10" there. Every language uses the Indian order: day, month, year.
 */

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

interface CalendarDate {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
}

/** Splits an ISO calendar date (YYYY-MM-DD). No Date object, so no time zone can shift it. */
function parse(iso: string): CalendarDate {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return { year, month, day };
}

function monthKey(month: number): string {
  return MONTH_KEYS[month - 1] ?? 'jan';
}

/** "15 November 2026", "15 ਨਵੰਬਰ 2026", "15 नवंबर 2026". */
export function formatLongDate(t: TFunction, iso: string): string {
  const { year, month, day } = parse(iso);
  return t('dates.dayMonthYear', { day, month: t(`months.${monthKey(month)}`), year });
}

/** "October 2026". */
export function formatMonthYear(t: TFunction, iso: string): string {
  const { year, month } = parse(iso);
  return t('dates.monthYear', { month: t(`months.${monthKey(month)}`), year });
}

/** "Oct". */
export function formatShortMonth(t: TFunction, iso: string): string {
  return t(`monthsShort.${monthKey(parse(iso).month)}`);
}

/** "1–31 October 2026" within one month, otherwise "1 October 2026 – 15 November 2026". */
export function formatDateRange(t: TFunction, startIso: string, endIso: string): string {
  const start = parse(startIso);
  const end = parse(endIso);
  if (start.year === end.year && start.month === end.month) {
    return t('dates.dayRange', {
      startDay: start.day,
      endDay: end.day,
      month: t(`months.${monthKey(end.month)}`),
      year: end.year,
    });
  }
  return `${formatLongDate(t, startIso)} – ${formatLongDate(t, endIso)}`;
}

const numberFormatter = new Intl.NumberFormat('en-IN');

/** Western digits with Indian grouping (1,23,456), as used on Indian bills in all three languages. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
