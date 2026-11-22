import type { Mission } from '../missions/loadMission.ts';
import type { DetectorFailure } from './detectors.ts';
import type { Recorder } from './recorder.ts';
import { afterStep, closeRun, engineErrorSentence, messageOf } from './stepPipeline.ts';
import type { StepPipelineOptions } from './stepPipeline.ts';
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

// The per-step pipeline lives in stepPipeline.ts and is shared with the AI run driver.
export { ENGINE_ERROR_PREFIX, MAX_STEPS, engineErrorSentence } from './stepPipeline.ts';

/** The thought recorded with Step 1. */
export const OPENING_THOUGHT = "I'm opening the page.";

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
  const { body, mind, recorder, url } = options;
  const pipeline: StepPipelineOptions = options;

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
      // 1 to 4. Detectors, success, the Ghost's stop rule and the Step limit.
      const ended = await afterStep(pipeline);
      if (ended) return ended;

      // 5. Decide and act. The Mind gets the Perception only; the Probe stays with the engine.
      const { perception, probe } = await body.perceive();
      const decision = mind.decide(perception);
      if (decision.kind === 'give_up') return { result: 'gave_up', reason: decision.reason };

      const result = await body.act(decision.action);
      recorder.add(result, decision.thought, probe, {
        intentionId: decision.intentionId,
        recovery: decision.recovery === true,
      });
    }
  }

  // After the loop: the Detectors' end-of-Run checks and the closing sentence.
  return closeRun(pipeline, outcome, (reason) => mind.giveUpThought(reason));
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

