import fc from 'fast-check';
import type { HauntConfig, SiteConfig } from '../../src/config/loadConfig.ts';
import type { GhostId, RunResult } from '../../src/contract/types.ts';
import { DetectorRunner } from '../../src/core/detectors.ts';
import type { CdpSender, InspectablePage } from '../../src/core/detectors.ts';
import { finalizeRun } from '../../src/core/finalize.ts';
import type { FinalizeResult } from '../../src/core/finalize.ts';
import { Recorder } from '../../src/core/recorder.ts';
import { formatRunId } from '../../src/core/runId.ts';
import { runLoop } from '../../src/core/runLoop.ts';
import type { RunLoopOutcome } from '../../src/core/runLoop.ts';
import type {
  ActionResult,
  Body,
  DetectedProblem,
  Detector,
  FindingType,
  GiveUpReason,
  Mind,
  RecorderViewport,
} from '../../src/core/types.ts';
import type { Mission } from '../../src/missions/loadMission.ts';

/*
 * Fake Bodies, Minds and Detectors for the run-loop property tests (Properties 3 and 4).
 *
 * A `Scenario` is plain data: it says when the fake mission succeeds, when the Mind gives up, when
 * the Ghost's stop rule fires, when the Body/Mind/success check throws, and what every Detector
 * reports on every call (including problems for Steps that were never recorded).
 *
 * `runScenario` runs the REAL `runLoop`, the REAL `DetectorRunner` (so its `stepN` check is
 * exercised), the REAL `Recorder` and the REAL `finalizeRun`. Only the Body, the Mind, the
 * Detectors, the page and the CDP session are fake. No browser starts.
 */

export const GHOST_IDS: readonly GhostId[] = ['listener', 'phantom', 'bebe'];

/** The Ghosts' real browser profiles (viewport in CSS px and device scale factor). */
export const PROFILES: Record<GhostId, RecorderViewport> = {
  listener: { width: 1280, height: 800, deviceScaleFactor: 1 },
  phantom: { width: 360, height: 640, deviceScaleFactor: 2 },
  bebe: { width: 640, height: 400, deviceScaleFactor: 2 },
};

export const FINDING_TYPES: readonly FindingType[] = [
  'unlabeled_button',
  'focus_trap',
  'unannounced_error',
  'slow_wait',
  'misclick',
  'cut_off_text',
  'untranslated',
  'dark_pattern',
];

export const STARTED_AT = new Date(Date.UTC(2026, 10, 10, 15, 30, 12));

// ---------------------------------------------------------------------------------------------
// Scenario data
// ---------------------------------------------------------------------------------------------

/** Where a problem's `stepN` points, relative to the Steps recorded when the Detector reports it. */
export type StepRef =
  | 'current'
  | 'past'
  | 'first'
  // Bad references: the engine must refuse these.
  | 'zero'
  | 'negative'
  | 'beyond'
  | 'fraction'
  | 'nan'
  | 'infinity';

export interface ProblemSpec {
  key: string;
  ref: StepRef;
  /** Chooses which past Step, or how far beyond. */
  pick: number;
  screenshot: 'step' | 'seen';
}

export interface ScriptEntry {
  /** The Detector throws instead of returning problems. */
  throws: boolean;
  problems: ProblemSpec[];
}

export interface DetectorSpec {
  type: FindingType;
  /** Entry `i % observe.length` is used for the Detector's `i`-th `observe` call. */
  observe: ScriptEntry[];
  finish: ScriptEntry;
}

export type FaultWhere = 'perceive' | 'decide' | 'act' | 'success' | 'giveUpThought';

export interface Scenario {
  ghost: GhostId;
  /** `undefined` uses the real limit of 60. */
  maxSteps: number | undefined;
  /** `checkSuccess` returns true on its `successAt`-th call. `null`: never. */
  successAt: number | null;
  /** The Mind gives up (`no_match`) once it has made this many `act` decisions. `null`: never. */
  giveUpAfter: number | null;
  /** The Ghost's stop rule returns `trapped` once this many Steps are recorded. `null`: never. */
  stopAfter: number | null;
  /** One thing throws on its `at`-th call. `null`: nothing throws. */
  fault: { where: FaultWhere; at: number } | null;
  /** Step `n` has a "seen" screenshot when `seenMask[n % seenMask.length]` is true. */
  seenMask: boolean[];
  detectors: DetectorSpec[];
}

/** True when Step `n` of the scenario's Run has a seen screenshot. */
export function hasSeenShot(scenario: Scenario, n: number): boolean {
  return scenario.seenMask[n % scenario.seenMask.length] ?? false;
}

/** The same rule as the engine's: a `stepN` must be an integer from 1 to the number of recorded Steps. */
export function isBadStepN(stepN: number, recorded: number): boolean {
  return !Number.isInteger(stepN) || stepN < 1 || stepN > recorded;
}

// ---------------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------------

const GOOD_REFS: StepRef[] = ['current', 'past', 'first'];
const BAD_REFS: StepRef[] = ['zero', 'negative', 'beyond', 'fraction', 'nan', 'infinity'];

/** True with probability 1 in `odds`. */
const oneIn = (odds: number): fc.Arbitrary<boolean> => fc.integer({ min: 0, max: odds - 1 }).map((n) => n === 0);

/** A problem. When `allowBad` is false (decided later) bad references are replaced by `current`. */
interface RawProblem {
  key: string;
  good: StepRef;
  bad: StepRef;
  isBad: boolean;
  pick: number;
  screenshot: 'step' | 'seen';
}

const rawProblemArb = (badOdds: number): fc.Arbitrary<RawProblem> =>
  fc.record({
    // A small key set, so that duplicate keys happen all the time.
    key: fc.constantFrom('k0', 'k1', 'k2', 'k3', 'k4', 'k5'),
    good: fc.oneof(
      { weight: 5, arbitrary: fc.constant<StepRef>('current') },
      { weight: 4, arbitrary: fc.constant<StepRef>('past') },
      { weight: 1, arbitrary: fc.constant<StepRef>('first') },
    ),
    bad: fc.constantFrom(...BAD_REFS),
    isBad: oneIn(badOdds),
    pick: fc.nat({ max: 1000 }),
    screenshot: fc.oneof(
      { weight: 4, arbitrary: fc.constant<'step' | 'seen'>('step') },
      { weight: 1, arbitrary: fc.constant<'seen' | 'step'>('seen') },
    ),
  });

interface RawEntry {
  throws: boolean;
  problems: RawProblem[];
}

const rawEntryArb = (badOdds: number, throwOdds: number): fc.Arbitrary<RawEntry> =>
  fc.record({
    throws: oneIn(throwOdds),
    problems: fc.array(rawProblemArb(badOdds), { maxLength: 3 }),
  });

function settle(raw: RawEntry, allowBad: boolean, allowThrow: boolean): ScriptEntry {
  return {
    throws: raw.throws && allowThrow,
    problems: raw.problems.map((p) => ({
      key: p.key,
      ref: p.isBad && allowBad ? p.bad : p.good,
      pick: p.pick,
      screenshot: p.screenshot,
    })),
  };
}

const faultArb: fc.Arbitrary<Scenario['fault']> = fc.oneof(
  { weight: 7, arbitrary: fc.constant<Scenario['fault']>(null) },
  {
    weight: 3,
    arbitrary: fc.record({
      where: fc.constantFrom<FaultWhere>('perceive', 'decide', 'act', 'success', 'giveUpThought'),
      at: fc.integer({ min: 1, max: 40 }),
    }),
  },
);

const optionalCount = (max: number, noneWeight: number): fc.Arbitrary<number | null> =>
  fc.oneof(
    { weight: noneWeight, arbitrary: fc.constant<number | null>(null) },
    { weight: 4, arbitrary: fc.integer({ min: 1, max }) },
  );

const detectorTypesArb = fc.uniqueArray(fc.constantFrom(...FINDING_TYPES), { minLength: 0, maxLength: 3 });

/**
 * Random Runs for all three Ghosts: random success, stop, Step-limit and give-up timing, random
 * throws, and Detectors that report problems for current and past Steps, with duplicate keys and
 * bad `stepN` values (0, negative, beyond the recorded Steps, fractional, NaN, Infinity).
 */
export const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    ghost: fc.constantFrom(...GHOST_IDS),
    maxSteps: fc.oneof(
      { weight: 3, arbitrary: fc.constant<number | undefined>(undefined) },
      { weight: 5, arbitrary: fc.integer({ min: 1, max: 12 }) },
    ),
    successAt: optionalCount(30, 3),
    giveUpAfter: optionalCount(30, 3),
    stopAfter: optionalCount(30, 4),
    fault: faultArb,
    seenMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
    allowBad: fc.boolean(),
    allowThrow: fc.boolean(),
    types: detectorTypesArb,
  })
  .chain((base) =>
    fc
      .tuple(
        ...base.types.map(() =>
          fc.record({
            observe: fc.array(rawEntryArb(30, 40), { minLength: 1, maxLength: 8 }),
            // `finish` runs once, so it gets a higher chance of a bad problem.
            finish: rawEntryArb(4, 6),
          }),
        ),
      )
      .map((scripts): Scenario => {
        const { types, allowBad, allowThrow, ...rest } = base;
        return {
          ...rest,
          detectors: types.map((type, i) => {
            const script = scripts[i]!;
            return {
              type,
              observe: script.observe.map((e) => settle(e, allowBad, allowThrow)),
              finish: settle(script.finish, allowBad, allowThrow),
            };
          }),
        };
      }),
  );

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

/** What a fake Detector returned (or threw) on one call, in the order the calls happened. */
export interface DetectorCall {
  phase: 'observe' | 'finish';
  type: FindingType;
  /** Steps recorded when the Detector was called. */
  recorded: number;
  threw: boolean;
  problems: { key: string; stepN: number; screenshot: 'step' | 'seen' }[];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A tiny buffer that starts like a PNG and says which Step and kind it belongs to. */
export function tinyPng(n: number, kind: 0 | 1): Buffer {
  return Buffer.from([...PNG_SIGNATURE, n & 0xff, kind]);
}

/** The ActionResult a fake Body returns for Step `n`. */
export function fakeActionResult(scenario: Scenario, n: number): ActionResult {
  return {
    actionText: n === 1 ? 'I open the page.' : `I do thing ${n}.`,
    spoken: `Spoken ${n}.`,
    focusBox: n % 2 === 0 ? { x: 10, y: 10, w: 20, h: 20 } : null,
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: n * 100,
      readyAt: n * 100,
      waits: [],
      announcements: [],
    },
    screenshot: tinyPng(n, 0),
    ...(hasSeenShot(scenario, n) ? { seenScreenshot: tinyPng(n, 1) } : {}),
  };
}

/** How often the loop called the fake Body. `acts` counts only the `act` calls that returned a result. */
export interface BodyCalls {
  open: number;
  perceive: number;
  /** `act` calls that returned an ActionResult (each one becomes a Step). */
  acts: number;
  /** `act` calls that threw. */
  actsThrown: number;
}

function fakeBody(scenario: Scenario, calls: BodyCalls): Body<number, number> {
  let acts = 0;
  let perceives = 0;
  return {
    async open() {
      calls.open++;
      return fakeActionResult(scenario, 1);
    },
    async perceive() {
      perceives++;
      calls.perceive++;
      if (scenario.fault?.where === 'perceive' && scenario.fault.at === perceives) throw new Error('fake perceive failure');
      return { perception: perceives, probe: { at: perceives * 100 } };
    },
    async act() {
      acts++;
      if (scenario.fault?.where === 'act' && scenario.fault.at === acts) {
        calls.actsThrown++;
        throw new Error('fake act failure');
      }
      calls.acts++;
      return fakeActionResult(scenario, acts + 1);
    },
  };
}

function fakeMind(scenario: Scenario): Mind<number, number> {
  let decisions = 0;
  return {
    decide() {
      decisions++;
      if (scenario.fault?.where === 'decide' && scenario.fault.at === decisions) throw new Error('fake decide failure');
      if (scenario.giveUpAfter !== null && decisions > scenario.giveUpAfter) {
        return { kind: 'give_up', reason: 'no_match', thought: 'I cannot find what I need.' };
      }
      return { kind: 'act', action: decisions, thought: `I try thing ${decisions}.`, intentionId: 'fake' };
    },
    giveUpThought(reason: GiveUpReason) {
      if (scenario.fault?.where === 'giveUpThought') throw new Error('fake give-up failure');
      return `I stop here (${reason}).`;
    },
  };
}

function resolveStepN(ref: StepRef, pick: number, current: number, recorded: number): number {
  switch (ref) {
    case 'current':
      return current;
    case 'past':
      return 1 + (pick % current);
    case 'first':
      return 1;
    case 'zero':
      return 0;
    case 'negative':
      return -1 - (pick % 5);
    case 'beyond':
      return recorded + 1 + (pick % 5);
    case 'fraction':
      return current - 0.5;
    case 'nan':
      return Number.NaN;
    case 'infinity':
      return Number.POSITIVE_INFINITY;
  }
}

function fakeDetector(spec: DetectorSpec, log: DetectorCall[]): Detector {
  let observeCalls = 0;
  const play = (phase: DetectorCall['phase'], entry: ScriptEntry, current: number, recorded: number): DetectedProblem[] => {
    const problems = entry.problems.map((p) => ({
      key: p.key,
      stepN: resolveStepN(p.ref, p.pick, current, recorded),
      screenshot: p.screenshot,
    }));
    log.push({ phase, type: spec.type, recorded, threw: entry.throws, problems });
    if (entry.throws) throw new Error(`fake ${spec.type} failure`);
    return problems.map((p) => ({ ...p, title: p.key, evidence: `evidence ${p.key}` }));
  };
  return {
    type: spec.type,
    async observe(ctx) {
      const entry = spec.observe[observeCalls % spec.observe.length]!;
      observeCalls++;
      return play('observe', entry, ctx.current.step.n, ctx.steps.length);
    },
    async finish(ctx) {
      return play('finish', spec.finish, ctx.current.step.n, ctx.steps.length);
    },
  };
}

const FAKE_PAGE: InspectablePage = { evaluate: (async () => undefined) as InspectablePage['evaluate'] };
const FAKE_CDP: CdpSender = { send: (async () => ({})) as unknown as CdpSender['send'] };
const FAKE_SITE: SiteConfig = { name: 'Fake Site', allowedTerms: [] };
const FAKE_CONFIG: HauntConfig = { allowedDomains: [], sites: { fake: FAKE_SITE } };

export const FAKE_MISSION: Mission = {
  id: 'fake-mission',
  site: 'fake',
  goal: 'Finish the fake mission.',
  requirement: 'Fake requirement.',
  successCheck: { text: 'The fake success message is visible.', visible: '[data-haunt="fake-success"]' },
  intentions: [],
};

// ---------------------------------------------------------------------------------------------
// Running a scenario
// ---------------------------------------------------------------------------------------------

export interface ScenarioRun {
  outcome: RunLoopOutcome;
  recorder: Recorder;
  /** The real DetectorRunner that the loop used. */
  runner: DetectorRunner;
  /** Every Detector call, in order. */
  log: DetectorCall[];
  /** `finalizeRun` with the loop's result and the runner's Findings. */
  finalized: FinalizeResult;
  /** Viewport size times device scale factor. */
  screenshotSize: { width: number; height: number };
  /** How often the loop called the fake Body. */
  bodyCalls: BodyCalls;
}

/** Runs the real run loop with the fakes, then the real `finalizeRun`. */
export async function runScenario(scenario: Scenario): Promise<ScenarioRun> {
  const profile = PROFILES[scenario.ghost];
  const recorder = new Recorder(profile);
  const log: DetectorCall[] = [];
  const runner = new DetectorRunner({
    detectors: scenario.detectors.map((d) => fakeDetector(d, log)),
    page: FAKE_PAGE,
    cdp: FAKE_CDP,
    config: FAKE_CONFIG,
    site: FAKE_SITE,
    recorder,
  });

  let successCalls = 0;
  const bodyCalls: BodyCalls = { open: 0, perceive: 0, acts: 0, actsThrown: 0 };
  const outcome = await runLoop<number, number>({
    body: fakeBody(scenario, bodyCalls),
    mind: fakeMind(scenario),
    stopRule: (state) => (scenario.stopAfter !== null && state.steps.length >= scenario.stopAfter ? 'trapped' : null),
    detectors: runner,
    recorder,
    mission: FAKE_MISSION,
    url: 'http://localhost:3000/',
    async checkSuccess() {
      successCalls++;
      if (scenario.fault?.where === 'success' && scenario.fault.at === successCalls) throw new Error('fake success-check failure');
      return scenario.successAt !== null && successCalls === scenario.successAt;
    },
    ...(scenario.maxSteps !== undefined ? { maxSteps: scenario.maxSteps } : {}),
  });

  const screenshotSize = {
    width: profile.width * profile.deviceScaleFactor,
    height: profile.height * profile.deviceScaleFactor,
  };
  const result: RunResult = outcome.result;
  const finalized = finalizeRun({
    runId: formatRunId(STARTED_AT, scenario.ghost, FAKE_MISSION.id),
    ghost: scenario.ghost,
    mission: FAKE_MISSION,
    site: FAKE_SITE,
    url: 'http://localhost:3000/',
    commit: 'unknown',
    startedAt: STARTED_AT,
    result,
    recorder,
    findings: runner.findings,
    screenshotSize,
  });

  return { outcome, recorder, runner, log, finalized, screenshotSize, bodyCalls };
}
