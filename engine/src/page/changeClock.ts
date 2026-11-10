import type { InspectablePage } from '../core/detectors.ts';

/*
 * The Page_Change_Clock (Requirement 8.4, design "Page_Change_Clock").
 *
 * `CHANGE_CLOCK_SOURCE` is installed with `page.addInitScript`, so it runs before any script of the
 * page, in every frame. It keeps one number per document: `lastChange`, the `performance.now()` time
 * (ms) of the most recent change on the page. A change is:
 *
 *   - a DOM change in a rendered element (MutationObserver on `document`: child lists, attributes and
 *     character data). Changes inside `head`, `script`, `style`, `noscript`, `template` and inside
 *     elements that have no box (`display: none`) are ignored. A style, class, hidden or open change on
 *     an element that has no box still counts, because that is how an element is hidden or shown;
 *   - a layout shift (PerformanceObserver `layout-shift`). This also covers changes the MutationObserver
 *     cannot see, such as a CSS rule inserted through the CSSOM or a web font arriving;
 *   - an image finishing loading (capture-phase `load` or `error` on an `img`);
 *   - a running CSS animation or transition. It is sampled when the clock is read
 *     (`document.getAnimations()`), and the start, end and cancel events are caught too, so an animation
 *     that runs and ends between two reads still counts.
 *
 * The script only observes. It never changes the DOM, focus, scroll or any value of the page, and
 * reading the clock does not move it. It can be installed twice (the second run does nothing) and in
 * every frame; it never throws into the page.
 *
 * Time is per document: a new document starts a new clock. Compare `lastChange` only with the `now`
 * of the same read, never across navigations.
 *
 * Only the Body and the Detectors read the clock. No Mind receives it.
 */

/** What one read of the clock returns. All times are `performance.now()` milliseconds of that document. */
export interface ChangeClockState {
  /** The time of this read. */
  now: number;
  /** The time of the most recent change. Equal to `now` while a CSS animation is running. */
  lastChange: number;
  /** True when a CSS animation or transition is running on a rendered element. */
  animating: boolean;
  /** How many changes have been recorded since the document started (animation sampling is not counted). */
  changes: number;
}

/** The page-side expression that reads the clock, or gives `null` when the script is not installed. */
export const READ_CHANGE_CLOCK_EXPRESSION =
  '(window.__haunt && window.__haunt.clock ? window.__haunt.clock.read() : null)';

/**
 * Source of the Page_Change_Clock script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper (for example esbuild's `__name`) can leak into the page.
 */
export const CHANGE_CLOCK_SOURCE: string = String.raw`(function () {
  'use strict';
  try {
    var w = window;
    var ns = w.__haunt;
    if (ns === undefined) {
      ns = {};
      w.__haunt = ns;
    } else if (ns === null || typeof ns !== 'object') {
      return;
    }
    if (ns.clock) return;

    var perfNow = w.performance.now.bind(w.performance);
    var NOT_RENDERED_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1, BASE: 1 };
    var VISIBILITY_ATTRIBUTES = { style: 1, class: 1, hidden: 1, open: 1 };
    var ANIMATION_EVENTS = ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'];
    var state = { lastChange: perfNow(), changes: 0 };

    function touch(at) {
      var t = perfNow();
      if (at !== undefined && at < t) t = at;
      if (t > state.lastChange) state.lastChange = t;
      state.changes += 1;
    }

    function elementOf(node) {
      if (node.nodeType === 1) return node;
      if (node.parentElement) return node.parentElement;
      var root = node.getRootNode ? node.getRootNode() : null;
      return root && root.host ? root.host : null;
    }

    function inNonRenderedTag(el) {
      for (var e = el, i = 0; e && i < 500; i += 1, e = e.parentElement) {
        if (NOT_RENDERED_TAGS[String(e.tagName).toUpperCase()] === 1) return true;
      }
      return false;
    }

    // An element is rendered when it has a box. A display: contents element has none of its own, so
    // its nearest ancestor with a box is used instead.
    function isRendered(el) {
      for (var e = el, i = 0; e && i < 50; i += 1) {
        if (e.getClientRects().length > 0) return true;
        if (w.getComputedStyle(e).display !== 'contents') return false;
        e = e.parentElement;
      }
      return false;
    }

    function isRelevant(record) {
      var target = record.target;
      if (target.nodeType === 9) return true;
      var el = elementOf(target);
      if (!el) return false;
      if (inNonRenderedTag(el)) return false;
      if (isRendered(el)) return true;
      return record.type === 'attributes' && VISIBILITY_ATTRIBUTES[record.attributeName] === 1;
    }

    try {
      var mutations = new w.MutationObserver(function (records) {
        try {
          for (var i = 0; i < records.length; i += 1) {
            if (isRelevant(records[i])) {
              touch();
              return;
            }
          }
        } catch (e) { /* never disturb the page */ }
      });
      mutations.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (e) { /* no MutationObserver here */ }

    try {
      var shifts = new w.PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i += 1) touch(entries[i].startTime);
      });
      shifts.observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* layout-shift is not supported here */ }

    function onImage(event) {
      try {
        var target = event.target;
        if (target && target.tagName && String(target.tagName).toUpperCase() === 'IMG' && isRendered(target)) touch();
      } catch (e) { /* ignore */ }
    }
    // On the document, not the window: a load event never propagates from the document to the window.
    document.addEventListener('load', onImage, true);
    document.addEventListener('error', onImage, true);

    function onAnimationEvent(event) {
      try {
        var target = event.target;
        if (target && target.nodeType === 1 && !inNonRenderedTag(target) && isRendered(target)) touch();
      } catch (e) { /* ignore */ }
    }
    for (var k = 0; k < ANIMATION_EVENTS.length; k += 1) w.addEventListener(ANIMATION_EVENTS[k], onAnimationEvent, true);

    // A running animation is still waiting out its delay ("before" phase) or has reached its end delay
    // ("after" phase) in some cases. Only the active phase changes what is on screen. Chromium does not
    // report ComputedEffectTiming.phase, so it is worked out from the timing when it is missing.
    function isInActivePhase(animation) {
      var timing = animation.effect.getComputedTiming();
      if (typeof timing.phase === 'string') return timing.phase === 'active';
      var local = timing.localTime;
      if (typeof local !== 'number') local = animation.currentTime;
      if (typeof local !== 'number') return false;
      var delay = typeof timing.delay === 'number' ? timing.delay : 0;
      var activeDuration = typeof timing.activeDuration === 'number' ? timing.activeDuration : Infinity;
      return local >= delay && local < delay + activeDuration;
    }

    function isAnimating() {
      try {
        var list = document.getAnimations();
        for (var i = 0; i < list.length; i += 1) {
          var animation = list[i];
          if (animation.playState !== 'running' || !animation.effect) continue;
          if (!isInActivePhase(animation)) continue;
          var target = animation.effect.target;
          if (target && target.isConnected && isRendered(target)) return true;
        }
      } catch (e) { /* getAnimations is not available */ }
      return false;
    }

    ns.clock = {
      read: function () {
        var now = perfNow();
        var animating = isAnimating();
        if (animating) state.lastChange = now;
        return { now: now, lastChange: state.lastChange, animating: animating, changes: state.changes };
      },
    };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

/** Reads the Page_Change_Clock of the page's main frame. Gives `null` when the script is not installed there. */
export async function readChangeClock(page: InspectablePage): Promise<ChangeClockState | null> {
  return (await page.evaluate(READ_CHANGE_CLOCK_EXPRESSION)) as ChangeClockState | null;
}

/** How long the page has been quiet at the moment of this read, in milliseconds. */
export function quietForMs(state: ChangeClockState): number {
  return Math.max(0, state.now - state.lastChange);
}
