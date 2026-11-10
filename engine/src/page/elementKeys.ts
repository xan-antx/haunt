import type { InspectablePage } from '../core/detectors.ts';

/*
 * Stable, engine-private element keys (design "Folder layout": page/elementKeys.ts).
 *
 * `ELEMENT_KEYS_SOURCE` is installed with `page.addInitScript`. It gives every element it is asked
 * about a key of the form `e<number>`, kept in a WeakMap, so nothing is written to the page's DOM and an
 * element's key is the same on every call for as long as the element exists. Keys are numbered in the
 * order they are first asked for and are never reused. A key is not an accessible name or a DOM
 * reference: it only says "the same element as before", for Detectors and for the Body's step trace.
 *
 * Page-side API, in `window.__haunt.keys` of each document:
 *
 *   key(el)             the key of an element (`null` for anything that is not an element)
 *   element(key)        the element for a key, or `null` once it has been garbage-collected
 *   activeKey()         the key of the focused element, looking into open shadow trees. `null` when focus
 *                       is on the document (`body` or `html`)
 *   dialogKey(el)       the key of the nearest `dialog`, `[role=dialog]` or `[role=alertdialog]` that is `el`
 *                       or contains it (through shadow hosts too), or `null`
 *   activeDialogKey()   the dialog key of the focused element
 *   focus()             `{ focusKey, dialogKey }` for the focused element, the shape of a trace key entry
 *
 * The script only observes. It never changes the DOM, focus, scroll or any value of the page. It can be
 * installed twice (the second run does nothing) and in every frame; it never throws into the page.
 * Keys are numbered per document, so a key is only meaningful together with the frame it came from.
 */

/** The focused element and its enclosing dialog, as element keys. */
export interface FocusKeys {
  focusKey: string | null;
  dialogKey: string | null;
}

/** The page-side expression that reads `FocusKeys`, or gives `null` when the script is not installed. */
export const READ_FOCUS_KEYS_EXPRESSION =
  '(window.__haunt && window.__haunt.keys ? window.__haunt.keys.focus() : null)';

/**
 * Source of the element key script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper can leak into the page.
 */
export const ELEMENT_KEYS_SOURCE: string = String.raw`(function () {
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
    if (ns.keys) return;

    var DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]';
    var ids = new WeakMap();
    var refs = new Map();
    var next = 0;
    var registry = typeof w.FinalizationRegistry === 'function'
      ? new w.FinalizationRegistry(function (k) { refs.delete(k); })
      : null;

    function key(el) {
      if (!el || el.nodeType !== 1) return null;
      var k = ids.get(el);
      if (k === undefined) {
        next += 1;
        k = 'e' + next;
        ids.set(el, k);
        if (typeof w.WeakRef === 'function') {
          refs.set(k, new w.WeakRef(el));
          if (registry) registry.register(el, k);
        }
      }
      return k;
    }

    function element(k) {
      var ref = refs.get(k);
      var el = ref ? ref.deref() : undefined;
      return el === undefined ? null : el;
    }

    function activeElement() {
      var a = document.activeElement;
      for (var i = 0; a && a.shadowRoot && a.shadowRoot.activeElement && i < 20; i += 1) a = a.shadowRoot.activeElement;
      return a;
    }

    function activeKey() {
      var a = activeElement();
      if (!a || a === document.body || a === document.documentElement) return null;
      return key(a);
    }

    function dialogOf(el) {
      for (var n = el, i = 0; n && i < 500; i += 1) {
        if (n.nodeType === 1 && n.matches(DIALOG)) return n;
        var root = n.getRootNode ? n.getRootNode() : null;
        n = n.parentElement || (root && root.host) || null;
      }
      return null;
    }

    function dialogKey(el) {
      if (!el || el.nodeType !== 1) return null;
      return key(dialogOf(el));
    }

    function activeDialogKey() {
      var a = activeElement();
      if (!a || a === document.body || a === document.documentElement) return null;
      return dialogKey(a);
    }

    ns.keys = {
      key: key,
      element: element,
      activeKey: activeKey,
      dialogKey: dialogKey,
      activeDialogKey: activeDialogKey,
      focus: function () { return { focusKey: activeKey(), dialogKey: activeDialogKey() }; },
    };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

/** The keys of the focused element and its dialog in the main frame. `null` when the script is not installed. */
export async function readFocusKeys(page: InspectablePage): Promise<FocusKeys | null> {
  return (await page.evaluate(READ_FOCUS_KEYS_EXPRESSION)) as FocusKeys | null;
}

/** The key of the first element that matches a CSS selector in the main frame, or `null` when there is none. */
export async function readElementKey(page: InspectablePage, selector: string): Promise<string | null> {
  const expression =
    `(function (selector) { var k = window.__haunt && window.__haunt.keys; ` +
    `return k ? k.key(document.querySelector(selector)) : null; })(${JSON.stringify(selector)})`;
  return (await page.evaluate(expression)) as string | null;
}
