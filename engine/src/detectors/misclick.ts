import { shotPath } from '../core/recorder.ts';
import type { Box, DetectedProblem, Detector, DetectorContext, RecordedStep } from '../core/types.ts';
import type { LayoutShiftEntry } from '../page/layoutShifts.ts';

/*
 * The `misclick` Detector (Requirements 15.3 and 15.4; design "The Phantom / Detectors").
 *
 * For a click Step it compares the element the ghost aimed at with the element that received the
 * click:
 *
 *   aimed   `probe.itemKeys[trace.click.aimedItem]`: the element key of the interactive element under
 *           the aimed Seen_Item's centre at the moment of the Perception (the Step's probe is the one
 *           taken with the Sight the click was based on).
 *   hit     `trace.click.hitKey`: the element key the click log recorded when the click arrived.
 *
 * When both are known and differ, it records one Finding with the key `click-<n>` on that Step. When
 * either is unknown (no element keys on the page, or the click log was lost with a replaced document)
 * nothing is measured, so nothing is recorded.
 *
 * Evidence states the measured facts: the intended and the hit element by visible text, where the
 * aimed item was seen, how long after the Perception the click landed, every layout-shift entry whose
 * `startTime` lies in `[probe.at, click.at + 100]` (its value and, per moved element, the previous and
 * current box), and both screenshots. The Finding's screenshot is the seen one (`shots/NNN-seen.png`).
 *
 * The layout shifts are read with one read-only `inspect` call into the engine's own buffer
 * (`page/layoutShifts.ts`). The Detector runs right after the Step, in the same document, unless the
 * click replaced it; when the page's clock is earlier than the click time, the document is a new one
 * and its shifts are not the ones in between, so none are listed and the evidence says so.
 *
 * The Detector keeps no state between Steps; the same Step always gives the same Finding.
 */

/** Shifts up to this long after the click are still listed (design: `click.at + 100`). */
export const SHIFT_WINDOW_AFTER_CLICK_MS = 100;

/** The facts of one misclick, measured from a recorded Step. */
export interface Misclick {
  stepN: number;
  aimedKey: string;
  hitKey: string;
  aimedText: string;
  hitText: string | null;
  aimed: Box;
  /** Page clock of the Perception and of the click, ms. */
  seenAt: number;
  clickAt: number;
}

/**
 * The misclick of a recorded Step, or `null` when it is not a click Step, when the aimed or the hit
 * element is unknown, or when the click landed on the aimed element. Pure; the stop rule may use it.
 */
export function misclickOf(recorded: RecordedStep): Misclick | null {
  const click = recorded.trace.click;
  if (!click || click.aimedItem === undefined) return null;
  const aimedKey = recorded.probe.itemKeys?.[click.aimedItem];
  if (typeof aimedKey !== 'string' || click.hitKey === null) return null;
  if (aimedKey === click.hitKey) return null;
  return {
    stepN: recorded.step.n,
    aimedKey,
    hitKey: click.hitKey,
    aimedText: click.aimedText ?? '',
    hitText: click.hitText ?? null,
    aimed: click.aimed,
    seenAt: recorded.probe.at,
    clickAt: click.at,
  };
}

/** What the page-side read returns. */
interface ShiftReport {
  /** The document's `performance.now()` when read. */
  now: number;
  entries: LayoutShiftEntry[];
}

/** Read-only: the engine's buffered layout shifts in `[from, to]` and the page clock. */
const READ_SHIFTS_SCRIPT = String.raw`(arg) => ({
  now: performance.now(),
  entries: window.__haunt && window.__haunt.shifts ? window.__haunt.shifts.since(arg.from, arg.to) : [],
})`;

function px(n: number): string {
  return String(Math.round(n));
}

function describeBox(box: Box): string {
  return `x ${px(box.x)}, y ${px(box.y)}, ${px(box.w)}×${px(box.h)}`;
}

function shiftValue(value: number): string {
  return String(Number(value.toFixed(4)));
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

function named(text: string | null, fallback: string): string {
  return text !== null && text.trim() !== '' ? `"${text}"` : fallback;
}

/** What moved in one entry, for example `"Pay this bill" moved from x 16, y 170, 132×48 to x 16, y 290, 132×48`. */
function describeMoves(entry: LayoutShiftEntry): string {
  if (entry.sources.length === 0) return 'no moved element was reported';
  return entry.sources
    .map(
      (s) =>
        `${named(s.text, s.tag ? `a <${s.tag}> with no text` : 'an element with no text')} moved from ` +
        `${describeBox(s.previousRect)} to ${describeBox(s.currentRect)}`,
    )
    .join('; ');
}

function describeShifts(entries: readonly LayoutShiftEntry[] | null, clickAt: number): string {
  if (entries === null) {
    return 'The click replaced the page, so the layout shifts in between could not be read.';
  }
  if (entries.length === 0) return 'No layout shift was recorded in between.';
  const when = (e: LayoutShiftEntry): string => (e.startTime > clickAt ? ', just after the click' : '');
  if (entries.length === 1) {
    const e = entries[0]!;
    return `A layout shift of ${shiftValue(e.value)} happened in between${when(e)}: ${describeMoves(e)}.`;
  }
  const listed = entries.map((e, i) => `(${i + 1}) ${shiftValue(e.value)}${when(e)}: ${describeMoves(e)}`);
  return `${entries.length} layout shifts happened in between: ${listed.join('. ')}.`;
}

/** The Finding's evidence text for a misclick and the shifts read for it (`null`: not readable). */
export function misclickEvidence(m: Misclick, shifts: readonly LayoutShiftEntry[] | null): string {
  const aimed = named(m.aimedText, 'an item with no visible text');
  const hit = named(m.hitText, 'an element with no visible text');
  return (
    `Aimed at ${aimed} (seen at ${describeBox(m.aimed)}). ` +
    `${seconds(m.clickAt - m.seenAt)} later the click landed on ${hit}. ` +
    `${describeShifts(shifts, m.clickAt)} ` +
    `Before: ${shotPath(m.stepN, 'seen')}. After: ${shotPath(m.stepN)}.`
  );
}

async function readShifts(ctx: DetectorContext, m: Misclick): Promise<LayoutShiftEntry[] | null> {
  const report = await ctx.inspect<ShiftReport>(READ_SHIFTS_SCRIPT, {
    from: m.seenAt,
    to: m.clickAt + SHIFT_WINDOW_AFTER_CLICK_MS,
  });
  if (typeof report?.now !== 'number' || report.now < m.clickAt) return null;
  return Array.isArray(report.entries) ? [...report.entries].sort((a, b) => a.startTime - b.startTime) : [];
}

/** Creates the `misclick` Detector. */
export function createMisclickDetector(): Detector {
  return {
    type: 'misclick',

    async observe(ctx) {
      const m = misclickOf(ctx.current);
      if (!m) return [];
      const shifts = await readShifts(ctx, m);
      const problem: DetectedProblem = {
        key: `click-${m.stepN}`,
        stepN: m.stepN,
        title: 'The click landed on a different element than the one aimed at',
        evidence: misclickEvidence(m, shifts),
        screenshot: 'seen',
      };
      return [problem];
    },
  };
}
