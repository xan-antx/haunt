import type { DetectedProblem, Detector, RecordedStep, StepTrace } from '../core/types.ts';

/*
 * The `slow_wait` Detector (Requirements 15.1 and 15.2).
 *
 * It records a Finding when, while The Phantom was waiting, more than 10 000 ms passed with no
 * visible sign of progress.
 *
 * What it reads: the waiting spans that the visual Body records in `StepTrace.waits`, one per Settle
 * and one per wait action. Each span has `from` and `to`, the times of the signs of progress seen in
 * it (`progress`: Page_Change_Clock changes and moments a loading indicator was visible), and
 * `loadingUntil`, the last time in the span at which the page's `load` event had not fired yet. While
 * `load` is pending the browser shows its own loading bar, so the stretch from the span's start to
 * `loadingUntil` counts as progress throughout.
 *
 * How spans are joined:
 *   - A waiting chain starts with the Settle of any Step (the Step whose action led to the page) and
 *     goes on through the Steps right after it whose action is a wait (`Step.action` is `Wait`, the
 *     visual Body's text for the wait action). Any other action (a click, typing, a scroll, Back) ends
 *     the chain: the Ghost was doing something, not waiting.
 *   - All times of one Step are on one timeline (the page clock at the end of its action plus the real
 *     time since), so spans of the same Step are joined by their real gap.
 *   - Each Step has its own timeline, so the gap between the last span of one Step and the first span
 *     of the next (the time spent recording, looking and deciding to wait again) is only counted when
 *     it can be measured: when the next Step's first span starts 0 to 5000 ms after the previous
 *     Step's last span ends on the same clock. When the document was replaced, the two clocks differ
 *     (the new page clock starts again near 0, so the difference is negative) and the gap is counted
 *     as 0. A measured gap is never longer than the real one, so the Detector never overstates a wait.
 *   - Inside the chain, a quiet stretch runs from the chain's start, or from the last sign of progress,
 *     to the next sign of progress or the chain's end. A stretch longer than 10 000 ms is a slow wait.
 *
 * The Finding comes from `observe()`, at the Step during which the stretch passed 10 s, so that The
 * Phantom's stop rule sees it in the same loop iteration. Its key is `wait-<start step>`, so the same
 * wait is recorded once. The evidence gives the length in seconds (up to the end of the latest Step,
 * when nothing has changed yet), the Steps, and the first 80 characters of text visible in the viewport.
 *
 * Everything here only reads: the one page read is a pure text read. The timing decisions depend only
 * on the Step history, so the same history always gives the same Findings. Create a new Detector for
 * each Run with `createSlowWaitDetector()`: it remembers which waits it has already reported.
 */

/** A quiet stretch longer than this is a slow wait (Requirement 15.1). */
export const SLOW_WAIT_MS = 10_000;

/** The longest gap between two Steps' spans that is counted as waiting time. */
export const MAX_STEP_GAP_MS = 5000;

/** The visual Body's `Step.action` text for the wait action. */
export const WAIT_ACTION_TEXT = 'Wait';

type WaitSpan = StepTrace['waits'][number];

/** A quiet stretch of more than `SLOW_WAIT_MS` found in the Step history. */
export interface SlowWait {
  /** The Step in which the stretch began. */
  startStep: number;
  /** The Step during which the stretch passed the threshold. */
  passedStep: number;
  /** The Step in which the stretch ended, or the latest Step when it has not ended. */
  endStep: number;
  /** Length of the stretch, ms (up to the end of the latest Step when it has not ended). */
  lengthMs: number;
  /**
   * How it ended: a sign of progress, an action other than a wait, or not yet (nothing has changed up
   * to the end of the latest Step).
   */
  end: 'progress' | 'action' | 'ongoing';
}

/** One waiting chain while it is being walked. Positions are ms since the chain's start. */
interface Chain {
  /** Position of the end of the latest span. */
  pos: number;
  /** `to` of the latest span, on its Step's timeline. */
  prevTo: number;
  prevStep: number;
  /** Where the current quiet stretch began, and in which Step. */
  runStart: number;
  runStartStep: number;
  /** Where each Step's share of the chain begins (including the gap before its first span). */
  marks: { step: number; from: number }[];
}

function isWaitStep(recorded: RecordedStep): boolean {
  return recorded.step.action === WAIT_ACTION_TEXT;
}

function usable(span: WaitSpan): boolean {
  return Number.isFinite(span.from) && Number.isFinite(span.to) && span.to >= span.from;
}

/**
 * Finds every quiet stretch of more than `thresholdMs` in the Step history, in order. Pure: the result
 * depends only on the Steps' actions and wait spans.
 */
export function findSlowWaits(steps: readonly RecordedStep[], thresholdMs: number = SLOW_WAIT_MS): SlowWait[] {
  const found: SlowWait[] = [];
  let chain: Chain | null = null;

  const stretch = (c: Chain, at: number, endStep: number, end: SlowWait['end']): void => {
    const lengthMs = at - c.runStart;
    if (lengthMs <= thresholdMs) return;
    const passedAt = c.runStart + thresholdMs;
    let passedStep = c.runStartStep;
    for (const mark of c.marks) if (mark.from <= passedAt && mark.step >= c.runStartStep) passedStep = mark.step;
    found.push({ startStep: c.runStartStep, passedStep: Math.min(passedStep, endStep), endStep, lengthMs, end });
  };

  /** A sign of progress at `at`: ends the current stretch and starts a new one there. */
  const progress = (c: Chain, at: number, step: number): void => {
    if (at <= c.runStart) return;
    stretch(c, at, step, 'progress');
    c.runStart = at;
    c.runStartStep = step;
  };

  for (const recorded of steps) {
    const n = recorded.step.n;
    const spans = recorded.trace.waits.filter(usable);

    if (chain !== null && !(isWaitStep(recorded) && spans.length > 0)) {
      stretch(chain, chain.pos, chain.prevStep, 'action');
      chain = null;
    }

    for (const span of spans) {
      if (chain === null) {
        chain = { pos: 0, prevTo: span.from, prevStep: n, runStart: 0, runStartStep: n, marks: [{ step: n, from: 0 }] };
      } else {
        const gap = span.from - chain.prevTo;
        if (chain.prevStep !== n) chain.marks.push({ step: n, from: chain.pos });
        if (chain.prevStep === n) chain.pos += Math.max(0, gap);
        else chain.pos += gap >= 0 && gap <= MAX_STEP_GAP_MS ? gap : 0;
      }

      // Chain position of a time on this span's timeline.
      const base = chain.pos - span.from;
      if (span.loadingUntil !== null) {
        const until = Math.min(Math.max(span.loadingUntil, span.from), span.to);
        progress(chain, base + span.from, n);
        progress(chain, base + until, n);
      }
      for (const p of [...span.progress].sort((a, b) => a - b)) {
        if (p >= span.from && p <= span.to) progress(chain, base + p, n);
      }

      chain.pos = base + span.to;
      chain.prevTo = span.to;
      chain.prevStep = n;
    }
  }

  if (chain !== null) stretch(chain, chain.pos, chain.prevStep, 'ongoing');
  return found;
}

/**
 * Page-side: the first 200 characters of text visible in the viewport, in document order. Plain
 * JavaScript in a string so that no transpiler helper can leak into the page. Pure reads only (a
 * Range is created to measure text; it is not attached to anything and does not change the page).
 */
const READ_SCREEN_TEXT_SCRIPT = String.raw`(function () {
  if (!document.body) return '';
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var SKIP = { script: 1, style: 1, noscript: 1, template: 1 };
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var range = document.createRange();
  var out = '';
  var node;
  var seen = 0;
  while ((node = walker.nextNode()) && out.length < 200 && seen < 5000) {
    seen += 1;
    var text = node.nodeValue;
    if (!text || !/\S/.test(text)) continue;
    var el = node.parentElement;
    if (!el || SKIP[el.localName] === 1) continue;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    } else {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
    }
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    var shown = false;
    for (var i = 0; i < rects.length && !shown; i += 1) {
      var r = rects[i];
      if (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh) shown = true;
    }
    if (shown) out += ' ' + text;
  }
  return out.replace(/\s+/g, ' ').trim();
})`;

/** The first 80 characters (code points) of the screen text. */
function first80(text: string): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length > 80 ? `${chars.slice(0, 80).join('')}…` : chars.join('');
}

function seconds(ms: number): string {
  return (Math.floor(ms / 100) / 10).toFixed(1);
}

/** The Finding's evidence, for example the one in the design's slow_wait section. */
export function slowWaitEvidence(wait: SlowWait, screenText: string | null): string {
  const where =
    wait.startStep === wait.endStep ? `at step ${wait.startStep}` : `from step ${wait.startStep} to step ${wait.endStep}`;
  const parts = [
    `Waited ${seconds(wait.lengthMs)} seconds ${where} with nothing changing on the screen and no loading sign ` +
      '(no change on the page, no visible loading indicator, and the page had finished loading).',
  ];
  if (wait.end === 'ongoing') parts.push(`Nothing had changed by the end of step ${wait.endStep}.`);
  if (wait.end === 'progress') parts.push(`The first sign of progress came at step ${wait.endStep}.`);
  if (screenText === null) parts.push('The text on the screen could not be read.');
  else if (screenText === '') parts.push('The screen showed no text.');
  else parts.push(`The screen showed: "${first80(screenText)}"`);
  return parts.join(' ');
}

/**
 * Creates the `slow_wait` Detector. Make a new one for each Run: it remembers which waits it has
 * already reported.
 */
export function createSlowWaitDetector(): Detector {
  const reported = new Set<string>();

  return {
    type: 'slow_wait',

    async observe(ctx) {
      const upTo = ctx.current.step.n;
      const steps = ctx.steps.filter((s) => s.step.n <= upTo);
      if (!steps.some((s) => s.step.n === upTo)) steps.push(ctx.current);

      const fresh = findSlowWaits(steps).filter((w) => !reported.has(`wait-${w.startStep}`));
      if (fresh.length === 0) return [];

      let screenText: string | null;
      try {
        screenText = await ctx.inspect<string>(READ_SCREEN_TEXT_SCRIPT);
        if (typeof screenText !== 'string') screenText = null;
      } catch {
        screenText = null; // the document is being replaced; the timing evidence still stands
      }

      const problems: DetectedProblem[] = [];
      for (const wait of fresh) {
        const key = `wait-${wait.startStep}`;
        if (reported.has(key)) continue;
        reported.add(key);
        problems.push({
          key,
          stepN: wait.passedStep,
          title: 'Long wait with no sign of progress',
          evidence: slowWaitEvidence(wait, screenText),
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
