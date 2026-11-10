import type { Mission } from '../missions/loadMission.ts';
import type { DetectorFailure } from './detectors.ts';
import type { Recorder } from './recorder.ts';
import type { ActionResult, Body, FindingType, GiveUpReason, Mind, RecordedStep, RunState } from './types.ts';

/*
 * The run loop (design: "Run loop"; Requirements 5.8, 6.3, 6.9, 11.1 to 11.6).
 *
 * Order, after every recorded Step:
 *   1. Detectors observe the Step. A Detector failure ends the Run with `error`.
 *   2. The success check. This is the only place success is decided, and it wins even when
 *      the Step also produced Findings.
 *   3. The Ghost's stop rule (`trapped`, `slow_wait`, `misclicks`).
 *   4. The 60-Step limit.
 *   5. Otherwise: perceive, let the Mind decide (it gets the Perception and nothing else), act,
 *      and record the action as the next Step.
 *
 * Step 1 is always `body.open(url)`.
 *
 * After the loop the Detectors' `finish()` runs, then the closing sentence goes into the last
 * Step's thought:
 *   - `gave_up`: the Mind's Give_Up_Thought. The Mind receives only the reason code.
 *   - `error`:   "Something went wrong in the engine: <message>".
 *
 * Everything is injected through small interfaces, so the loop runs with fake Bodies, Minds,
 * Detectors and success checks and never needs a browser.
 */

/** Highest number of Steps in one Run (Requirement 6.9). */
export const MAX_STEPS = 60;

/** The thought recorded with Step 1. */
export const OPENING_THOUGHT = "I'm opening the page.";

/** Plain-words start of every engine error sentence. */
export const ENGINE_ERROR_PREFIX = 'Something went wrong in the engine:';

/** The part of the DetectorRunner the loop uses. */
export interface RunLoopDetectors {
  observe(afterStep: RecordedStep): Promise<DetectorFailure | null>;
  finish(): Promise<DetectorFailure | null>;
  /** Number of Findings so far, by type. */
  readonly findingCounts: Readonly<Partial<Record<FindingType, number>>>;
}

/** The part of the Recorder the loop uses. */
export type RunLoopRecorder = Pick<Recorder, 'add' | 'appendToLastThought' | 'steps' | 'last'>;

export interface RunLoopOptions<P, A> {
  body: Body<P, A>;
  mind: Mind<P, A>;
  /** The Ghost's stop rule: checked after the Detectors and the success check. */
  stopRule(state: RunState): GiveUpReason | null;
  detectors: RunLoopDetectors;
  recorder: RunLoopRecorder;
  mission: Mission;
  url: string;
  /**
   * The engine's only success decision. The CLI implements it as
   * `page.locator(mission.successCheck.visible).first().isVisible()` with a wait of at most 300 ms.
   */
  checkSuccess(): Promise<boolean>;
  /**
   * Called when `body.open(url)` throws. It may return an ActionResult for Step 1 (for example
   * a screenshot of Chromium's error page), which the loop records before ending the Run with
   * `error`. Returning `null`, or throwing, means no Step could be recorded.
   */
  onOpenFailure?(error: unknown): Promise<ActionResult | null> | ActionResult | null;
  /** Step limit. Defaults to MAX_STEPS (60); only tests lower it. */
  maxSteps?: number;
}

export interface RunLoopOutcome {
  result: 'succeeded' | 'gave_up' | 'error';
  /** Present when `result` is `gave_up`. */
  reason?: GiveUpReason;
  /** Present when `result` is `error`: the plain error message that went into the last Step's thought. */
  errorMessage?: string;
}

/**
 * Runs one Mission and returns how it ended.
 *
 * The function never throws for a failure of the Body, Mind, Detectors or success check: those end
 * the Run with `error`. When the page cannot be opened and no Step could be recorded
 * (`recorder.steps.length === 0` after the call), the outcome is still `{ result: 'error', errorMessage }`
 * and the CLI must turn it into exit code 1 without writing a Run, because a run file needs at
 * least one Step. When at least one Step exists, the Run is written with result `error`
 * (exit code 3).
 */
export async function runLoop<P, A>(options: RunLoopOptions<P, A>): Promise<RunLoopOutcome> {
  const { body, mind, detectors, recorder, mission, url } = options;
  const maxSteps = options.maxSteps ?? MAX_STEPS;

  let outcome: RunLoopOutcome;

  // Step 1: open the page.
  let opened: ActionResult | undefined;
  try {
    opened = await body.open(url);
  } catch (error) {
    return endAfterOpenFailure(options, error);
  }

  try {
    recorder.add(opened, OPENING_THOUGHT);
    outcome = await steps();
  } catch (error) {
    outcome = { result: 'error', errorMessage: messageOf(error) };
  }

  async function steps(): Promise<RunLoopOutcome> {
    for (;;) {
      const current = recorder.last;
      if (!current) throw new Error('no Step was recorded');

      // 1. Detectors.
      const failure = await detectors.observe(current);
      if (failure) return { result: 'error', errorMessage: failure.thought };

      // 2. Success.
      if (await options.checkSuccess()) return { result: 'succeeded' };

      // 3. The Ghost's stop rule.
      const stopped = options.stopRule({
        steps: recorder.steps,
        findingCounts: detectors.findingCounts,
        mission,
      });
      if (stopped) return { result: 'gave_up', reason: stopped };

      // 4. The Step limit.
      if (recorder.steps.length >= maxSteps) return { result: 'gave_up', reason: 'step_limit' };

      // 5. Decide and act. The Mind gets the Perception only; the Probe stays with the engine.
      const { perception, probe } = await body.perceive();
      const decision = mind.decide(perception);
      if (decision.kind === 'give_up') return { result: 'gave_up', reason: decision.reason };

      const result = await body.act(decision.action);
      recorder.add(result, decision.thought, probe);
    }
  }

  // After the loop: the Detectors' end-of-Run checks. They are skipped when the Run already ended
  // in an error, because the browser may be gone.
  if (outcome.result !== 'error') {
    try {
      const failure = await detectors.finish();
      if (failure) outcome = { result: 'error', errorMessage: failure.thought };
    } catch (error) {
      outcome = { result: 'error', errorMessage: messageOf(error) };
    }
  }

  // The closing sentence on the last Step.
  if (outcome.result === 'gave_up' && outcome.reason) {
    try {
      const sentence = mind.giveUpThought(outcome.reason).trim();
      if (sentence) recorder.appendToLastThought(sentence);
    } catch (error) {
      outcome = { result: 'error', errorMessage: messageOf(error) };
    }
  }
  if (outcome.result === 'error') {
    const message = outcome.errorMessage ?? 'unknown error';
    outcome = { result: 'error', errorMessage: message };
    recorder.appendToLastThought(engineErrorSentence(message));
  }

  return outcome;
}

/**
 * `body.open` threw. If the caller can supply a Step 1 (Chromium's error page), record it so the
 * Run can be written with result `error`; otherwise report the error with no Step recorded.
 */
async function endAfterOpenFailure<P, A>(options: RunLoopOptions<P, A>, error: unknown): Promise<RunLoopOutcome> {
  const message = messageOf(error);
  let fallback: ActionResult | null = null;
  try {
    fallback = (await options.onOpenFailure?.(error)) ?? null;
  } catch {
    fallback = null;
  }
  if (fallback) {
    try {
      options.recorder.add(fallback, OPENING_THOUGHT);
      options.recorder.appendToLastThought(`I couldn't open the page. ${engineErrorSentence(message)}`);
    } catch {
      // Nothing was recorded; the CLI sees recorder.steps.length === 0.
    }
  }
  return { result: 'error', errorMessage: message };
}

/** "Something went wrong in the engine: <message>" */
export function engineErrorSentence(message: string): string {
  return `${ENGINE_ERROR_PREFIX} ${message}`;
}

/** The first non-empty line of an error's message, so a Playwright call log does not flood a thought. */
function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const line = raw.split(/\r?\n/).find((l) => l.trim() !== '');
  return line ? line.trim() : 'unknown error';
}
