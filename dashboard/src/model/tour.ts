// The 60-second tour (Req 22): the one place its stops are defined, and where each callout goes.
// Pure functions of the runs and of measured boxes, so both are easy to test.

import type { Run } from '../data/types';
import { coveragePath, exorcisePath, graveyardPath, homePath, stepPath } from '../routes';
import { groupHaunts } from './haunts';
import { ghostName } from './ghosts';
import { siteShortName } from './results';
import { ghostCamTarget } from './screens';

export interface TourStop {
  id: string;
  /** Router path of the screen this stop is on. */
  path: string;
  /** CSS selectors inside #main-content; the first that matches is the target. */
  targets: string[];
  title: string;
  /** One or two plain sentences (Req 22.2, 22.11). */
  body: string;
}

/** The eight Tour_Stops, or null when there are no runs (the tour is then unavailable). */
export function buildTour(runs: Run[]): TourStop[] | null {
  const cam = ghostCamTarget(runs);
  const haunt = groupHaunts(runs)[0];
  if (!cam || !haunt) return null;
  const camRun = runs.find((r) => r.key === cam.runKey)!;
  const name = ghostName(camRun.ghost);
  const listener = camRun.ghost === 'listener';
  const camPath = stepPath(cam.runKey, cam.step);
  const intro = '[data-screen-intro]';

  return [
    {
      id: 'results',
      path: homePath(),
      targets: ['[data-tour="results"]', intro],
      title: 'What the ghosts found',
      body: `Each card says in plain words what happened to one ghost on ${siteShortName(haunt.siteName)}. Press Watch it happen on a card to see that moment.`,
    },
    {
      id: 'shot',
      path: camPath,
      targets: ['[data-cam-area="shot"]'],
      title: 'What the page looked like',
      body: "The left side shows the page at this step of the visit. The glowing outline marks where the ghost's focus was.",
    },
    {
      id: 'panel',
      path: camPath,
      targets: ['[data-cam-area="panel"]'],
      title: listener ? `What ${name} heard` : `What ${name} was thinking`,
      body: listener
        ? `The right side shows what ${name}'s screen reader said at each step, with the newest line at the bottom.`
        : `The right side shows what ${name} was thinking at each step, with the newest line at the bottom.`,
    },
    {
      id: 'notice',
      path: camPath,
      targets: ['[data-cam-area="notice"]'],
      title: 'Where it got stuck',
      body: "This notice says in plain words where the ghost got stuck and why. Press Ask this ghost to hear it in the ghost's own words.",
    },
    {
      id: 'timeline',
      path: camPath,
      targets: ['[data-cam-area="timeline"]'],
      title: 'Every step of the visit',
      body: 'The timeline has one mark per step, and a tombstone marks each problem. Press any mark to jump to that step.',
    },
    {
      id: 'graveyard',
      path: graveyardPath(),
      targets: ['[data-tour="graveyard-views"]', intro],
      title: 'Every problem in one place',
      body: 'The Graveyard has one tombstone for each problem the ghosts found. Choose Map to see each page as a room instead.',
    },
    {
      id: 'exorcise',
      path: exorcisePath(),
      targets: ['[data-tour="exorcise-pickers"]', intro],
      title: 'Before and after a fix',
      body: 'When you fix your code and run the same ghost again, Exorcise compares the two runs. It shows which problems are gone and which still haunt the site.',
    },
    {
      id: 'coverage',
      path: coveragePath(),
      targets: ['[data-tour="coverage-table"]', intro],
      title: 'Which requirements people can reach',
      body: "Spec Coverage shows whether each ghost could complete each requirement. That's the tour, so explore on your own from here.",
    },
  ];
}

/** Sentences in a plain text: runs ending in ".", "!" or "?" followed by a space or the end. */
export function sentenceCount(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /[.!?]$/.test(s)).length;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type CalloutSide = 'below' | 'above' | 'right' | 'left' | 'center' | 'edge';

export const CALLOUT_MARGIN = 12;
export const CALLOUT_GAP = 12;
export const NARROW_VIEWPORT = 600;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where the callout goes (Req 22.5, 22.10). It always stays CALLOUT_MARGIN inside the viewport.
 * Narrow viewports get a full-width callout on the half away from the target. Otherwise it goes
 * below, above, right or left of the target, the first that fits without touching the target.
 * This places the callout only; `planTour` below also decides how far to scroll.
 */
export function placeCallout(
  target: Box | null,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number; side: CalloutSide } {
  const m = CALLOUT_MARGIN;
  const maxTop = viewport.height - size.height - m;
  const maxLeft = viewport.width - size.width - m;

  if (viewport.width < NARROW_VIEWPORT) {
    const targetCentre = target ? target.top + target.height / 2 : viewport.height;
    const top = targetCentre < viewport.height / 2 ? maxTop : m;
    return { top: clamp(top, m, maxTop), left: m, side: 'edge' };
  }

  if (!target) {
    return {
      top: clamp((viewport.height - size.height) / 2, m, maxTop),
      left: clamp((viewport.width - size.width) / 2, m, maxLeft),
      side: 'center',
    };
  }

  const g = CALLOUT_GAP;
  const fitsY = (top: number) => top >= m && top <= maxTop;
  const fitsX = (left: number) => left >= m && left <= maxLeft;
  const alignedLeft = clamp(target.left, m, maxLeft);
  const alignedTop = clamp(target.top, m, maxTop);

  const candidates: { top: number; left: number; side: CalloutSide }[] = [
    { top: target.top + target.height + g, left: alignedLeft, side: 'below' },
    { top: target.top - g - size.height, left: alignedLeft, side: 'above' },
    { top: alignedTop, left: target.left + target.width + g, side: 'right' },
    { top: alignedTop, left: target.left - g - size.width, side: 'left' },
  ];
  for (const c of candidates) if (fitsY(c.top) && fitsX(c.left)) return c;

  return { top: clamp(maxTop, m, maxTop), left: clamp(maxLeft, m, maxLeft), side: 'edge' };
}

/** The highlight sits this far outside its target: a 6 px gap and a 3 px outline. */
export const HIGHLIGHT_PAD = 9;
/** Free space kept between the highlight and the top and bottom edges of the viewport. */
export const EDGE_SPACE = 24;

export interface Size {
  width: number;
  height: number;
}

export interface TourPlanInput {
  /** The target's box in document coordinates (viewport box plus the scroll offset), or null. */
  target: Box | null;
  /**
   * The sizes the callout can take, most wanted first (it is taller and narrower, or shorter and
   * wider). The plan uses the first one that works best.
   */
  sizes: Size[];
  viewport: Size;
  scrollY: number;
  /** The largest scroll offset the page allows. */
  maxScrollY: number;
  /** How far down from the top of the viewport a fixed or sticky header reaches (0 if none). */
  topInset: number;
  /** Lines of text elsewhere on the page, in document coordinates. The callout avoids them where it can. */
  text?: Box[];
  /** False keeps the page where it is and only places the callout. */
  allowScroll: boolean;
}

export interface TourPlan {
  /** Where to scroll the page to. */
  scrollY: number;
  /** The callout's position in the viewport once the page has scrolled there. */
  top: number;
  left: number;
  side: CalloutSide;
  /** The callout's size: one of the sizes that were offered. */
  size: Size;
}

interface PlanOption {
  side: CalloutSide;
  /** Where the highlight may sit in the viewport: from `top` to `bottom`. */
  top: number;
  bottom: number;
  /** True when `top` only keeps clear of a header, so the very top of the page may go above it. */
  softTop: boolean;
  /** True when a highlight taller than the room may overflow, with its top shown. */
  allowTall: boolean;
  /** The callout's position, given the highlight's top edge in the viewport. */
  callout: (highlightTop: number) => { top: number; left: number };
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Overlap between the callout and other text is compared in buckets of this many square pixels. */
const TEXT_BUCKET = 1500;
const SIDE_RANK: Partial<Record<CalloutSide, number>> = { below: 0, above: 1, right: 2, left: 3 };

/**
 * Plans one tour stop: how far to scroll, and where the callout goes once the page is there.
 * The highlight ends up fully on screen with EDGE_SPACE around it and below any fixed header,
 * or with its top shown if it is taller than the room. The callout goes beside, above or below
 * the highlight, never over it, always inside the viewport. Of the placements that work, it picks
 * the one that covers the least other text, then follows the order below, above, right, left and
 * the order of `sizes`.
 */
export function planTour(input: TourPlanInput): TourPlan {
  const { target, sizes, viewport, scrollY, maxScrollY, topInset, text = [], allowScroll } = input;
  const first = sizes[0] ?? { width: 0, height: 0 };
  if (!target) return { scrollY, ...placeCallout(null, first, viewport), size: first };

  const m = CALLOUT_MARGIN;
  const g = CALLOUT_GAP;
  const pad = HIGHLIGHT_PAD;
  const hl: Box = { top: target.top - pad, left: target.left - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
  const topLimit = Math.max(0, topInset) + EDGE_SPACE;
  const bottomLimit = viewport.height - EDGE_SPACE;
  const maxScroll = Math.max(0, maxScrollY);
  const narrow = viewport.width < NARROW_VIEWPORT;

  /** The ways a callout of this size can sit by the highlight. */
  const optionsFor = (size: Size): PlanOption[] => {
    const maxLeft = viewport.width - size.width - m;
    const maxTop = viewport.height - size.height - m;
    const alignedLeft = clamp(hl.left, m, maxLeft);
    const visibleTop = (highlightTop: number) => clamp(highlightTop, m, maxTop);
    if (narrow) {
      // A full-width callout on the bottom or top edge, and the highlight in what is left.
      return [
        { side: 'edge', top: topLimit, bottom: maxTop - g, softTop: true, allowTall: false, callout: () => ({ top: maxTop, left: m }) },
        { side: 'edge', top: m + size.height + g, bottom: bottomLimit, softTop: false, allowTall: false, callout: () => ({ top: m, left: m }) },
      ];
    }
    const options: PlanOption[] = [
      {
        side: 'below',
        top: topLimit,
        bottom: maxTop - g,
        softTop: true,
        allowTall: false,
        callout: (t) => ({ top: t + hl.height + g, left: alignedLeft }),
      },
      {
        side: 'above',
        top: m + size.height + g,
        bottom: bottomLimit,
        softTop: false,
        allowTall: false,
        callout: (t) => ({ top: t - g - size.height, left: alignedLeft }),
      },
    ];
    if (hl.left + hl.width + g <= maxLeft) {
      options.push({
        side: 'right',
        top: topLimit,
        bottom: bottomLimit,
        softTop: true,
        allowTall: true,
        callout: (t) => ({ top: visibleTop(t), left: hl.left + hl.width + g }),
      });
    }
    if (hl.left - g - size.width >= m) {
      options.push({
        side: 'left',
        top: topLimit,
        bottom: bottomLimit,
        softTop: true,
        allowTall: true,
        callout: (t) => ({ top: visibleTop(t), left: hl.left - g - size.width }),
      });
    }
    return options;
  };

  /** Where the page scrolls to so the highlight sits in the option's room, or null if it cannot. */
  const fit = (option: PlanOption, strict: boolean): { scroll: number; highlightTop: number } | null => {
    const room = option.bottom - option.top;
    const tall = hl.height > room;
    if (strict && tall && !option.allowTall) return null;
    const wanted = tall ? option.top : clamp(hl.top - scrollY, option.top, option.bottom - hl.height);
    const scroll = allowScroll ? clamp(hl.top - wanted, 0, maxScroll) : scrollY;
    const highlightTop = hl.top - scroll;
    if (!strict) return { scroll, highlightTop };
    const topOk = highlightTop >= option.top - 0.5 || (option.softTop && scroll <= 0 && highlightTop >= 0);
    const bottomOk = tall ? highlightTop < option.bottom - 40 : highlightTop + hl.height <= option.bottom + 0.5;
    return topOk && bottomOk ? { scroll, highlightTop } : null;
  };

  const scored: { plan: TourPlan; tall: boolean; bucket: number; order: number; sizeIndex: number; distance: number }[] = [];
  for (const [sizeIndex, size] of sizes.entries()) {
    for (const [order, option] of optionsFor(size).entries()) {
      const found = fit(option, true);
      if (!found) continue;
      const spot = option.callout(found.highlightTop);
      const callout: Box = { top: spot.top, left: spot.left, width: size.width, height: size.height };
      let covered = 0;
      for (const line of text) covered += overlapArea({ ...line, top: line.top - found.scroll }, callout);
      scored.push({
        plan: { scrollY: found.scroll, top: spot.top, left: spot.left, side: option.side, size },
        tall: hl.height > option.bottom - option.top,
        bucket: Math.floor(covered / TEXT_BUCKET),
        order: SIDE_RANK[option.side] ?? order,
        sizeIndex,
        distance: Math.abs(found.scroll - scrollY),
      });
    }
  }
  if (scored.length > 0) {
    scored.sort(
      (a, b) =>
        Number(a.tall) - Number(b.tall) ||
        a.bucket - b.bucket ||
        a.order - b.order ||
        a.sizeIndex - b.sizeIndex ||
        a.distance - b.distance,
    );
    return scored[0]!.plan;
  }

  // Nothing fits (the highlight is taller than the room and there is no room beside it): show the
  // highlight's top and put the callout on the bottom edge, in the shortest size.
  const size = sizes.reduce((best, s) => (s.height < best.height ? s : best), first);
  const maxTop = viewport.height - size.height - m;
  const edge = fit(
    { side: 'edge', top: topLimit, bottom: maxTop - g, softTop: true, allowTall: true, callout: () => ({ top: maxTop, left: m }) },
    false,
  )!;
  const left = narrow ? m : clamp(hl.left, m, viewport.width - size.width - m);
  return { scrollY: edge.scroll, top: clamp(maxTop, m, maxTop), left, side: 'edge', size };
}
