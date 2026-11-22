import { GHOSTS, GHOST_NAMES, type GhostId } from './ghosts.ts';
import type { GhostEntry, PatrolRecord } from './record.ts';

export type FindingStatus = 'new' | 'fixed' | 'unchanged';
export interface FindingDiff {
  ghost: GhostId;
  type: string;
  title: string;
  status: FindingStatus;
}
export interface ResultChange {
  ghost: GhostId;
  from: GhostEntry['result'];
  to: GhostEntry['result'];
}
export interface RecordDiff {
  findings: FindingDiff[];
  resultChanges: ResultChange[]; // only ghosts whose result differs
}

/** Finding_Key = ghost + "\u0000" + type + "\u0000" + title. */
export function findingKey(ghost: GhostId, f: { type: string; title: string }): string {
  return `${ghost}\u0000${f.type}\u0000${f.title}`;
}

function entryOf(record: PatrolRecord, ghost: GhostId): GhostEntry | undefined {
  return record.ghosts.find((g) => g.ghost === ghost);
}

/** A plain set diff per ghost. It knows nothing about saved runs. */
export function diffRecords(current: PatrolRecord, previous: PatrolRecord): RecordDiff {
  const findings: FindingDiff[] = [];
  const resultChanges: ResultChange[] = [];
  for (const ghost of GHOSTS) {
    const cur = entryOf(current, ghost);
    const prev = entryOf(previous, ghost);
    const curMap = new Map((cur?.findings ?? []).map((f) => [findingKey(ghost, f), f] as const));
    const prevMap = new Map((prev?.findings ?? []).map((f) => [findingKey(ghost, f), f] as const));
    for (const [key, f] of curMap) {
      findings.push({ ghost, type: f.type, title: f.title, status: prevMap.has(key) ? 'unchanged' : 'new' });
    }
    for (const [key, f] of prevMap) {
      if (!curMap.has(key)) findings.push({ ghost, type: f.type, title: f.title, status: 'fixed' });
    }
    if (cur && prev && cur.result !== prev.result) resultChanges.push({ ghost, from: prev.result, to: cur.result });
  }
  return { findings, resultChanges };
}

/** Newest date strictly earlier than currentDate, or null. Dates are YYYY-MM-DD strings. */
export function selectPrevious(currentDate: string, availableDates: readonly string[]): string | null {
  let best: string | null = null;
  for (const d of availableDates) {
    if (d < currentDate && (best === null || d > best)) best = d;
  }
  return best;
}

export type PreviousState =
  | { kind: 'none' }
  | { kind: 'unreadable'; date: string }
  | { kind: 'record'; record: PatrolRecord };

function resultWords(entry: GhostEntry): string {
  switch (entry.result) {
    case 'succeeded':
      return 'succeeded';
    case 'gave_up':
      return 'gave up';
    case 'error':
      return entry.exitCode === null ? 'error' : `error (exit code ${entry.exitCode})`;
    case 'no_run':
      return 'no saved run';
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function describe(f: { ghost: GhostId; type: string; title: string }): string {
  return `${GHOST_NAMES[f.ghost]}, ${f.type}, "${f.title}"`;
}

export function buildSummary(current: PatrolRecord, previous: PreviousState): string {
  const lines: string[] = [];
  lines.push(`# Haunt Patrol, ${current.date} (IST)`);
  lines.push(`Seed ${current.seed}.`);
  if (current.interrupted) lines.push('The patrol was interrupted, so some ghosts did not run.');
  lines.push('', '## Ghosts');
  for (const ghost of GHOSTS) {
    const entry = entryOf(current, ghost);
    if (!entry) continue;
    const reason = entry.result === 'no_run' && entry.error ? ` ${entry.error}` : '';
    lines.push(`- ${GHOST_NAMES[ghost]}: ${resultWords(entry)}. ${plural(entry.findings.length, 'finding')}.${reason}`);
    for (const f of entry.findings) lines.push(`    - [${f.type}] Step ${f.step}: ${f.title}`);
  }
  lines.push('');

  if (previous.kind === 'none') {
    lines.push('There is no previous patrol, so there is nothing to compare.');
  } else if (previous.kind === 'unreadable') {
    lines.push(`The previous patrol (${previous.date}) was unreadable, so the comparison was left out.`);
  } else {
    const diff = diffRecords(current, previous.record);
    const noRun = new Set(current.ghosts.filter((g) => g.result === 'no_run').map((g) => g.ghost));
    const added = diff.findings.filter((f) => f.status === 'new');
    const fixed = diff.findings.filter((f) => f.status === 'fixed' && !noRun.has(f.ghost));
    const unchanged = diff.findings.filter((f) => f.status === 'unchanged');
    lines.push(`## Compared with ${previous.record.date}`);
    if (diff.resultChanges.length === 0) {
      lines.push('Run results: no ghost changed its result.');
    } else {
      const words = (r: GhostEntry['result']): string => (r === 'gave_up' ? 'gave up' : r === 'no_run' ? 'no saved run' : r);
      lines.push(`Run results: ${diff.resultChanges.map((c) => `${GHOST_NAMES[c.ghost]} changed from ${words(c.from)} to ${words(c.to)}`).join('; ')}.`);
    }
    const list = (items: FindingDiff[]): string => (items.length === 0 ? '.' : `: ${items.map(describe).join('; ')}.`);
    lines.push(`New findings (${added.length})${list(added)}`);
    lines.push(`Fixed findings (${fixed.length})${list(fixed)}`);
    for (const ghost of GHOSTS) {
      if (!noRun.has(ghost)) continue;
      const missing = diff.findings.filter((f) => f.status === 'fixed' && f.ghost === ghost);
      if (missing.length === 0) continue;
      lines.push(`Not checked tonight (${GHOST_NAMES[ghost]} had no saved run): ${missing.map((f) => `"${f.title}" (${f.type})`).join(', ')}.`);
    }
    lines.push(`Unchanged findings (${unchanged.length})${list(unchanged)}`);
  }
  return `${lines.join('\n')}\n`;
}
