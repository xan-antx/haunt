import { validateRecord, type GhostEntry, type PatrolRecord } from '../../src/record.ts';

export const API_BASE = '/apps/haunt-patrol/api';

export function badgeLabel(result: GhostEntry['result']): string {
  switch (result) {
    case 'succeeded':
      return 'Succeeded';
    case 'gave_up':
      return 'Gave up';
    case 'error':
      return 'Error';
    case 'no_run':
      return 'No run';
  }
}

/** A leading symbol so colour is never the only signal. */
export function badgeSymbol(result: GhostEntry['result']): string {
  switch (result) {
    case 'succeeded':
      return '✓';
    case 'gave_up':
      return '⚠';
    case 'error':
      return '✕';
    case 'no_run':
      return '–';
  }
}

export function countsText(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([type, n]) => `${type} ${n}`);
  return parts.length === 0 ? 'No findings' : parts.join(', ');
}

export type PatrolView =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; record: PatrolRecord; summary: string; dashboardBaseUrl: string };

/** Reads one data source. It rejects with an error that carries a numeric `status` for an HTTP failure. */
export type Getter = (path: string) => Promise<unknown>;

export function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const e = error as { status?: unknown; response?: { status?: unknown } };
    if (typeof e.status === 'number') return e.status;
    if (typeof e.response?.status === 'number') return e.response.status;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Source = { kind: 'ok'; latest: unknown; summary: unknown } | { kind: 'empty' } | { kind: 'failed' };

/** A 404 from the latest file means "no patrol yet". Any other failure of either call is `failed`. */
async function readSource(get: Getter, latestPath: string, summaryPath: string): Promise<Source> {
  let latest: unknown;
  try {
    latest = await get(latestPath);
  } catch (error) {
    return statusOf(error) === 404 ? { kind: 'empty' } : { kind: 'failed' };
  }
  try {
    return { kind: 'ok', latest, summary: await get(summaryPath) };
  } catch {
    return { kind: 'failed' };
  }
}

function toView(latest: unknown, summary: unknown): PatrolView {
  if (!isObject(latest) || typeof latest.dashboardBaseUrl !== 'string') {
    return { kind: 'error', message: 'The file latest.json could not be read as a patrol.' };
  }
  const checked = validateRecord(latest.record);
  if (!checked.ok) return { kind: 'error', message: `The file latest.json is not a valid patrol record. ${checked.error}` };
  const text = isObject(summary) && typeof summary.summary === 'string' ? summary.summary : '';
  return { kind: 'ready', record: checked.record, summary: text, dashboardBaseUrl: latest.dashboardBaseUrl };
}

/**
 * Loads the latest patrol. It asks the backend routes first. A 404 from /latest means no patrol yet.
 * Any other failure falls back to the static files, which have the same bodies and need no signing.
 */
export async function loadPatrol(api: Getter, staticFiles: Getter): Promise<PatrolView> {
  const live = await readSource(api, `${API_BASE}/latest`, `${API_BASE}/summary`);
  if (live.kind === 'ok') return toView(live.latest, live.summary);
  if (live.kind === 'empty') return { kind: 'empty' };

  const fallback = await readSource(staticFiles, 'data/latest.json', 'data/summary.json');
  if (fallback.kind === 'ok') return toView(fallback.latest, fallback.summary);
  if (fallback.kind === 'empty') return { kind: 'empty' };
  return { kind: 'error', message: 'The latest patrol could not be loaded.' };
}
