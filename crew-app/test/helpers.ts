import path from 'node:path';
import fc from 'fast-check';
import { GHOSTS, type GhostId } from '../src/ghosts.ts';
import type { Probe } from '../src/prerequisites.ts';
import { makeEntry, type FindingRef, type GhostEntry, type PatrolRecord } from '../src/record.ts';
import type { CommandResult, CommandRunner, SiteController, SiteStart } from '../src/site.ts';
import type { PatrolStore } from '../src/store.ts';
import type { PreviousState } from '../src/summary.ts';
import type { PatrolDeps } from '../src/runPatrol.ts';

export const RUNS = { numRuns: 100 } as const;

// ---- Arbitraries ----

export const arbTitle = fc.oneof(fc.string(), fc.string({ unit: 'grapheme' }), fc.constant('a\u0000b'), fc.constantFrom('Pay button cannot be reached', 'Text is too small'));
export const arbType = fc.oneof(fc.constantFrom('keyboard-trap', 'focus_trap', 'zoom', 'unlabeled_button'), fc.stringMatching(/^[a-z_-]{1,12}$/));
export const arbFinding: fc.Arbitrary<FindingRef> = fc.record({ type: arbType, step: fc.nat({ max: 200 }), title: arbTitle });

export const arbDate = fc
  .tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

export function arbEntry(ghost: GhostId): fc.Arbitrary<GhostEntry> {
  const saved = fc
    .tuple(fc.constantFrom('succeeded', 'gave_up', 'error') as fc.Arbitrary<'succeeded' | 'gave_up' | 'error'>, fc.array(arbFinding, { maxLength: 5 }), fc.string({ minLength: 1 }), fc.constantFrom(0, 3))
    .map(([result, findings, runId, exitCode]) => makeEntry(ghost, { result, exitCode, runId, findings, error: null }));
  const none = fc
    .tuple(fc.option(fc.integer({ min: 0, max: 255 }), { nil: null }), fc.string({ minLength: 1 }))
    .map(([exitCode, error]) => makeEntry(ghost, { result: 'no_run', exitCode, runId: null, findings: [], error }));
  return fc.oneof(saved, none);
}

export const arbRecord: fc.Arbitrary<PatrolRecord> = fc
  .tuple(arbDate, fc.integer({ min: 0, max: 99_999_999 }), fc.boolean(), arbEntry('listener'), arbEntry('phantom'), arbEntry('bebe'))
  .map(([date, seed, interrupted, a, b, c]) => ({ version: 1 as const, date, seed, interrupted, ghosts: [a, b, c] }));

// ---- Fixtures ----

export function record(date: string, entries: Partial<Record<GhostId, { result: GhostEntry['result']; findings?: FindingRef[] }>> = {}): PatrolRecord {
  return {
    version: 1,
    date,
    seed: Number(date.replaceAll('-', '')),
    interrupted: false,
    ghosts: GHOSTS.map((ghost) => {
      const given = entries[ghost] ?? { result: 'succeeded' as const };
      const saved = given.result !== 'no_run';
      return makeEntry(ghost, {
        result: given.result,
        exitCode: saved ? 0 : 1,
        runId: saved ? `${date}-${ghost}` : null,
        findings: given.findings ?? [],
        error: saved ? null : 'No run.',
      });
    }),
  };
}

export const FAKE_ROOT = path.resolve('/fake-haunt');

export function runJsonPath(ghost: string): string {
  return path.join(FAKE_ROOT, 'runs', 'lantern-bills', `run-${ghost}`, 'run.json');
}

export function runJsonText(result: string, findings: FindingRef[] = []): string {
  return JSON.stringify({ formatVersion: 1, runId: 'run-id', result, findings });
}

// ---- Fakes ----

export function goodProbe(overrides: Partial<Probe> = {}): Probe {
  return { nodeVersion: () => 'v24.1.0', dirExists: () => true, chromiumInstalled: () => Promise.resolve(true), ...overrides };
}

export function ghostOf(args: string[]): GhostId {
  return args[args.indexOf('--ghost') + 1] as GhostId;
}

export interface FakeSite extends SiteController {
  starts: number;
  stops: number;
}
export function fakeSite(start: SiteStart | 'ok' = 'ok'): FakeSite {
  const site: FakeSite = {
    starts: 0,
    stops: 0,
    start() {
      site.starts += 1;
      if (start !== 'ok') return Promise.resolve(start);
      return Promise.resolve({
        ok: true as const,
        stop: () => {
          site.stops += 1;
          return Promise.resolve();
        },
      });
    },
  };
  return site;
}

export interface FakeCommands extends CommandRunner {
  calls: string[][];
}
export function fakeCommands(respond: (ghost: GhostId, args: string[]) => CommandResult | Promise<CommandResult>): FakeCommands {
  const commands: FakeCommands = {
    calls: [],
    async run(args) {
      commands.calls.push(args);
      return respond(ghostOf(args), args);
    },
  };
  return commands;
}

export function savedResult(ghost: string, code: 0 | 3 = 0): CommandResult {
  return { code, stdout: `Step 1: go\n${runJsonPath(ghost)}\n`, stderr: '', timedOut: false };
}

export interface MemoryStore extends PatrolStore {
  records: PatrolRecord[];
  summaries: string[];
  exports: { record: PatrolRecord; summary: string; dashboardBaseUrl: string }[];
  previous: PreviousState;
  failWrite: boolean;
  failLoad: boolean;
}
export function memoryStore(previous: PreviousState = { kind: 'none' }): MemoryStore {
  const store: MemoryStore = {
    records: [],
    summaries: [],
    exports: [],
    previous,
    failWrite: false,
    failLoad: false,
    loadPrevious() {
      if (store.failLoad) return Promise.reject(new Error('load failed'));
      return Promise.resolve(store.previous);
    },
    writeRecord(r) {
      if (store.failWrite) return Promise.reject(new Error('disk full'));
      store.records.push(r);
      return Promise.resolve();
    },
    writeSummary(s) {
      store.summaries.push(s);
      return Promise.resolve();
    },
    exportStatic(r, s, dashboardBaseUrl) {
      store.exports.push({ record: r, summary: s, dashboardBaseUrl });
      return Promise.resolve();
    },
  };
  return store;
}

export interface Harness {
  deps: PatrolDeps;
  site: FakeSite;
  commands: FakeCommands;
  store: MemoryStore;
  out: string[];
  err: string[];
}

export function harness(options: {
  respond?: (ghost: GhostId, args: string[]) => CommandResult | Promise<CommandResult>;
  files?: (p: string) => string | Promise<string>;
  probe?: Probe;
  site?: FakeSite;
  store?: PatrolStore;
  now?: Date;
} = {}): Harness {
  const site = options.site ?? fakeSite();
  const commands = fakeCommands(options.respond ?? ((ghost) => savedResult(ghost)));
  const store = (options.store ?? memoryStore()) as MemoryStore;
  const out: string[] = [];
  const err: string[] = [];
  const deps: PatrolDeps = {
    repoRoot: FAKE_ROOT,
    clock: () => options.now ?? new Date('2026-11-03T05:00:00Z'),
    probe: options.probe ?? goodProbe(),
    site,
    commands,
    store,
    dashboardBaseUrl: 'http://localhost:3001',
    readFile: async (p) => (options.files ? options.files(p) : runJsonText('succeeded')),
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
  };
  return { deps, site, commands, store, out, err };
}
