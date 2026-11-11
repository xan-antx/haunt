import type { GiveUpReason, RecordedStep, RunState } from '../../core/types.ts';
import { misclickOf } from '../../detectors/misclick.ts';

/*
 * The Phantom's stop rules (Requirements 16.1 and 16.2; design "The Phantom / Stop rules").
 *
 * The run loop checks the Detectors first, then the success check, then this rule, so the Run only
 * gets here when the Mission has not succeeded.
 *
 *   slow_wait   The `slow_wait` Detector records its Finding from `observe()` on the Step where the
 *               stretch with nothing changing passed 10 s. The first time the count is above 0 is
 *               therefore the iteration of that Step, and the Run ends there.
 *   misclicks   `misclickStreak(steps)` reaches 2.
 *
 * When both apply at the same Step, `slow_wait` is reported, in the design's order.
 */

/** The Misclick_Streak at which the Run ends (Requirement 16.2). */
export const MISCLICK_STREAK_LIMIT = 2;

/**
 * Whether a click Step landed on the element it aimed at. Both keys must be known: a click whose aimed
 * or hit element could not be measured is neither a misclick nor a correct click.
 */
function isCorrectClick(recorded: RecordedStep): boolean {
  const click = recorded.trace.click;
  if (!click || click.aimedItem === undefined || click.hitKey === null) return false;
  const aimedKey = recorded.probe.itemKeys?.[click.aimedItem];
  return typeof aimedKey === 'string' && aimedKey === click.hitKey;
}

/**
 * The Misclick_Streak after the latest Step: misclicks in a row while trying the current Intention,
 * without a correct click on that Intention in between.
 *
 * The current Intention is the one of the latest Step. Its Steps are the run of Steps at the end of the
 * Run made for that Intention. Walking their click Steps in order:
 *   - a recovery click (Decision marked `recovery: true`) leaves the count unchanged, even when it
 *     missed, because it is not a click on the Intention's target;
 *   - a misclick (`misclickOf`) adds 1;
 *   - a correct click on the target resets the count to 0;
 *   - a click that could not be measured leaves the count unchanged.
 * Steps that are not clicks (typing, scrolling, waiting, Back) do not count.
 */
export function misclickStreak(steps: readonly RecordedStep[]): number {
  const current = steps[steps.length - 1]?.intention?.intentionId;
  if (current === undefined) return 0;

  let start = steps.length;
  while (start > 0 && steps[start - 1]!.intention?.intentionId === current) start--;

  let count = 0;
  for (let i = start; i < steps.length; i++) {
    const recorded = steps[i]!;
    if (!recorded.trace.click || recorded.intention?.recovery) continue;
    if (misclickOf(recorded) !== null) count++;
    else if (isCorrectClick(recorded)) count = 0;
  }
  return count;
}

/** The Phantom's stop rule: `slow_wait`, then `misclicks`, else `null`. */
export function phantomStopRule(state: RunState): GiveUpReason | null {
  if ((state.findingCounts.slow_wait ?? 0) > 0) return 'slow_wait';
  if (misclickStreak(state.steps) >= MISCLICK_STREAK_LIMIT) return 'misclicks';
  return null;
}
