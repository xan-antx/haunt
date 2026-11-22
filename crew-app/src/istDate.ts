/** "YYYY-MM-DD" for the given instant in Asia/Kolkata. */
export function istDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 20261103 for "2026-11-03". The same seed is passed to all three ghosts. */
export function seedForDate(date: string): number {
  return Number(date.replaceAll('-', ''));
}
