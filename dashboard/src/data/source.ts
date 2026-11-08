// The Run_Source interface and the one place a source is chosen.
// A later LiveRunSource implements the same interface; no screen changes.

import { createStaticRunSource } from './staticSource';
import type { LoadedRun, Run, RunIndex, RunIndexEntry } from './types';

export interface RunSource {
  /** Loads the Run_Index. Rejects when the index cannot be read. */
  listRuns(): Promise<RunIndex>;
  /** Loads and validates one run. Never rejects: failures become `ok: false`. */
  loadRun(entry: RunIndexEntry): Promise<LoadedRun>;
  /** URL for a screenshot path of the run, or null when the path is unsafe. */
  screenshotUrl(run: Run, path: string): string | null;
}

let selected: RunSource | null = null;

/** The only place the Dashboard decides where runs come from. */
export function selectRunSource(): RunSource {
  if (!selected) selected = createStaticRunSource({ base: import.meta.env.BASE_URL });
  return selected;
}
