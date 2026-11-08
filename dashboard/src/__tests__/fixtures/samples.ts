// The two sample runs, imported directly from runs/samples/ (never edited),
// plus small fixtures derived from them by targeted edits on deep copies.

import listenerJson from '../../../../runs/samples/listener-gave-up/run.json';
import bebeJson from '../../../../runs/samples/bebe-succeeded/run.json';
import { validateRun } from '../../data/validate';
import type { Run, RunMeta } from '../../data/types';

export type RunJson = typeof listenerJson;

export const LISTENER_META: RunMeta = {
  key: '2026-11-03-listener-pay-bill',
  folder: 'samples/listener-gave-up',
  origin: 'samples',
};
export const BEBE_META: RunMeta = {
  key: '2026-11-03-bebe-pay-bill',
  folder: 'samples/bebe-succeeded',
  origin: 'samples',
};

/** A fresh deep copy of the Listener sample JSON. */
export function listenerSample(): Record<string, unknown> {
  return structuredClone(listenerJson) as unknown as Record<string, unknown>;
}

/** A fresh deep copy of the Bebe sample JSON. */
export function bebeSample(): Record<string, unknown> {
  return structuredClone(bebeJson) as unknown as Record<string, unknown>;
}

/** Validates JSON and returns the Run, failing loudly if it is invalid. */
export function mustRun(json: unknown, meta: RunMeta): Run {
  const loaded = validateRun(json, meta);
  if (!loaded.ok) {
    throw new Error(`fixture is invalid: ${loaded.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  }
  return loaded.run;
}

export function listenerRun(): Run {
  return mustRun(listenerSample(), LISTENER_META);
}

export function bebeRun(): Run {
  return mustRun(bebeSample(), BEBE_META);
}

export function sampleRuns(): Run[] {
  return [listenerRun(), bebeRun()];
}
