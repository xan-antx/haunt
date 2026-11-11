// The first real Listener run, from the fixed copy in fixtures/runs/ (never edited), so the tests
// don't change when new real runs are added to runs/.

import realListenerJson from '../../../fixtures/runs/lantern-bills/2026-11-10T1822Z-listener-pay-bill/run.json';
import type { Run, RunMeta } from '../../data/types';
import { mustRun } from './samples';

export const REAL_LISTENER_META: RunMeta = {
  key: '2026-11-10T1822Z-listener-pay-bill',
  folder: 'lantern-bills/2026-11-10T1822Z-listener-pay-bill',
  origin: 'runs',
};

/** A fresh deep copy of the real Listener run JSON. */
export function realListenerSample(): Record<string, unknown> {
  return structuredClone(realListenerJson) as unknown as Record<string, unknown>;
}

export function realListenerRun(): Run {
  return mustRun(realListenerSample(), REAL_LISTENER_META);
}
