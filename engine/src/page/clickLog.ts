import type { InspectablePage } from '../core/detectors.ts';

/*
 * The click log (design "Shared visual body / Actions" and "misclick").
 *
 * `CLICK_LOG_SOURCE` is installed with `page.addInitScript`, so its listener is the first `click`
 * listener of the window, in the capture phase. For every `click` event it records:
 *
 *   at       `performance.now()` of the document when the event arrived, the same clock as the
 *            Page_Change_Clock and the layout-shift entries
 *   key      the element key (`window.__haunt.keys`) of the closest interactive ancestor-or-self of the
 *            real event target (looking through open shadow trees). When there is no interactive
 *            ancestor it is the key of the target itself
 *   text     that element's visible text (Sight's `visibleText`, or `innerText` when Sight is not
 *            installed), whitespace collapsed, at most 80 characters. Read when the click arrives,
 *            because the element may be gone by the time a Detector asks
 *   x, y     the event's client coordinates in CSS px
 *   trusted  `event.isTrusted`
 *
 * "Interactive" is `INTERACTIVE_SELECTOR`, the same rule `sight.ts` uses for the probe item keys, so
 * the misclick Detector compares like with like. ARIA roles are not part of it.
 *
 * A label click produces a second `click` on its control; both are logged, in order, so the Body takes
 * the first entry after its own click. The log lives in the document: a click that starts a full
 * navigation is lost with the old document (single-page navigations keep it).
 *
 * The script only observes. It never calls `preventDefault` or `stopPropagation`, and never changes the
 * DOM, focus, scroll or any value of the page. It can be installed twice (the second run does
 * nothing) and in every frame; it never throws into the page. The log keeps the newest 200 clicks.
 */

/** The elements a click "hits", for the click log and the Sight's probe keys. Tag-based only. */
export const INTERACTIVE_SELECTOR =
  'a[href], button, input:not([type="hidden" i]), select, textarea, summary';

/** One logged click. */
export interface ClickEntry {
  /** `performance.now()` of the document, ms. */
  at: number;
  /** Element key of the interactive element (or the plain target) that received the click. */
  key: string | null;
  /** Visible text of that element when the click arrived, at most 80 characters. */
  text: string;
  /** Client coordinates, CSS px. */
  x: number;
  y: number;
  trusted: boolean;
}

/** The page-side expression for the clicks at or after `at`. Gives `[]` when the script is not installed. */
export function clicksSinceExpression(at: number): string {
  return `(window.__haunt && window.__haunt.clicks ? window.__haunt.clicks.since(${JSON.stringify(at)}) : [])`;
}

/**
 * Source of the click log script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper can leak into the page.
 */
export const CLICK_LOG_SOURCE: string = String.raw`(function () {
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
    if (ns.clicks) return;

    var INTERACTIVE = ${JSON.stringify(INTERACTIVE_SELECTOR)};
    var MAX_LOG = 200;
    var MAX_TEXT = 80;
    var perfNow = w.performance.now.bind(w.performance);
    var log = [];

    function flatParent(node) {
      if (node.assignedSlot) return node.assignedSlot;
      var p = node.parentNode;
      if (!p) return null;
      if (p.nodeType === 11) return p.host || null;
      return p.nodeType === 1 ? p : null;
    }

    function closestInteractive(el) {
      for (var n = el, i = 0; n && i < 500; n = flatParent(n), i += 1) {
        if (n.nodeType === 1 && n.matches(INTERACTIVE)) return n;
      }
      return null;
    }

    function targetOf(event) {
      var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      var t = path.length ? path[0] : event.target;
      if (t && t.nodeType === 3) t = flatParent(t);
      return t && t.nodeType === 1 ? t : null;
    }

    function textOf(el) {
      var text = '';
      try {
        if (el && ns.sight && typeof ns.sight.visibleText === 'function') text = ns.sight.visibleText(el);
        else if (el && typeof el.innerText === 'string') text = el.innerText;
        text = String(text).replace(/\s+/g, ' ').trim();
      } catch (e) { text = ''; }
      return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
    }

    w.addEventListener('click', function (event) {
      try {
        var at = perfNow();
        var target = targetOf(event);
        var hit = target ? (closestInteractive(target) || target) : null;
        var keys = ns.keys;
        log.push({
          at: at,
          key: hit && keys ? keys.key(hit) : null,
          text: textOf(hit),
          x: event.clientX,
          y: event.clientY,
          trusted: event.isTrusted === true,
        });
        if (log.length > MAX_LOG) log.shift();
      } catch (e) { /* never disturb the page */ }
    }, true);

    ns.clicks = {
      since: function (at) {
        var from = typeof at === 'number' ? at : -Infinity;
        var out = [];
        for (var i = 0; i < log.length; i += 1) {
          if (log[i].at >= from) out.push({ at: log[i].at, key: log[i].key, text: log[i].text, x: log[i].x, y: log[i].y, trusted: log[i].trusted });
        }
        return out;
      },
    };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

/** The clicks logged in the main frame at or after `at` (page clock, ms), oldest first. */
export async function readClicksSince(page: InspectablePage, at: number): Promise<ClickEntry[]> {
  return (await page.evaluate(clicksSinceExpression(at))) as ClickEntry[];
}
