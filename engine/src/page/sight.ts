import type { InspectablePage } from '../core/detectors.ts';
import type { Box, Probe } from '../core/types.ts';
import { INTERACTIVE_SELECTOR } from './clickLog.ts';

/*
 * Sight: what a sighted person sees on the screen (Requirements 13.2, 17.2, design "Shared visual
 * body / Sight").
 *
 * `SIGHT_SOURCE` is installed with `page.addInitScript`. It adds `window.__haunt.sight.look()`, which
 * the visual Body calls in one synchronous evaluation, so the Seen_Items and the probe describe the
 * same moment. The screenshot is taken by the Body right after.
 *
 * What is collected, walking the flat tree (open shadow roots and slots included) of the main
 * document in document order:
 *
 *   - interactive elements (`INTERACTIVE_SELECTOR`: `a[href]`, `button`, `input`, `select`,
 *     `textarea`, `summary`). Their text is the visible text of everything inside them;
 *   - leaf text blocks: elements outside interactive elements that have their own non-empty text
 *     nodes. Their text is the visible text of those own text nodes, and their box is the box of that
 *     visible text.
 *
 * An item is kept only when its visible part (box ∩ viewport ∩ clipping ancestors) is not empty, the
 * element is not `visibility: hidden` and neither it nor an ancestor has `opacity: 0`, and
 * `elementFromPoint` at the centre of the visible part returns the element itself or a descendant.
 * Things under a modal backdrop are therefore left out. The item's `box` is that visible part.
 *
 * Looks come from the tag and input type only: `button`, `summary` and button-type inputs look like
 * `button`; `a[href]` looks like `link` (even with `role="button"`); text-like inputs, `select` and
 * `textarea` look like `field`; checkboxes and radios look like `checkbox` (with `checked`); leaf text
 * blocks look like `text`. ARIA attributes, roles and accessible names are never read.
 *
 * Visible text, per character: for each text node the visible rectangle is the viewport intersected
 * with every ancestor whose `overflow` is not `visible` (respecting `position: absolute` and `fixed`
 * containing blocks), and with `clip: rect(...)` and `clip-path: inset(50%)` on absolutely positioned
 * ancestors. When the node's rects all lie inside it, all its text is kept. Otherwise each grapheme's
 * `Range` rect is tested and only graphemes inside are kept: horizontally fully inside (1 px
 * tolerance for anti-aliasing), vertically at least half inside (font boxes are often taller than a
 * tight line). With `text-overflow: ellipsis` on an overflowing block, the space of the ellipsis is
 * taken off and a visible "…" is added. `text-transform` is applied. Inputs show their value
 * (password characters as "•"), or their placeholder (with `placeholder: true`) when the value is
 * empty. Whitespace is collapsed.
 *
 * The probe holds `at` (page clock, the time the look started) and `itemKeys`: for each item, the
 * element key of the closest interactive ancestor-or-self of the element under the item's centre
 * (the same rule as the click log), or of that element itself. The probe goes only to the Detectors.
 *
 * `visibleText(element)` gives the visible text of any element with the same per-character rule.
 *
 * The script only observes. It never changes the DOM, focus, scroll or any value of the page. It can
 * be installed twice (the second run does nothing) and in every frame; it never throws into the page.
 * Iframes are not looked into.
 */

/** How a Seen_Item looks to a sighted person. */
export type SeenLook = 'button' | 'field' | 'link' | 'checkbox' | 'text';

/** One thing visible on the screen. It carries no roles, accessible names, ARIA attributes or DOM references. */
export interface SeenItem {
  /** "s1", "s2"… valid for this Sight only. */
  id: string;
  look: SeenLook;
  /** Only the characters actually visible. */
  text: string;
  /** CSS px in the viewport: the visible part of the item. */
  box: Box;
  /** Checkboxes only: a visible tick. */
  checked?: boolean;
  /** Fields only, present when the text is the field's placeholder. */
  placeholder?: true;
}

/** The Perception of The Phantom and Bebe. */
export interface Sight {
  /** What the address bar shows (path only). */
  path: string;
  viewport: { w: number; h: number };
  screenshot: Buffer;
  screenshotHash: string;
  items: SeenItem[];
}

/** The keys a serialised Seen_Item may have. */
export const SEEN_ITEM_KEYS: readonly (keyof SeenItem)[] = ['id', 'look', 'text', 'box', 'checked', 'placeholder'];

/** One look at the page: everything of a Sight except the screenshot, plus the Detector-only probe. */
export interface SightReading {
  path: string;
  viewport: { w: number; h: number };
  items: SeenItem[];
  /** Detector-only. Never give it to a Mind. */
  probe: Probe & { itemKeys: Record<string, string> };
}

/** What `window.__haunt.sight.look()` returns. */
interface RawLook {
  at: number;
  path: string;
  viewport: { w: number; h: number };
  items: unknown[];
  itemKeys: Record<string, string>;
}

/** The page-side expression for one look, or `null` when the script is not installed. */
export const LOOK_EXPRESSION = '(window.__haunt && window.__haunt.sight ? window.__haunt.sight.look() : null)';

/**
 * Source of the Sight script. Plain JavaScript in a string, not a stringified function,
 * so that no transpiler helper can leak into the page.
 */
export const SIGHT_SOURCE: string = String.raw`(function () {
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
    if (ns.sight) return;

    var INTERACTIVE = ${JSON.stringify(INTERACTIVE_SELECTOR)};
    var SKIP_TAGS = { script: 1, style: 1, noscript: 1, template: 1, head: 1, title: 1, iframe: 1, frame: 1, object: 1, embed: 1, canvas: 1, video: 1, audio: 1, datalist: 1, option: 1, optgroup: 1 };
    var BUTTON_INPUTS = { button: 1, submit: 1, reset: 1, image: 1, file: 1 };
    var CHECK_INPUTS = { checkbox: 1, radio: 1 };
    var DEFAULT_INPUT_TEXT = { submit: 'Submit', reset: 'Reset' };
    var VISIBILITY = { opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true };
    var TOLERANCE = 1;
    var MAX_ITEMS = 1500;
    var MAX_TEXT = 500;
    var MAX_GRAPHEMES = 3000;
    var DEPTH = 500;

    var segmenter = null;
    try { segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { segmenter = null; }
    var measure = null;

    // Caches valid for one call of look() or visibleText().
    var clipCache = null;
    var styleCache = null;

    function style(el) {
      var s = styleCache ? styleCache.get(el) : undefined;
      if (s === undefined) {
        s = w.getComputedStyle(el);
        if (styleCache) styleCache.set(el, s);
      }
      return s;
    }

    function tagOf(el) {
      return String(el.localName || el.tagName || '').toLowerCase();
    }

    function R(l, t, r, b) { return { l: l, t: t, r: r, b: b }; }
    function fromDom(d) { return R(d.left, d.top, d.right, d.bottom); }
    function cut(a, b) { return R(Math.max(a.l, b.l), Math.max(a.t, b.t), Math.min(a.r, b.r), Math.min(a.b, b.b)); }
    function isEmpty(a) { return !(a.r - a.l > 0 && a.b - a.t > 0); }
    function union(a, b) { return a ? R(Math.min(a.l, b.l), Math.min(a.t, b.t), Math.max(a.r, b.r), Math.max(a.b, b.b)) : b; }
    function viewportRect() { return R(0, 0, w.innerWidth, w.innerHeight); }
    var EMPTY = R(0, 0, 0, 0);

    function normalize(text) {
      return String(text).replace(/\s+/g, ' ').trim();
    }

    // Parent in the flat tree: the slot a node is assigned to, the shadow host, or the parent element.
    function flatParent(node) {
      if (node.assignedSlot) return node.assignedSlot;
      var p = node.parentNode;
      if (!p) return null;
      if (p.nodeType === 11) return p.host || null;
      return p.nodeType === 1 ? p : null;
    }

    // Children in the flat tree.
    function childrenOf(node) {
      if (node.nodeType === 1) {
        if (node.shadowRoot) return node.shadowRoot.childNodes;
        if (tagOf(node) === 'slot' && typeof node.assignedNodes === 'function') {
          var assigned = node.assignedNodes();
          if (assigned.length) return assigned;
        }
      }
      return node.childNodes;
    }

    function containsDeep(ancestor, node) {
      for (var n = node, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
        if (n === ancestor) return true;
      }
      return false;
    }

    function closestInteractive(el) {
      for (var n = el, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
        if (n.nodeType === 1 && n.matches(INTERACTIVE)) return n;
      }
      return null;
    }

    function elementAt(x, y) {
      var el = document.elementFromPoint(x, y);
      for (var i = 0; el && el.shadowRoot && i < 20; i += 1) {
        var inner = el.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === el) break;
        el = inner;
      }
      return el;
    }

    // The nearest flat ancestor-or-self that has a box of its own (display: contents has none).
    function boxOwner(el) {
      for (var n = el, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
        if (n.nodeType === 1 && style(n).display !== 'contents') return n;
      }
      return null;
    }

    function isVisibleElement(el) {
      if (typeof el.checkVisibility === 'function') return el.checkVisibility(VISIBILITY);
      for (var n = el, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
        if (n.nodeType === 1 && style(n).opacity === '0') return false;
      }
      return style(el).visibility === 'visible';
    }

    function isInline(s) {
      return s.display.indexOf('inline') === 0 || s.display === 'contents';
    }

    function edge(value, fallback) {
      return value === 'auto' ? fallback : parseFloat(value);
    }

    // clip and clip-path clip the element itself and its content.
    function applyClipProps(el, s, rect) {
      var clipPath = s.clipPath;
      if (clipPath && clipPath !== 'none' && /inset\(\s*(50|100)%/.test(clipPath)) return EMPTY;
      if ((s.position === 'absolute' || s.position === 'fixed') && s.clip && s.clip !== 'auto') {
        var m = /rect\(([^)]*)\)/.exec(s.clip);
        if (m) {
          var parts = m[1].split(/[\s,]+/).filter(function (p) { return p.length > 0; });
          if (parts.length === 4) {
            var b = el.getBoundingClientRect();
            rect = cut(rect, R(
              b.left + edge(parts[3], 0),
              b.top + edge(parts[0], 0),
              b.left + edge(parts[1], b.width),
              b.top + edge(parts[2], b.height)
            ));
          }
        }
      }
      return rect;
    }

    // overflow other than visible clips the element's content to its padding box.
    function applyOverflow(el, s, rect) {
      if (el === document.documentElement || el === document.body) return rect;
      if (s.display === 'inline' || s.display === 'contents') return rect;
      var clipX = s.overflowX !== 'visible';
      var clipY = s.overflowY !== 'visible';
      if (!clipX && !clipY) return rect;
      var b = el.getBoundingClientRect();
      var l = b.left + el.clientLeft;
      var t = b.top + el.clientTop;
      return cut(rect, R(
        clipX ? l : -Infinity,
        clipY ? t : -Infinity,
        clipX ? l + el.clientWidth : Infinity,
        clipY ? t + el.clientHeight : Infinity
      ));
    }

    // The rectangle in which something is visible: for the content of el when includeSelf is true,
    // for el's own box otherwise.
    function clipRect(el, includeSelf) {
      var cacheKey = includeSelf ? 'content' : 'box';
      var cached = clipCache ? clipCache.get(el) : undefined;
      if (cached && cached[cacheKey]) return cached[cacheKey];

      var rect = viewportRect();
      var s = style(el);
      if (includeSelf) rect = applyOverflow(el, s, rect);
      rect = applyClipProps(el, s, rect);
      if (s.position !== 'fixed') {
        var needPositioned = s.position === 'absolute';
        for (var a = flatParent(el), i = 0; a && i < DEPTH && !isEmpty(rect); a = flatParent(a), i += 1) {
          var as = style(a);
          if (needPositioned) {
            if (as.position === 'static' && as.transform === 'none' && a !== document.documentElement) continue;
            needPositioned = false;
          }
          rect = applyOverflow(a, as, rect);
          rect = applyClipProps(a, as, rect);
          if (as.position === 'fixed') break;
          if (as.position === 'absolute') needPositioned = true;
        }
      }

      if (clipCache) {
        if (!cached) { cached = {}; clipCache.set(el, cached); }
        cached[cacheKey] = rect;
      }
      return rect;
    }

    function ellipsisWidth(s) {
      try {
        if (!measure) measure = document.createElement('canvas').getContext('2d');
        if (measure) {
          measure.font = s.font || (s.fontSize + ' ' + s.fontFamily);
          var width = measure.measureText('…').width;
          if (width > 0) return width;
        }
      } catch (e) { /* fall through */ }
      return parseFloat(s.fontSize) || 16;
    }

    // The right edge before which text shows when the nearest block around the text draws an ellipsis.
    function ellipsisEdge(el) {
      var block = null;
      for (var n = el, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
        if (n.nodeType === 1 && !isInline(style(n))) { block = n; break; }
      }
      if (!block) return null;
      var s = style(block);
      if (s.textOverflow !== 'ellipsis' || s.overflowX === 'visible') return null;
      if (block.scrollWidth <= block.clientWidth) return null;
      var b = block.getBoundingClientRect();
      return b.left + block.clientLeft + block.clientWidth - ellipsisWidth(s);
    }

    function inside(r, c) {
      if (r.left < c.l - TOLERANCE || r.right > c.r + TOLERANCE) return false;
      var overlap = Math.min(r.bottom, c.b) - Math.max(r.top, c.t);
      return overlap >= r.height / 2;
    }

    function graphemes(text) {
      var out = [];
      if (segmenter) {
        var it = segmenter.segment(text)[Symbol.iterator]();
        for (var step = it.next(); !step.done; step = it.next()) out.push({ i: step.value.index, s: step.value.segment });
        return out;
      }
      for (var i = 0; i < text.length;) {
        var code = text.codePointAt(i);
        var len = code > 0xffff ? 2 : 1;
        out.push({ i: i, s: text.substr(i, len) });
        i += len;
      }
      return out;
    }

    function transform(text, s) {
      switch (s.textTransform) {
        case 'uppercase': return text.toUpperCase();
        case 'lowercase': return text.toLowerCase();
        case 'capitalize': return text.replace(/(^|\s)(\S)/g, function (_m, a, b) { return a + b.toUpperCase(); });
        default: return text;
      }
    }

    var range = null;

    // The visible characters of one text node, and the box they take up.
    function visibleOfTextNode(node) {
      var none = { text: '', box: null };
      var data = node.data;
      if (!data || !/\S/.test(data)) return none;
      var parent = flatParent(node);
      if (!parent) return none;
      var holder = boxOwner(parent);
      if (!holder || !isVisibleElement(holder)) return none;
      var visibleIn = clipRect(holder, true);
      var cutAt = ellipsisEdge(holder);
      if (cutAt !== null) visibleIn = R(visibleIn.l, visibleIn.t, Math.min(visibleIn.r, cutAt), visibleIn.b);
      if (isEmpty(visibleIn)) return none;

      if (!range) range = document.createRange();
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      var all = true;
      var drawn = 0;
      var box = null;
      for (var i = 0; i < rects.length; i += 1) {
        var r = rects[i];
        if (r.width === 0 && r.height === 0) continue;
        drawn += 1;
        if (!inside(r, visibleIn)) { all = false; break; }
        box = union(box, fromDom(r));
      }
      if (drawn === 0) return none;

      var text;
      if (all) {
        text = data;
      } else {
        text = '';
        box = null;
        var parts = graphemes(data.length > MAX_GRAPHEMES ? data.slice(0, MAX_GRAPHEMES) : data);
        for (var k = 0; k < parts.length; k += 1) {
          var part = parts[k];
          if (/^\s+$/.test(part.s)) { text += ' '; continue; }
          range.setStart(node, part.i);
          range.setEnd(node, part.i + part.s.length);
          var g = range.getBoundingClientRect();
          if (g.width === 0 && g.height === 0) continue;
          if (inside(g, visibleIn)) {
            text += part.s;
            box = union(box, fromDom(g));
          }
        }
        if (cutAt !== null && /\S/.test(text)) text = text.replace(/\s+$/, '') + '…';
      }
      if (!/\S/.test(text) || !box) return none;
      return { text: transform(text, style(parent.nodeType === 1 ? parent : holder)), box: cut(box, visibleIn) };
    }

    // The visible text of everything inside an element. Blocks are separated by a space.
    function collectText(el, acc, depth) {
      if (depth > DEPTH) return;
      var children = childrenOf(el);
      for (var i = 0; i < children.length; i += 1) {
        var child = children[i];
        if (child.nodeType === 3) {
          var piece = visibleOfTextNode(child);
          if (piece.text) acc.text += piece.text;
        } else if (child.nodeType === 1) {
          if (SKIP_TAGS[tagOf(child)] === 1) continue;
          var inline = isInline(style(child));
          if (!inline) acc.text += ' ';
          collectText(child, acc, depth + 1);
          if (!inline) acc.text += ' ';
        }
      }
    }

    function clampText(text) {
      text = normalize(text);
      return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
    }

    // Look and text of an interactive element, from its tag and type only.
    function describe(el) {
      var tag = tagOf(el);
      if (tag === 'input') {
        var type = String(el.type || 'text').toLowerCase();
        if (type === 'hidden') return null;
        if (CHECK_INPUTS[type] === 1) return { look: 'checkbox', text: '', checked: el.checked === true };
        if (BUTTON_INPUTS[type] === 1) {
          return { look: 'button', text: type === 'file' || type === 'image' ? '' : clampText(el.value || DEFAULT_INPUT_TEXT[type] || '') };
        }
        return fieldText(el, type === 'password');
      }
      if (tag === 'textarea') return fieldText(el, false);
      if (tag === 'select') {
        var option = el.selectedOptions && el.selectedOptions.length ? el.selectedOptions[0] : null;
        return { look: 'field', text: clampText(option ? option.text : '') };
      }
      var acc = { text: '' };
      collectText(el, acc, 0);
      return { look: tag === 'a' ? 'link' : 'button', text: clampText(acc.text) };
    }

    function fieldText(el, masked) {
      var value = String(el.value || '');
      if (value) return { look: 'field', text: clampText(masked ? value.replace(/[\s\S]/g, '•') : value) };
      var placeholder = clampText(el.placeholder || '');
      if (placeholder) return { look: 'field', text: placeholder, placeholder: true };
      return { look: 'field', text: '' };
    }

    function round(v) {
      return Math.round(v * 100) / 100;
    }

    function toBox(r) {
      var x = round(r.l);
      var y = round(r.t);
      return { x: x, y: y, w: round(r.r - r.l), h: round(r.b - r.t) };
    }

    // The probe key for whatever is under a point: the interactive element there, or the element itself.
    function keyAt(hit) {
      var keys = ns.keys;
      if (!keys || !hit) return null;
      return keys.key(closestInteractive(hit) || hit);
    }

    function look() {
      var at = w.performance.now();
      clipCache = new Map();
      styleCache = new Map();
      var items = [];
      var itemKeys = {};

      function add(description, visible, owner) {
        if (isEmpty(visible)) return;
        var box = toBox(visible);
        if (!(box.w > 0 && box.h > 0)) return;
        var hit = elementAt(visible.l + (visible.r - visible.l) / 2, visible.t + (visible.b - visible.t) / 2);
        if (!hit || !containsDeep(owner, hit)) return;
        var id = 's' + (items.length + 1);
        var item = { id: id, look: description.look, text: description.text, box: box };
        if (description.look === 'checkbox') item.checked = description.checked === true;
        if (description.placeholder === true) item.placeholder = true;
        items.push(item);
        var key = keyAt(hit);
        if (key !== null) itemKeys[id] = key;
      }

      function considerInteractive(el) {
        if (!isVisibleElement(el)) return;
        var b = el.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0)) return;
        var description = describe(el);
        if (!description) return;
        add(description, cut(fromDom(b), clipRect(el, false)), el);
      }

      function considerText(el, nodes) {
        var owner = boxOwner(el);
        if (!owner) return;
        var text = '';
        var box = null;
        for (var i = 0; i < nodes.length; i += 1) {
          var piece = visibleOfTextNode(nodes[i]);
          if (!piece.text) continue;
          text += piece.text;
          box = union(box, piece.box);
        }
        text = clampText(text);
        if (!text || !box) return;
        add({ look: 'text', text: text }, box, owner);
      }

      function walk(el, depth) {
        if (items.length >= MAX_ITEMS || depth > DEPTH) return;
        if (SKIP_TAGS[tagOf(el)] === 1) return;
        if (el.matches(INTERACTIVE)) {
          considerInteractive(el);
          return;
        }
        var children = childrenOf(el);
        var own = [];
        for (var i = 0; i < children.length; i += 1) {
          if (children[i].nodeType === 3 && /\S/.test(children[i].data)) own.push(children[i]);
        }
        // The element's own text becomes one item, placed where its first own text node is, so the
        // items stay in document order.
        var textDone = own.length === 0;
        for (var j = 0; j < children.length; j += 1) {
          var child = children[j];
          if (!textDone && child === own[0]) {
            considerText(el, own);
            textDone = true;
          } else if (child.nodeType === 1) {
            walk(child, depth + 1);
          }
        }
      }

      try {
        var root = document.body || document.documentElement;
        if (root) walk(root, 0);
      } finally {
        clipCache = null;
        styleCache = null;
      }
      return {
        at: at,
        path: String(w.location.pathname),
        viewport: { w: w.innerWidth, h: w.innerHeight },
        items: items,
        itemKeys: itemKeys,
      };
    }

    function visibleText(el) {
      if (!el || el.nodeType !== 1) return '';
      clipCache = new Map();
      styleCache = new Map();
      try {
        var acc = { text: '' };
        collectText(el, acc, 0);
        return normalize(acc.text);
      } finally {
        clipCache = null;
        styleCache = null;
      }
    }

    ns.sight = { look: look, visibleText: visibleText };
  } catch (e) { /* the page must never see an error from the engine */ }
})();
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const LOOKS: ReadonlySet<string> = new Set<SeenLook>(['button', 'field', 'link', 'checkbox', 'text']);

/** Rebuilds a Seen_Item from page data with exactly the allowed keys, or `null` when it is malformed. */
function toSeenItem(raw: unknown): SeenItem | null {
  if (!isRecord(raw) || !isRecord(raw['box'])) return null;
  const { id, look, text } = raw;
  const { x, y, w, h } = raw['box'];
  if (typeof id !== 'string' || typeof look !== 'string' || !LOOKS.has(look) || typeof text !== 'string') return null;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return null;
  const item: SeenItem = { id, look: look as SeenLook, text, box: { x, y, w, h } };
  if (look === 'checkbox') item.checked = raw['checked'] === true;
  if (look === 'field' && raw['placeholder'] === true) item.placeholder = true;
  return item;
}

/**
 * Takes one look at the main frame: the Seen_Items, path and viewport for the Mind, and the probe
 * (page clock and item keys) for the Detectors. Gives `null` when the script is not installed.
 */
export async function readSight(page: InspectablePage): Promise<SightReading | null> {
  const raw = (await page.evaluate(LOOK_EXPRESSION)) as RawLook | null;
  if (!raw) return null;
  const items: SeenItem[] = [];
  const itemKeys: Record<string, string> = {};
  for (const entry of raw.items) {
    const item = toSeenItem(entry);
    if (!item) continue;
    items.push(item);
    const key = raw.itemKeys[item.id];
    if (typeof key === 'string') itemKeys[item.id] = key;
  }
  return {
    path: raw.path,
    viewport: { w: raw.viewport.w, h: raw.viewport.h },
    items,
    probe: { at: raw.at, itemKeys },
  };
}

/** The visible text of the first element matching a CSS selector in the main frame, or `null` when none matches. */
export async function readVisibleText(page: InspectablePage, selector: string): Promise<string | null> {
  const expression =
    `(function (selector) { var s = window.__haunt && window.__haunt.sight; var el = document.querySelector(selector); ` +
    `return s && el ? s.visibleText(el) : null; })(${JSON.stringify(selector)})`;
  return (await page.evaluate(expression)) as string | null;
}
