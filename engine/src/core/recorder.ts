import type { FocusBox, Step } from '../contract/types.ts';
import type { ActionResult, Box, Probe, RecordedStep, RecorderViewport, StepIntention, StepTrace } from './types.ts';

// The shared core types now live in ./types.ts. They are re-exported so that
// existing imports from './recorder.ts' keep working.
export type { ActionResult, Box, Probe, RecordedStep, RecorderViewport, StepIntention, StepTrace };

export type ShotKind = 'step' | 'seen';

/** Highest Step number that fits the three-digit `shots/NNN.png` names. */
const MAX_STEP_NUMBER = 999;

/** `shots/NNN.png` or `shots/NNN-seen.png` for Step `n`. */
export function shotPath(n: number, kind: ShotKind = 'step'): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX_STEP_NUMBER) {
    throw new RangeError(`Step number ${n} cannot be used in a screenshot name.`);
  }
  const nnn = String(n).padStart(3, '0');
  return kind === 'seen' ? `shots/${nnn}-seen.png` : `shots/${nnn}.png`;
}

/** Whole milliseconds from the end of the action until the ghost was ready; never negative. */
export function computeWaitMs(actionEndedAt: number, readyAt: number): number {
  const wait = Math.round(readyAt - actionEndedAt);
  return Number.isFinite(wait) && wait > 0 ? wait : 0;
}

/**
 * Converts a CSS-px box to screenshot pixels. Returns `undefined` (so the caller
 * leaves `focusBox` out) when there is no box, the box has no area, or the box
 * lies entirely outside the viewport. A box that is partly inside is cut to the
 * viewport, so every recorded `focusBox` lies inside the screenshot.
 */
export function toFocusBox(box: Box | null | undefined, viewport: RecorderViewport): FocusBox | undefined {
  if (!box) return undefined;
  const { x, y, w, h } = box;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return undefined;

  const left = Math.max(x, 0);
  const top = Math.max(y, 0);
  const right = Math.min(x + w, viewport.width);
  const bottom = Math.min(y + h, viewport.height);
  if (right <= left || bottom <= top) return undefined;

  const scale = viewport.deviceScaleFactor;
  return {
    x: left * scale,
    y: top * scale,
    w: (right - left) * scale,
    h: (bottom - top) * scale,
  };
}

/** Holds the Steps and screenshots of one Run in memory until the Run ends. */
export class Recorder {
  private readonly recorded: RecordedStep[] = [];
  private readonly shots = new Map<string, Buffer>();
  private readonly viewport: RecorderViewport;

  constructor(viewport: RecorderViewport) {
    this.viewport = viewport;
  }

  /** Every Step so far, with its trace and probe, in order. */
  get steps(): readonly RecordedStep[] {
    return this.recorded;
  }

  /** The most recent Step, if any. */
  get last(): RecordedStep | undefined {
    return this.recorded[this.recorded.length - 1];
  }

  /**
   * Records one action as the next Step. `probe` is the data captured with the
   * Perception the decision was based on, and `intention` the Intention the decision
   * was for; Step 1 (opening the page) has neither.
   */
  add(result: ActionResult, thought: string, probe?: Probe, intention?: StepIntention): RecordedStep {
    const n = this.recorded.length + 1;
    const screenshot = shotPath(n);
    const { trace } = result;

    const step: Step = {
      n,
      // Step 1 opens the page, so it uses the path after loading.
      page: n === 1 ? trace.pathAfter : trace.pathBefore,
      action: result.actionText,
      spoken: result.spoken,
      thought,
      screenshot,
      waitMs: computeWaitMs(trace.actionEndedAt, trace.readyAt),
    };
    const focusBox = toFocusBox(result.focusBox, this.viewport);
    if (focusBox) step.focusBox = focusBox;

    const entry: RecordedStep = { step, trace, probe: probe ?? { at: trace.readyAt } };
    if (intention) entry.intention = { intentionId: intention.intentionId, recovery: intention.recovery };
    this.recorded.push(entry);
    this.shots.set(screenshot, result.screenshot);
    if (result.seenScreenshot) this.shots.set(shotPath(n, 'seen'), result.seenScreenshot);
    return entry;
  }

  /** Adds text to the last Step's thought (used for the give-up sentence and engine errors). */
  appendToLastThought(text: string): void {
    const last = this.last;
    if (!last) return;
    last.step.thought = last.step.thought ? `${last.step.thought} ${text}` : text;
  }

  /** The Steps as they go into the run file. */
  toSteps(): Step[] {
    return this.recorded.map((r) => ({ ...r.step, ...(r.step.focusBox ? { focusBox: { ...r.step.focusBox } } : {}) }));
  }

  /** Tells whether a seen screenshot was kept for Step `n`. */
  hasSeenScreenshot(n: number): boolean {
    return this.shots.has(shotPath(n, 'seen'));
  }

  /** The PNG for a file name such as `shots/003.png`, or `undefined`. */
  screenshotByName(name: string): Buffer | undefined {
    return this.shots.get(name);
  }

  /**
   * The files to write, keyed by run-relative name: every Step screenshot, plus the
   * seen screenshots whose names are in `referencedSeen` (the ones a Finding refers to).
   */
  filesToWrite(referencedSeen: Iterable<string> = []): Map<string, Buffer> {
    const files = new Map<string, Buffer>();
    for (const { step } of this.recorded) {
      const png = this.shots.get(step.screenshot);
      if (png) files.set(step.screenshot, png);
    }
    for (const name of referencedSeen) {
      const png = this.shots.get(name);
      if (png && /^shots\/\d{3}-seen\.png$/.test(name)) files.set(name, png);
    }
    return files;
  }
}
