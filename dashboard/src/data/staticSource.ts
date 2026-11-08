// Static Run_Source: reads files written by the Collect_Step into public/runs/.
// Each file is fetched at most once per page load.

import { resolveScreenshotUrl } from './screenshots';
import type { RunSource } from './source';
import type { InvalidRun, LoadedRun, Run, RunIndex, RunIndexEntry } from './types';
import { validateRun } from './validate';

export interface StaticSourceOptions {
  /** Vite's BASE_URL, for example "./" in a build or "/" in dev. */
  base: string;
  fetchImpl?: typeof fetch;
}

export class RunIndexError extends Error {}

function isIndex(value: unknown): value is RunIndex {
  if (typeof value !== 'object' || value === null) return false;
  const entries = (value as { entries?: unknown }).entries;
  return (
    Array.isArray(entries) &&
    entries.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as RunIndexEntry).key === 'string' &&
        typeof (e as RunIndexEntry).folder === 'string' &&
        Array.isArray((e as RunIndexEntry).errors),
    )
  );
}

export function createStaticRunSource(options: StaticSourceOptions): RunSource {
  const base = options.base.endsWith('/') ? options.base : `${options.base}/`;
  const doFetch = (url: string) => (options.fetchImpl ?? fetch)(url);
  let indexPromise: Promise<RunIndex> | null = null;
  const runCache = new Map<string, Promise<LoadedRun>>();

  async function fetchIndex(): Promise<RunIndex> {
    let response: Response;
    try {
      response = await doFetch(`${base}runs/index.json`);
    } catch {
      throw new RunIndexError('Could not read runs/index.json (network error)');
    }
    if (!response.ok) throw new RunIndexError(`Could not read runs/index.json (HTTP ${response.status})`);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new RunIndexError('runs/index.json is not valid JSON');
    }
    if (!isIndex(json)) throw new RunIndexError('runs/index.json is not in the expected shape');
    return json;
  }

  async function fetchRun(entry: RunIndexEntry): Promise<LoadedRun> {
    const invalid = (message: string): InvalidRun => ({
      ok: false,
      key: entry.key,
      folder: entry.folder,
      errors: [{ path: '(file)', message }],
    });
    if (entry.errors.length > 0) {
      return { ok: false, key: entry.key, folder: entry.folder, errors: entry.errors };
    }
    const folder = entry.folder.split('/').map(encodeURIComponent).join('/');
    let response: Response;
    try {
      response = await doFetch(`${base}runs/${folder}/run.json`);
    } catch {
      return invalid('Could not read run.json (network error)');
    }
    if (!response.ok) return invalid(`Could not read run.json (HTTP ${response.status})`);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return invalid('run.json is not valid JSON');
    }
    return validateRun(json, { key: entry.key, folder: entry.folder, origin: entry.origin });
  }

  return {
    listRuns() {
      if (!indexPromise) indexPromise = fetchIndex();
      return indexPromise;
    },
    loadRun(entry) {
      let cached = runCache.get(entry.key);
      if (!cached) {
        cached = fetchRun(entry);
        runCache.set(entry.key, cached);
      }
      return cached;
    },
    screenshotUrl(run: Run, path: string) {
      return resolveScreenshotUrl(base, run.folder, path);
    },
  };
}
