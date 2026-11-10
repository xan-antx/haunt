import type { InspectablePage } from '../core/detectors.ts';

/*
 * Live_Announcements (Requirement 8.4, design "The Listener / Body: perception").
 *
 * `LIVE_REGIONS_SOURCE` is installed with `page.addInitScript`, so its MutationObserver starts before
 * any script of the page. It records the text that a screen reader would speak without the user moving
 * to it: text added to, or changed inside, an element matching
 *
 *     [aria-live]:not([aria-live="off"]), [role="alert"], [role="status"], [role="log"]
 *
 * That includes a region that is inserted together with its text, which is how `role="alert"` messages
 * usually appear. Only the added or changed text is recorded, whitespace is collapsed, and text that is
 * hidden (`hidden`, `aria-hidden="true"`, no box) is left out. Removals and attribute changes are not
 * announcements and are not recorded. Not covered: a region that is already in the page and is only made
 * visible, and shadow trees.
 *
 * The Body calls `drain` after each action's Settle: it returns the announcements recorded since the
 * previous drain, in order, and clears the buffer. Changes that are still queued in the observer are
 * processed first, so nothing is lost to timing. The buffer keeps the newest 500 announcements.
 *
 * The script only observes. It never changes the DOM, focus, scroll or any value of the page. It can be
 * installed twice (the second run does nothing) and in every frame; it never throws into the page.
 */

/** The page-side expression that drains the buffer. Gives `[]` when the script is not installed. */
export const DRAIN_LIVE_ANNOUNCEMENTS_EXPRESSION =
  '(window.__haunt && window.__haunt.live ? window.__haunt.live.drain() : [])';

/**
 * Source of the Live_Announcement script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper can leak into the page.
 */
export const LIVE_REGIONS_SOURCE: string = String.raw`(function () {
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
    if (ns.live) return;

    var LIVE = '[aria-live]:not([aria-live="off"]), [role="alert"], [role="status"], [role="log"]';
    var HIDDEN = '[hidden], [aria-hidden="true"]';
    var NOT_TEXT_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1 };
    var CHECK_VISIBILITY = { visibilityProperty: true, checkVisibilityCSS: true };
    var MAX_BUFFER = 500;
    var MAX_TEXT = 2000;
    var buffer = [];

    function normalize(text) {
      return String(text).replace(/\s+/g, ' ').trim();
    }

    function emit(text) {
      text = normalize(text);
      if (!text) return;
      if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
      buffer.push(text);
      if (buffer.length > MAX_BUFFER) buffer.shift();
    }

    // False when a screen reader would not speak this element: hidden by attribute or by having no box.
    function isAnnounceable(el) {
      if (el.closest(HIDDEN)) return false;
      if (el.isConnected && typeof el.checkVisibility === 'function' && !el.checkVisibility(CHECK_VISIBILITY)) return false;
      return true;
    }

    // The text a screen reader would read from this node: hidden parts are left out, and block-level
    // children are separated by a space.
    function textOf(node) {
      if (node.nodeType === 3) return node.data;
      if (node.nodeType !== 1) return '';
      if (NOT_TEXT_TAGS[String(node.tagName).toUpperCase()] === 1) return '';
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return '';
      var connected = node.isConnected;
      if (connected && typeof node.checkVisibility === 'function' && !node.checkVisibility(CHECK_VISIBILITY)) return '';
      var out = '';
      for (var child = node.firstChild; child; child = child.nextSibling) {
        var part = textOf(child);
        if (!part) continue;
        if (child.nodeType === 1) {
          var display = connected ? w.getComputedStyle(child).display : 'inline';
          var inline = display.indexOf('inline') === 0 || display === 'contents';
          out += inline ? part : ' ' + part + ' ';
        } else {
          out += part;
        }
      }
      return out;
    }

    function handle(records) {
      var reported = [];
      var changedTexts = new Set();

      function covered(node) {
        for (var i = 0; i < reported.length; i += 1) {
          if (reported[i] === node || reported[i].contains(node)) return true;
        }
        return false;
      }

      function added(n) {
        if (covered(n)) return;
        if (n.nodeType === 3) {
          var parent = n.parentElement;
          if (parent && parent.closest(LIVE)) {
            if (isAnnounceable(parent)) emit(n.data);
            reported.push(n);
          }
          return;
        }
        if (n.nodeType !== 1) return;
        if (n.closest(LIVE)) {
          if (isAnnounceable(n)) emit(textOf(n));
          reported.push(n);
          return;
        }
        if (n.querySelector(LIVE)) {
          var regions = n.querySelectorAll(LIVE);
          for (var j = 0; j < regions.length; j += 1) {
            var region = regions[j];
            if (covered(region)) continue;
            if (isAnnounceable(region)) emit(textOf(region));
            reported.push(region);
          }
        }
      }

      for (var i = 0; i < records.length; i += 1) {
        var record = records[i];
        if (record.type === 'characterData') {
          var text = record.target;
          if (changedTexts.has(text) || covered(text)) continue;
          changedTexts.add(text);
          if (text.data === record.oldValue) continue;
          var holder = text.parentElement;
          if (holder && holder.closest(LIVE) && isAnnounceable(holder)) emit(text.data);
        } else if (record.type === 'childList') {
          for (var k = 0; k < record.addedNodes.length; k += 1) added(record.addedNodes[k]);
        }
      }
    }

    var observer = new w.MutationObserver(function (records) {
      try {
        handle(records);
      } catch (e) { /* never disturb the page */ }
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });

    ns.live = {
      drain: function () {
        try {
          handle(observer.takeRecords());
        } catch (e) { /* ignore */ }
        var out = buffer;
        buffer = [];
        return out;
      },
    };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

/** Returns the Live_Announcements recorded since the previous drain, in order, and clears the buffer. */
export async function drainLiveAnnouncements(page: InspectablePage): Promise<string[]> {
  return (await page.evaluate(DRAIN_LIVE_ANNOUNCEMENTS_EXPRESSION)) as string[];
}
