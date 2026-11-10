import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatProblem, validate } from '../src/contract/invariants.ts';
import { shotPath } from '../src/core/recorder.ts';
import { ENGINE_ERROR_PREFIX, MAX_STEPS, OPENING_THOUGHT } from '../src/core/runLoop.ts';
import { isBadStepN, runScenario, scenarioArb, tinyPng } from './helpers/fakeGhost.ts';
import type { DetectorCall, Scenario, ScenarioRun, ScriptEntry, StepRef } from './helpers/fakeGhost.ts';

/*
 * Property tests for the run loop. The fake Body, Mind and Detectors, the scenario generator and
 * `runScenario` live in ./helpers/fakeGhost.ts so that every property in this file shares them.
 * Each property is its own top-level `describe`.
 */

const RUNS = { numRuns: 200 };

// ---------------------------------------------------------------------------------------------
// Property 3
// ---------------------------------------------------------------------------------------------

interface Expected {
  /** What the DetectorRunner should hold, worked out only from the log of Detector calls. */
  findings: { type: string; stepN: number; title: string; screenshot: 'step' | 'seen' }[];
  /** Why the loop must have stopped at the last logged call, if it must have. */
  stoppedBy: 'throw' | 'bad_step' | null;
  /** Index of the call that stopped the Run. */
  stoppedAt: number;
}

/**
 * The rules of Requirement 7.3, written independently of DetectorRunner: a Detector that throws,
 * or reports any problem whose `stepN` is not an integer in 1..recorded, stops detection; none of
 * that call's problems are kept; everything else is kept once per (type, key).
 */
function expectedFromLog(log: readonly DetectorCall[]): Expected {
  const seen = new Set<string>();
  const findings: Expected['findings'] = [];
  for (const [i, call] of log.entries()) {
    if (call.threw) return { findings, stoppedBy: 'throw', stoppedAt: i };
    if (call.problems.some((p) => isBadStepN(p.stepN, call.recorded))) {
      return { findings, stoppedBy: 'bad_step', stoppedAt: i };
    }
    for (const p of call.problems) {
      const id = JSON.stringify([call.type, p.key]);
      if (seen.has(id)) continue;
      seen.add(id);
      findings.push({ type: call.type, stepN: p.stepN, title: p.key, screenshot: p.screenshot });
    }
  }
  return { findings, stoppedBy: null, stoppedAt: -1 };
}

describe('Feature: haunt-engine, Property 3: Every finding points to an existing step', () => {
  it(
    'every Finding of a finalized Run points to a Step of that Run, and a bogus stepN ends the Run with error instead of becoming a Finding',
    async () => {
      const seenBy = {
        succeeded: 0,
        gave_up: 0,
        error: 0,
        badStep: 0,
        threw: 0,
        withFindings: 0,
        seenMissing: 0,
        listener: 0,
        phantom: 0,
        bebe: 0,
      };

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          const run: ScenarioRun = await runScenario(scenario);
          const { outcome, recorder, runner, log, finalized } = run;
          const recorded = recorder.steps.length;
          const expected = expectedFromLog(log);

          // The loop always records Step 1, and never more than 60 Steps.
          expect(recorded).toBeGreaterThanOrEqual(1);
          expect(recorded).toBeLessThanOrEqual(60);

          // 1. The Detector framework keeps exactly the Findings the rules allow, and every one
          //    of them points at a recorded Step.
          expect(
            runner.findings.map((f) => ({ type: f.type, stepN: f.stepN, title: f.title, screenshot: f.screenshot })),
          ).toEqual(expected.findings);
          for (const finding of runner.findings) {
            expect(Number.isInteger(finding.stepN)).toBe(true);
            expect(finding.stepN).toBeGreaterThanOrEqual(1);
            expect(finding.stepN).toBeLessThanOrEqual(recorded);
          }

          // 2. A throwing Detector or a bogus stepN stops detection at once and ends the Run with
          //    `error`; the engine's sentence goes on the last Step.
          if (expected.stoppedBy !== null) {
            expect(log.length).toBe(expected.stoppedAt + 1);
            expect(outcome.result).toBe('error');
            const last = finalized.run.steps[finalized.run.steps.length - 1]!;
            expect(last.thought).toContain(`${ENGINE_ERROR_PREFIX} ${log[expected.stoppedAt]!.type} failed:`);
            if (expected.stoppedBy === 'bad_step') {
              expect(outcome.errorMessage).toMatch(/reported a problem \("k\d"\) for Step .+, but only Steps 1 to \d+ are recorded/);
              seenBy.badStep++;
            } else {
              seenBy.threw++;
            }
          } else if (outcome.result === 'error') {
            // Without a Detector failure, only an injected fault can end a Run with `error`.
            expect(scenario.fault).not.toBeNull();
          }
          expect(finalized.run.result).toBe(outcome.result);

          // 3. finalizeRun. The only reason for a problem is a Finding that refers to a "seen"
          //    screenshot the Step does not have. Otherwise the Run is valid and every Finding's
          //    `step` is the `n` of a Step of the Run.
          const stepNumbers = finalized.run.steps.map((s) => s.n);
          expect(stepNumbers).toEqual(Array.from({ length: recorded }, (_, i) => i + 1));
          expect(finalized.run.findings).toHaveLength(runner.findings.length);

          const seenMissing = runner.findings.some((f) => f.screenshot === 'seen' && !recorder.hasSeenScreenshot(f.stepN));
          if (seenMissing) {
            expect(finalized.problems.length).toBeGreaterThan(0);
            for (const problem of finalized.problems) expect(problem.path).toMatch(/^findings\[\d+\]/);
            seenBy.seenMissing++;
          } else {
            expect(finalized.problems.map(formatProblem)).toEqual([]);
          }
          for (const finding of finalized.run.findings) {
            expect(Number.isInteger(finding.step)).toBe(true);
            expect(stepNumbers).toContain(finding.step);
          }

          seenBy[outcome.result]++;
          seenBy[scenario.ghost]++;
          if (runner.findings.length > 0) seenBy.withFindings++;
        }),
        RUNS,
      );

      // The property must not pass by only ever seeing one kind of case.
      expect(seenBy.listener).toBeGreaterThan(0);
      expect(seenBy.phantom).toBeGreaterThan(0);
      expect(seenBy.bebe).toBeGreaterThan(0);
      expect(seenBy.succeeded).toBeGreaterThan(0);
      expect(seenBy.gave_up).toBeGreaterThan(0);
      expect(seenBy.error).toBeGreaterThan(0);
      expect(seenBy.badStep).toBeGreaterThan(0);
      expect(seenBy.threw).toBeGreaterThan(0);
      expect(seenBy.withFindings).toBeGreaterThan(0);
      expect(seenBy.seenMissing).toBeGreaterThan(0);
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------------------------
// Property 4
// ---------------------------------------------------------------------------------------------

const BAD_REFS: readonly StepRef[] = ['zero', 'negative', 'beyond', 'fraction', 'nan', 'infinity'];

/** An entry that neither throws nor reports a bad `stepN`, so a Detector can never end the Run. */
function calm(entry: ScriptEntry): ScriptEntry {
  return {
    throws: false,
    problems: entry.problems.map((p) => ({ ...p, ref: BAD_REFS.includes(p.ref) ? 'current' : p.ref })),
  };
}

/**
 * Runs that nothing but the 60-Step limit can end: the real limit (`maxSteps` undefined), no
 * success, no give-up, no stop rule, no thrown fault, and Detectors that report only good Steps.
 * Findings (also with "seen" screenshots) still happen.
 */
const limitScenarioArb: fc.Arbitrary<Scenario> = scenarioArb.map(
  (s): Scenario => ({
    ...s,
    maxSteps: undefined,
    successAt: null,
    giveUpAfter: null,
    stopAfter: null,
    fault: null,
    detectors: s.detectors.map((d) => ({ type: d.type, observe: d.observe.map(calm), finish: calm(d.finish) })),
  }),
);

/** Three-digit zero-padded Step number, written independently of the engine. */
const nnn = (n: number): string => String(n).padStart(3, '0');

/**
 * Checks everything Property 4 says about one Run. Returns N, the number of Steps.
 */
function checkStepNumbering(scenario: Scenario, run: ScenarioRun): number {
  const { outcome, recorder, runner, finalized, bodyCalls } = run;
  const limit = scenario.maxSteps ?? MAX_STEPS;
  const recorded = recorder.steps.length;
  const n = recorded;

  // 1 <= N <= 60, and never over the limit the loop was given.
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(MAX_STEPS);
  expect(n).toBeLessThanOrEqual(limit);

  // The Steps are numbered 1..N, in order, with no gap and no repeat, in the Recorder and in the
  // finalized Run.
  const expectedNumbers = Array.from({ length: n }, (_, i) => i + 1);
  expect(recorder.steps.map((r) => r.step.n)).toEqual(expectedNumbers);
  expect(finalized.run.steps.map((s) => s.n)).toEqual(expectedNumbers);

  // Step n's screenshot is shots/NNN.png for its own n, and the file holds that Step's image.
  for (const step of finalized.run.steps) {
    expect(step.screenshot).toBe(`shots/${nnn(step.n)}.png`);
    expect(step.screenshot).toBe(shotPath(step.n));
    expect(finalized.files.has(step.screenshot)).toBe(true);
    expect(recorder.screenshotByName(step.screenshot)).toEqual(tinyPng(step.n, 0));
  }

  // Step 1 is the open action; every later Step is the result of one `act` round.
  const first = finalized.run.steps[0]!;
  expect(first.n).toBe(1);
  expect(first.action).toBe('I open the page.');
  expect(first.thought.startsWith(OPENING_THOUGHT)).toBe(true);
  for (const step of finalized.run.steps.slice(1)) {
    expect(step.action).toBe(`I do thing ${step.n}.`);
    expect(step.thought.startsWith(`I try thing ${step.n - 1}.`)).toBe(true);
  }
  expect(bodyCalls.open).toBe(1);
  expect(bodyCalls.acts).toBe(n - 1);

  // The limit ends the Run as `gave_up` / `step_limit`, exactly at the limit, and nothing else
  // stops a Run at the limit.
  if (outcome.reason === 'step_limit') {
    expect(outcome.result).toBe('gave_up');
    expect(n).toBe(limit);
  }
  if (n === limit && outcome.result === 'gave_up') {
    // A stop rule or a give-up on the very last Step is also fine; only the limit may be missing
    // when something else fired.
    expect(['step_limit', 'trapped', 'no_match']).toContain(outcome.reason);
  }

  // The finalized Run is valid, except for the known problems of Findings that refer to a "seen"
  // screenshot their Step does not have.
  const seenMissingPaths = new Set(
    runner.findings.flatMap((f, i) =>
      f.screenshot === 'seen' && !recorder.hasSeenScreenshot(f.stepN) ? [`findings[${i}].screenshot`] : [],
    ),
  );
  const problems = validate(finalized.run, finalized.files.keys(), { screenshotSize: run.screenshotSize }).filter(
    (p) => !seenMissingPaths.has(p.path),
  );
  expect(problems.map(formatProblem)).toEqual([]);
  expect(finalized.problems.every((p) => /^findings\[\d+\]/.test(p.path))).toBe(true);
  expect(finalized.run.result).toBe(outcome.result);

  return n;
}

describe('Feature: haunt-engine, Property 4: Steps are numbered 1 to N with no gaps', () => {
  it(
    'every Run has Steps 1 to N with N from 1 to 60, shots/NNN.png for each, Step 1 as the open action and N-1 act rounds',
    async () => {
      const seenBy = {
        listener: 0,
        phantom: 0,
        bebe: 0,
        succeeded: 0,
        gave_up: 0,
        error: 0,
        oneStep: 0,
        manySteps: 0,
        atLimit: 0,
        limit60: 0,
        realLimitUnset: 0,
        smallLimit: 0,
      };

      await fc.assert(
        fc.asyncProperty(
          // Mostly the general generator, plus Runs that can only end at the real 60-Step limit.
          fc.oneof({ weight: 3, arbitrary: scenarioArb }, { weight: 1, arbitrary: limitScenarioArb }),
          async (scenario) => {
            const run = await runScenario(scenario);
            const n = checkStepNumbering(scenario, run);

            seenBy[scenario.ghost]++;
            seenBy[run.outcome.result]++;
            if (n === 1) seenBy.oneStep++;
            if (n >= 10) seenBy.manySteps++;
            if (n === (scenario.maxSteps ?? MAX_STEPS)) seenBy.atLimit++;
            if (scenario.maxSteps === undefined) seenBy.realLimitUnset++;
            else seenBy.smallLimit++;
            // A Run that reaches Step 60 ends there as `gave_up` / `step_limit`, unless the 60th
            // Step succeeded or the closing work failed (a throwing Detector or Give_Up_Thought).
            if (n === 60) {
              if (run.outcome.reason === 'step_limit') seenBy.limit60++;
              expect(['gave_up', 'succeeded', 'error']).toContain(run.outcome.result);
            }
          },
        ),
        RUNS,
      );

      // The property must not pass by only ever seeing one kind of case.
      expect(seenBy.listener).toBeGreaterThan(0);
      expect(seenBy.phantom).toBeGreaterThan(0);
      expect(seenBy.bebe).toBeGreaterThan(0);
      expect(seenBy.succeeded).toBeGreaterThan(0);
      expect(seenBy.gave_up).toBeGreaterThan(0);
      expect(seenBy.error).toBeGreaterThan(0);
      expect(seenBy.oneStep).toBeGreaterThan(0);
      expect(seenBy.manySteps).toBeGreaterThan(0);
      expect(seenBy.atLimit).toBeGreaterThan(0);
      expect(seenBy.realLimitUnset).toBeGreaterThan(0);
      expect(seenBy.smallLimit).toBeGreaterThan(0);
      expect(seenBy.limit60).toBeGreaterThan(0);
    },
    240_000,
  );

  it(
    'with the real limit and nothing else to stop it, every Run ends at exactly Step 60 with result gave_up',
    async () => {
      const seenGhost = { listener: 0, phantom: 0, bebe: 0 };
      let withFindings = 0;

      await fc.assert(
        fc.asyncProperty(limitScenarioArb, async (scenario) => {
          expect(scenario.maxSteps).toBeUndefined();
          const run = await runScenario(scenario);
          const n = checkStepNumbering(scenario, run);

          expect(n).toBe(60);
          expect(run.outcome).toEqual({ result: 'gave_up', reason: 'step_limit' });
          expect(run.finalized.run.result).toBe('gave_up');
          expect(run.finalized.run.steps).toHaveLength(60);
          expect(run.finalized.run.steps[59]!.screenshot).toBe('shots/060.png');
          expect(run.bodyCalls.acts).toBe(59);
          expect(run.bodyCalls.actsThrown).toBe(0);

          seenGhost[scenario.ghost]++;
          if (run.runner.findings.length > 0) withFindings++;
        }),
        { numRuns: 100 },
      );

      expect(seenGhost.listener).toBeGreaterThan(0);
      expect(seenGhost.phantom).toBeGreaterThan(0);
      expect(seenGhost.bebe).toBeGreaterThan(0);
      expect(withFindings).toBeGreaterThan(0);
    },
    240_000,
  );
});
