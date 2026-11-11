import type { Box } from '../core/types.ts';
import type { InspectablePage } from '../core/detectors.ts';

/*
 * Layout-shift entries with their sources (design "misclick").
 *
 * `LAYOUT_SHIFTS_SOURCE` is installed with `page.addInitScript`. A buffered `layout-shift`
 * PerformanceObserver keeps every shift of the document, and for each source it records, at the time
 * the entry is delivered:
 *
 *   key           the element key of the moved element (`null` when `window.__haunt.keys` is missing)
 *   tag           its tag name, lower case
 *   text          its visible text (Sight's `visibleText`, or `innerText` when Sight is not installed),
 *                 whitespace collapsed, at most 80 characters
 *   previousRect  where it was, CSS px in the viewport
 *   currentRect   where it is now
 *
 * The moved node is read straight away, because it may be gone by the time a Detector asks. A text
 * node source is reported as its parent element.
 *
 * `since(from, to)` returns the entries whose `startTime` lies in `[from, to]` (`to` may be left out),
 * oldest first. Entries still queued in the observer are taken first, so a shift that has happened is
 * never missing. Times are the document's `performance.now()` clock, like the Page_Change_Clock and
 * the click log. The buffer keeps the newest 500 entries.
 *
 * The script only observes. It never changes the DOM, focus, scroll or any value of the page. It can
 * be installed twice (the second run does nothing) and in every frame; it never throws into the page.
 */

/** One source of a layout shift. */
export interface LayoutShiftSource {
  key: string | null;
  tag: string;
  text: string;
  previousRect: Box;
  currentRect: Box;
}

/** One layout-shift entry. */
export interface LayoutShiftEntry {
  /** `performance.now()` of the document, ms. */
  startTime: number;
  value: number;
  /** True when the shift came within 500 ms of user input (those are not counted as unexpected). */
  hadRecentInput: boolean;
  sources: LayoutShiftSource[];
}

/** The page-side expression for the shifts in `[from, to]`. Gives `[]` when the script is not installed. */
export function layoutShiftsExpression(from: number, to?: number): string {
  const args = to === undefined ? JSON.stringify(from) : `${JSON.stringify(from)}, ${JSON.stringify(to)}`;
  return `(window.__haunt && window.__haunt.shifts ? window.__haunt.shifts.since(${args}) : [])`;
}

/**
 * Source of the layout-shift script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper can leak into the page.
 */
export const LAYOUT_SHIFTS_SOURCE: string = String.raw`(function () {
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
    if (ns.shifts) return;

    var MAX_ENTRIES = 500;
    var MAX_TEXT = 80;
    var buffer = [];

    function round(v) {
      return Math.round(v * 100) / 100;
    }

    function box(r) {
      return r ? { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) } : { x: 0, y: 0, w: 0, h: 0 };
    }

    function elementOf(node) {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      if (node.parentElement) return node.parentElement;
      var root = node.getRootNode ? node.getRootNode() : null;
      return root && root.host ? root.host : null;
    }

    function source(s) {
      var el = elementOf(s.node);
      var text = '';
      try {
        if (el && ns.sight && typeof ns.sight.visibleText === 'function') text = ns.sight.visibleText(el);
        else if (el && typeof el.innerText === 'string') text = el.innerText;
        text = String(text).replace(/\s+/g, ' ').trim();
      } catch (e) { text = ''; }
      if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
      var keys = ns.keys;
      return {
        key: el && keys ? keys.key(el) : null,
        tag: el ? String(el.localName || el.tagName || '').toLowerCase() : '',
        text: text,
        previousRect: box(s.previousRect),
        currentRect: box(s.currentRect),
      };
    }

    function record(entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var e = entries[i];
        var sources = [];
        var list = e.sources || [];
        for (var j = 0; j < list.length; j += 1) {
          try { sources.push(source(list[j])); } catch (err) { /* skip this source */ }
        }
        buffer.push({ startTime: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput === true, sources: sources });
        if (buffer.length > MAX_ENTRIES) buffer.shift();
      }
    }

    var observer = null;
    try {
      observer = new w.PerformanceObserver(function (list) {
        try { record(list.getEntries()); } catch (e) { /* never disturb the page */ }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch (e) { observer = null; /* layout-shift is not supported here */ }

    function copy(entry) {
      var sources = [];
      for (var i = 0; i < entry.sources.length; i += 1) {
        var s = entry.sources[i];
        sources.push({ key: s.key, tag: s.tag, text: s.text, previousRect: s.previousRect, currentRect: s.currentRect });
      }
      return { startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput, sources: sources };
    }

    ns.shifts = {
      since: function (from, to) {
        try {
          if (observer && typeof observer.takeRecords === 'function') record(observer.takeRecords());
        } catch (e) { /* ignore */ }
        var lo = typeof from === 'number' ? from : -Infinity;
        var hi = typeof to === 'number' ? to : Infinity;
        var out = [];
        for (var i = 0; i < buffer.length; i += 1) {
          if (buffer[i].startTime >= lo && buffer[i].startTime <= hi) out.push(copy(buffer[i]));
        }
        return out;
      },
    };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

/** The layout shifts of the main frame whose `startTime` lies in `[from, to]` (page clock, ms), oldest first. */
export async function readLayoutShifts(page: InspectablePage, from: number, to?: number): Promise<LayoutShiftEntry[]> {
  return (await page.evaluate(layoutShiftsExpression(from, to))) as LayoutShiftEntry[];
}
