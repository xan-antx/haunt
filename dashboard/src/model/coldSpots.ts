// Rooms (distinct pages) and Cold_Spots (places a ghost got stuck) for the Haunted Map.

import type { GhostId, Run } from '../data/types';
import { GHOST_ORDER } from './ghosts';

export type ColdSpotReason = 'finding' | 'gave_up' | 'error';

export interface ColdSpot {
  runKey: string;
  ghost: GhostId;
  step: number;
  waitMs: number;
  /** The last step of a gave_up or error run wins over a finding on the same step. */
  reason: ColdSpotReason;
}

export interface Room {
  page: string;
  /** Ghosts that entered this page, in ghost order. */
  ghosts: GhostId[];
  coldSpots: ColdSpot[];
}

/** Cold spots of one run: steps with a finding, and the last step of a gave_up or error run. One per step. */
export function runColdSpots(run: Run): ColdSpot[] {
  const byStep = new Map<number, ColdSpot>();
  const stepOf = new Map(run.steps.map((s) => [s.n, s]));
  for (const finding of run.findings) {
    const step = stepOf.get(finding.step);
    if (!step || byStep.has(step.n)) continue;
    byStep.set(step.n, { runKey: run.key, ghost: run.ghost, step: step.n, waitMs: step.waitMs, reason: 'finding' });
  }
  const last = run.steps[run.steps.length - 1];
  if (last && (run.result === 'gave_up' || run.result === 'error')) {
    byStep.set(last.n, { runKey: run.key, ghost: run.ghost, step: last.n, waitMs: last.waitMs, reason: run.result });
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

/** One Room per distinct page, ordered by first appearance in the earliest run, then later runs. */
export function buildRooms(runs: Run[]): Room[] {
  const chronological = [...runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const rooms = new Map<string, { ghosts: Set<GhostId>; coldSpots: ColdSpot[] }>();
  for (const run of chronological) {
    for (const step of run.steps) {
      const room = rooms.get(step.page) ?? { ghosts: new Set<GhostId>(), coldSpots: [] };
      room.ghosts.add(run.ghost);
      rooms.set(step.page, room);
    }
  }
  for (const run of chronological) {
    const pageOf = new Map(run.steps.map((s) => [s.n, s.page]));
    for (const spot of runColdSpots(run)) {
      rooms.get(pageOf.get(spot.step)!)!.coldSpots.push(spot);
    }
  }
  return [...rooms.entries()].map(([page, room]) => ({
    page,
    ghosts: GHOST_ORDER.filter((g) => room.ghosts.has(g)),
    coldSpots: room.coldSpots,
  }));
}

export const COLD_SPOT_MIN = 24;
export const COLD_SPOT_MAX = 96;

/** Size in CSS px: clamp(24 + 16 · log2(1 + waitMs / 100), 24, 96). Non-decreasing in waitMs. */
export function coldSpotSize(waitMs: number): number {
  if (!Number.isFinite(waitMs) || waitMs <= 0) return waitMs === Infinity ? COLD_SPOT_MAX : COLD_SPOT_MIN;
  const size = COLD_SPOT_MIN + 16 * Math.log2(1 + waitMs / 100);
  return Math.min(COLD_SPOT_MAX, Math.max(COLD_SPOT_MIN, size));
}
