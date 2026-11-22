import type { Mission } from '../missions/loadMission.ts';
import type { RunLoopDetectors, RunLoopOutcome, RunLoopRecorder } from './runLoop.ts';
import type { GiveUpReason, RunState } from './types.ts';

/*
 * The per-step pipeline shared by `runLoop` (scripted minds) and the AI run driver.
 *
 * After every recorded Step, `afterStep` decides, in this order:
 *   1. Detectors observe the Step. A Detector failure ends the Run with `error`.
 *   2. The success check. It wins even when the Step also produced Findings.
 *   3. The Ghost's stop rule.
 *   4. The Step limit.
 * It returns `null` when the Run goes on.
 *
 * After the Run, `closeRun` runs the Detectors' `finish()` (unless the Run ended in an error,
 * because the browser may be gone) and puts the closing sentence into the last Step's thought.
 */

/** Highest number of Steps in one Run (Requirement 6.9). */
export const MAX_STEPS = 60;

/** Plain-words start of every engine error sentence. */
export const ENGINE_ERROR_PREFIX = 'Something went wrong in the engine:';

export interface StepPipelineOptions {
  mission: Mission;
  detectors: RunLoopDetectors;
  recorder: RunLoopRecorder;
  stopRule(state: RunState): GiveUpReason | null;
  checkSuccess(): Promise<boolean>;
  /** Step limit. Defaults to MAX_STEPS (60); only tests lower it. */
  maxSteps?: number;
}

/** Order: detectors, success, stop rule, step limit. Returns null when the run goes on. */
export async function afterStep(o: StepPipelineOptions): Promise<RunLoopOutcome | null> {
  const current = o.recorder.last;
  if (!current) throw new Error('no Step was recorded');

  // 1. Detectors.
  const failure = await o.detectors.observe(current);
  if (failure) return { result: 'error', errorMessage: failure.thought };

  // 2. Success.
  if (await o.checkSuccess()) return { result: 'succeeded' };

  // 3. The Ghost's stop rule.
  const stopped = o.stopRule({
    steps: o.recorder.steps,
    findingCounts: o.detectors.findingCounts,
    mission: o.mission,
  });
  if (stopped) return { result: 'gave_up', reason: stopped };

  // 4. The Step limit.
  if (o.recorder.steps.length >= (o.maxSteps ?? MAX_STEPS)) return { result: 'gave_up', reason: 'step_limit' };

  return null;
}

/** Detectors' finish() unless the outcome is an error, then the closing sentence on the last Step. */
export async function closeRun(
  o: StepPipelineOptions,
  outcome: RunLoopOutcome,
  giveUpThought: (reason: GiveUpReason) => string,
): Promise<RunLoopOutcome> {
  let result = outcome;

  // The Detectors' end-of-Run checks are skipped when the Run already ended in an error.
  if (result.result !== 'error') {
    try {
      const failure = await o.detectors.finish();
      if (failure) result = { result: 'error', errorMessage: failure.thought };
    } catch (error) {
      result = { result: 'error', errorMessage: messageOf(error) };
    }
  }

  // The closing sentence on the last Step.
  if (result.result === 'gave_up' && result.reason) {
    try {
      const sentence = giveUpThought(result.reason).trim();
      if (sentence) o.recorder.appendToLastThought(sentence);
    } catch (error) {
      result = { result: 'error', errorMessage: messageOf(error) };
    }
  }
  if (result.result === 'error') {
    const message = result.errorMessage ?? 'unknown error';
    result = { result: 'error', errorMessage: message };
    o.recorder.appendToLastThought(engineErrorSentence(message));
  }

  return result;
}

/** "Something went wrong in the engine: <message>" */
export function engineErrorSentence(message: string): string {
  return `${ENGINE_ERROR_PREFIX} ${message}`;
}

/** The first non-empty line of an error's message, so a Playwright call log does not flood a thought. */
export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const line = raw.split(/\r?\n/).find((l) => l.trim() !== '');
  return line ? line.trim() : 'unknown error';
}
