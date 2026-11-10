import type { GiveUpReason, RunState } from '../../core/types.ts';

/*
 * The Listener's stop rule (Requirement 11.1; design "Detectors > Stop rule").
 *
 * The run loop checks the Detectors first, then the success check, then this rule. So by the time
 * this rule runs, success has already been decided: the Run only gets here when the Mission has not
 * succeeded. The rule therefore only needs the Finding count: once the `focus_trap` Detector has
 * recorded a Finding, The Listener is stuck in a dialog and the Run ends with `trapped`.
 *
 * For the count to be up to date in the same loop iteration, the `focus_trap` Detector records its
 * Finding from `observe()` (see `src/detectors/focusTrap.ts`).
 *
 * The rule lives here, next to the Listener, so the Listener's Ghost (task 12) can use it as its
 * `stopRule`. `src/detectors/focusTrap.ts` re-exports it for code that thinks of it as part of the
 * focus_trap feature.
 */
export function listenerStopRule(state: RunState): GiveUpReason | null {
  return (state.findingCounts.focus_trap ?? 0) > 0 ? 'trapped' : null;
}
