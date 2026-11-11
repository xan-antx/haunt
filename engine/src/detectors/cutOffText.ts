import type { DetectedProblem, Detector, DetectorContext } from '../core/types.ts';

/*
 * The `cut_off_text` Detector (Requirements 19.1 and 19.4, design "Bebe (Phase 2a) / Detectors").
 *
 * It records one Finding for each block of visible text in which at least one character lies outside
 * the box that clips it and cannot be scrolled into view.
 *
 * How it decides, with one read-only script after every Step:
 *   1. It walks the rendered text nodes of the page (open shadow roots and slots included) and groups
 *      them by their text block: the nearest ancestor-or-self that is not `display: inline` or
 *      `contents`. The block's text is the text of those nodes, in document order.
 *   2. For each block it lists the boxes that clip it: the block itself and its ancestors whose
 *      `overflow-x` or `overflow-y` is not `visible` (`hidden`, `clip`, `auto` or `scroll`; a block with
 *      `text-overflow: ellipsis` only draws an ellipsis when it has one of these). `position: absolute`
 *      and `fixed` containing blocks are respected, the same way as Sight does. `html` and `body` are
 *      left out: they scroll with the page.
 *   3. Going outwards from the nearest box, the clipping box is the first one outside whose padding
 *      box at least one non-blank character lies (on an axis it clips): horizontally the character must
 *      be fully inside (1 px tolerance for anti-aliasing), vertically at least half inside. These are
 *      the same rules as Sight's per-character visible text.
 *   4. The box can be scrolled on an axis only when that axis is `auto` or `scroll` and its content is
 *      larger than its padding box (`scrollWidth > clientWidth`, `scrollHeight > clientHeight`). When the
 *      cut characters can't be scrolled into view on at least one axis, it is a problem. Scrollable
 *      overflow is not.
 *   5. The visible part is the characters inside every clipping box (not the viewport, so text below
 *      the fold still has a visible part), less the space a `text-overflow: ellipsis` takes, with a "…"
 *      added in that case. A block with no visible character (for example screen-reader-only text) is
 *      not visible text and is left out.
 *
 * Step rule (Requirement 19.4): the Finding goes at the first Step at which the block's visible part
 * was inside the viewport. If it never was, the Finding goes at the first Step at which it was present,
 * from `finish()`, and the evidence ends with "It was outside the visible part of the screen."
 *
 * Each distinct problem is recorded once. Its key is the page path, a short selector of the text block
 * and its full text, so the same cut-off text is the same problem after a re-render or a reload of the
 * page, when the engine's element keys would be new.
 *
 * Everything here only reads: the script never changes the DOM, focus, scroll or any value. It uses
 * detached `Range` objects and, for the width of "…", an `OffscreenCanvas` that is never on the page.
 * Create a new Detector for each Run with `createCutOffTextDetector()`: it remembers what it has seen.
 */

/** What the page-side script reports about one cut-off text block. */
export interface CutOffItem {
  /** Short selector of the text block, for example `section.summary > div > dd.amount`. */
  selector: string;
  /** The text block's tag, for example `dd`. */
  tag: string;
  /** The text block's full text, whitespace collapsed (at most 200 characters). */
  fullText: string;
  /** The characters that fit inside the clipping boxes, whitespace collapsed (at most 200 characters). */
  visibleText: string;
  /** Width and height of all the text's characters together, CSS px. */
  textWidth: number;
  textHeight: number;
  /** The clipping box: the same element as the text block, or one of its ancestors. */
  boxIsBlock: boolean;
  boxSelector: string;
  boxTag: string;
  /** The name of the nearest named section, dialog, form or landmark at or around the clipping box. */
  boxName: string | null;
  /** The clipping box's padding box (`clientWidth`, `clientHeight`) and content size, CSS px. */
  boxWidth: number;
  boxHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  overflowX: string;
  overflowY: string;
  /** The text block's `text-overflow`. */
  textOverflow: string;
  /** Characters are cut off on that axis. */
  cutX: boolean;
  cutY: boolean;
  /** Some of the visible part is inside the viewport. */
  inViewport: boolean;
}

/** What the page-side script returns. */
export interface CutOffReport {
  path: string;
  items: CutOffItem[];
}

/**
 * Page-side function (as source text, for `ctx.inspect`). Plain JavaScript in a string so that no
 * transpiler helper can leak into the page. Pure reads only.
 */
export const READ_CUT_OFF_SCRIPT: string = String.raw`(function () {
  var w = window;
  var SKIP = { script: 1, style: 1, noscript: 1, template: 1, head: 1, title: 1, iframe: 1, frame: 1, object: 1,
    embed: 1, canvas: 1, video: 1, audio: 1, datalist: 1, option: 1, optgroup: 1, select: 1, textarea: 1, svg: 1, math: 1 };
  var VISIBILITY = { opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true };
  var TOLERANCE = 1;
  var DEPTH = 500;
  var MAX_ITEMS = 100;
  var MAX_GRAPHEMES = 3000;
  var MAX_TEXT = 200;

  var styles = new Map();
  function style(el) {
    var s = styles.get(el);
    if (s === undefined) { s = w.getComputedStyle(el); styles.set(el, s); }
    return s;
  }
  function tagOf(el) { return String(el.localName || el.tagName || '').toLowerCase(); }
  function collapse(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
  }
  function round(v) { return Math.round(v * 100) / 100; }

  function flatParent(node) {
    if (node.assignedSlot) return node.assignedSlot;
    var p = node.parentNode;
    if (!p) return null;
    if (p.nodeType === 11) return p.host || null;
    return p.nodeType === 1 ? p : null;
  }
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
  function flowInline(s) { return s.display === 'inline' || s.display === 'contents'; }
  function visible(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility(VISIBILITY);
    var s = style(el);
    return s.display !== 'none' && s.visibility === 'visible' && s.opacity !== '0';
  }
  function blockOf(el) {
    for (var n = el, i = 0; n && i < DEPTH; n = flatParent(n), i += 1) {
      if (n.nodeType === 1 && !flowInline(style(n))) return n;
    }
    return null;
  }

  // 1. Rendered text nodes, grouped by text block, in document order.
  var blocks = [];
  var nodesOf = new Map();
  function addText(node) {
    var parent = flatParent(node);
    if (!parent || !visible(parent)) return;
    var block = blockOf(parent);
    if (!block) return;
    var list = nodesOf.get(block);
    if (!list) { list = []; nodesOf.set(block, list); blocks.push(block); }
    list.push(node);
  }
  function walk(node, depth) {
    if (depth > DEPTH) return;
    var kids = childrenOf(node);
    for (var i = 0; i < kids.length; i += 1) {
      var c = kids[i];
      if (c.nodeType === 3) {
        if (/\S/.test(c.data)) addText(c);
      } else if (c.nodeType === 1) {
        if (SKIP[tagOf(c)] === 1 || style(c).display === 'none') continue;
        walk(c, depth + 1);
      }
    }
  }
  var root = document.body || document.documentElement;
  if (root) walk(root, 0);

  // 2. The boxes that clip a block, nearest first.
  function clipBox(el) {
    if (el === document.documentElement || el === document.body) return null;
    var s = style(el);
    if (flowInline(s)) return null;
    var x = s.overflowX !== 'visible';
    var y = s.overflowY !== 'visible';
    if (!x && !y) return null;
    var b = el.getBoundingClientRect();
    var l = b.left + el.clientLeft;
    var t = b.top + el.clientTop;
    return { el: el, x: x, y: y, l: l, t: t, r: l + el.clientWidth, b: t + el.clientHeight };
  }
  function clipChain(block) {
    var out = [];
    var own = clipBox(block);
    if (own) out.push(own);
    var s = style(block);
    if (s.position === 'fixed') return out;
    var needPositioned = s.position === 'absolute';
    for (var a = flatParent(block), i = 0; a && i < DEPTH; a = flatParent(a), i += 1) {
      var as = style(a);
      if (needPositioned) {
        if (as.position === 'static' && as.transform === 'none' && a !== document.documentElement) continue;
        needPositioned = false;
      }
      var box = clipBox(a);
      if (box) out.push(box);
      if (as.position === 'fixed') break;
      if (as.position === 'absolute') needPositioned = true;
    }
    return out;
  }

  // 3. Per-character tests, the same rules as Sight.
  function outX(r, c) { return c.x && (r.left < c.l - TOLERANCE || r.right > c.r + TOLERANCE); }
  function outY(r, c) { return c.y && Math.min(r.bottom, c.b) - Math.max(r.top, c.t) < r.height / 2; }

  var segmenter = null;
  try { segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch (e) { segmenter = null; }
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

  var range = document.createRange();
  function nodeFits(node, chain) {
    range.selectNodeContents(node);
    var rects = range.getClientRects();
    for (var i = 0; i < rects.length; i += 1) {
      var r = rects[i];
      if (r.width === 0 && r.height === 0) continue;
      for (var c = 0; c < chain.length; c += 1) if (outX(r, chain[c]) || outY(r, chain[c])) return false;
    }
    return true;
  }
  function charsOf(nodes) {
    var out = [];
    for (var n = 0; n < nodes.length; n += 1) {
      var node = nodes[n];
      var data = node.data.length > MAX_GRAPHEMES ? node.data.slice(0, MAX_GRAPHEMES) : node.data;
      var parts = graphemes(data);
      for (var k = 0; k < parts.length; k += 1) {
        var part = parts[k];
        if (/^\s+$/.test(part.s)) { out.push({ s: ' ', r: null }); continue; }
        range.setStart(node, part.i);
        range.setEnd(node, part.i + part.s.length);
        var g = range.getBoundingClientRect();
        if (g.width === 0 && g.height === 0) continue;
        out.push({ s: part.s, r: g });
      }
      out.push({ s: ' ', r: null });
    }
    return out;
  }

  var measure = null;
  function ellipsisWidth(s) {
    try {
      if (!measure && typeof w.OffscreenCanvas === 'function') measure = new w.OffscreenCanvas(1, 1).getContext('2d');
      if (measure) {
        measure.font = s.font || (s.fontSize + ' ' + s.fontFamily);
        var width = measure.measureText('\u2026').width;
        if (width > 0) return width;
      }
    } catch (e) { /* fall through */ }
    return parseFloat(s.fontSize) || 16;
  }

  // Names for the evidence.
  function idToken(el) { return el.id && /^[A-Za-z][\w-]*$/.test(el.id) ? el.id : ''; }
  function simple(el) {
    var s = tagOf(el);
    var id = idToken(el);
    if (id) return s + '#' + id;
    var cls = (el.getAttribute('class') || '').split(/\s+/)[0];
    if (cls && /^[\w-]+$/.test(cls)) return s + '.' + collapse(cls, 30);
    return s;
  }
  function selectorOf(el) {
    var parts = [simple(el)];
    var n = flatParent(el);
    for (var depth = 0; n && n !== document.body && n !== document.documentElement && depth < 2; depth += 1) {
      parts.unshift(simple(n));
      if (idToken(n)) break;
      n = flatParent(n);
    }
    return parts.join(' > ');
  }
  var KINDS = { dialog: 1, alertdialog: 1, form: 1, region: 1, navigation: 1, banner: 1, main: 1, contentinfo: 1,
    complementary: 1, search: 1, section: 1, fieldset: 1, nav: 1, header: 1, footer: 1, aside: 1, article: 1 };
  function nameOfContainer(el) {
    var label = el.getAttribute('aria-label');
    if (label && collapse(label, 60)) return collapse(label, 60);
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var rootNode = el.getRootNode && el.getRootNode();
      var texts = [];
      var ids = by.split(/\s+/).filter(Boolean);
      for (var i = 0; i < ids.length; i += 1) {
        var t = rootNode && rootNode.getElementById ? rootNode.getElementById(ids[i]) : null;
        if (t && collapse(t.textContent, 60)) texts.push(collapse(t.textContent, 60));
      }
      if (texts.length) return collapse(texts.join(' '), 60);
    }
    if (tagOf(el) === 'fieldset') {
      var legend = el.querySelector('legend');
      if (legend && collapse(legend.textContent, 60)) return collapse(legend.textContent, 60);
    }
    var heading = el.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && collapse(heading.textContent, 60)) return collapse(heading.textContent, 60);
    return null;
  }
  function containerName(el) {
    for (var n = el, i = 0; n && n !== document.body && i < DEPTH; n = flatParent(n), i += 1) {
      var role = (n.getAttribute('role') || '').toLowerCase();
      if (KINDS[role] === 1 || KINDS[tagOf(n)] === 1) {
        var name = nameOfContainer(n);
        if (name) return name;
      }
    }
    return null;
  }

  var vw = w.innerWidth;
  var vh = w.innerHeight;
  var items = [];
  for (var bi = 0; bi < blocks.length && items.length < MAX_ITEMS; bi += 1) {
    var block = blocks[bi];
    if (!visible(block)) continue;
    var chain = clipChain(block);
    if (!chain.length) continue;
    var nodes = nodesOf.get(block);
    var fits = true;
    for (var ni = 0; ni < nodes.length && fits; ni += 1) fits = nodeFits(nodes[ni], chain);
    if (fits) continue;

    var chars = charsOf(nodes);
    // 3. The clipping box: the nearest box outside which a non-blank character lies.
    var box = null;
    var cutX = false;
    var cutY = false;
    for (var ci = 0; ci < chain.length && !box; ci += 1) {
      for (var gi = 0; gi < chars.length; gi += 1) {
        if (!chars[gi].r) continue;
        if (outX(chars[gi].r, chain[ci])) cutX = true;
        if (outY(chars[gi].r, chain[ci])) cutY = true;
      }
      if (cutX || cutY) box = chain[ci];
    }
    if (!box) continue;
    var el = box.el;
    if (el.clientWidth < 2 || el.clientHeight < 2) continue;

    // 4. Can the user scroll the cut characters into view?
    var bs = style(el);
    var scrollX = (bs.overflowX === 'auto' || bs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
    var scrollY = (bs.overflowY === 'auto' || bs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    if (!((cutX && !scrollX) || (cutY && !scrollY))) continue;

    // 5. The visible part.
    var ks = style(block);
    var edge = Infinity;
    if (ks.textOverflow === 'ellipsis' && ks.overflowX !== 'visible' && block.scrollWidth > block.clientWidth) {
      edge = block.getBoundingClientRect().left + block.clientLeft + block.clientWidth - ellipsisWidth(ks);
    }
    var full = '';
    var shown = '';
    var hiddenByEllipsis = false;
    var all = null;
    var seen = null;
    for (var vi = 0; vi < chars.length; vi += 1) {
      var ch = chars[vi];
      full += ch.s;
      if (!ch.r) { shown += ' '; continue; }
      var r = ch.r;
      all = all ? { l: Math.min(all.l, r.left), t: Math.min(all.t, r.top), r: Math.max(all.r, r.right), b: Math.max(all.b, r.bottom) }
        : { l: r.left, t: r.top, r: r.right, b: r.bottom };
      var inside = true;
      for (var cj = 0; cj < chain.length && inside; cj += 1) if (outX(r, chain[cj]) || outY(r, chain[cj])) inside = false;
      if (inside && r.right > edge + TOLERANCE) inside = false;
      if (!inside) { if (edge !== Infinity) hiddenByEllipsis = true; continue; }
      shown += ch.s;
      seen = seen ? { l: Math.min(seen.l, r.left), t: Math.min(seen.t, r.top), r: Math.max(seen.r, r.right), b: Math.max(seen.b, r.bottom) }
        : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    shown = collapse(shown, MAX_TEXT);
    if (!shown || !seen || !all) continue;
    if (hiddenByEllipsis) shown = shown + '\u2026';

    items.push({
      selector: selectorOf(block),
      tag: tagOf(block),
      fullText: collapse(full, MAX_TEXT),
      visibleText: shown,
      textWidth: round(all.r - all.l),
      textHeight: round(all.b - all.t),
      boxIsBlock: el === block,
      boxSelector: selectorOf(el),
      boxTag: tagOf(el),
      boxName: containerName(el),
      boxWidth: el.clientWidth,
      boxHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      overflowX: bs.overflowX,
      overflowY: bs.overflowY,
      textOverflow: ks.textOverflow,
      cutX: cutX,
      cutY: cutY,
      inViewport: seen.r > 0 && seen.b > 0 && seen.l < vw && seen.t < vh,
    });
  }
  return { path: String(w.location.pathname), items: items };
})`;

/** The text quoted in the evidence of the outside-the-viewport case. */
export const OUTSIDE_VIEWPORT_NOTE = 'It was outside the visible part of the screen.';

/** The Finding's title (design "Bebe (Phase 2a) / Detectors"). */
export const CUT_OFF_TITLE = 'Text is cut off at 200% zoom';

function px(n: number): string {
  return String(Math.round(n));
}

/** The evidence for one cut-off text block. Every number in it is measured in the page. */
export function cutOffEvidence(path: string, item: CutOffItem, outsideViewport: boolean): string {
  const where = item.boxName ?? item.boxSelector;
  const axes = [item.cutX ? 'side' : '', item.cutY ? 'bottom or top' : ''].filter(Boolean).join(' and ');
  const parts = [
    `The text "${item.fullText}" is cut off: only "${item.visibleText}" fits inside its ${px(item.boxWidth)} px wide box (${where}), and the box can't be scrolled.`,
    `Measured on page ${path}: the text needs ${px(item.textWidth)} × ${px(item.textHeight)} px and is cut at the ${axes}.`,
    `The box, the <${item.boxTag}> at ${item.boxSelector}, is ${px(item.boxWidth)} × ${px(item.boxHeight)} px inside ` +
      `(its content is ${px(item.scrollWidth)} × ${px(item.scrollHeight)} px), with overflow-x: ${item.overflowX} and overflow-y: ${item.overflowY}` +
      (item.textOverflow === 'ellipsis' ? ', and the text has text-overflow: ellipsis.' : '.'),
  ];
  if (!item.boxIsBlock) parts.push(`The text is in the <${item.tag}> at ${item.selector}.`);
  if (outsideViewport) parts.push(OUTSIDE_VIEWPORT_NOTE);
  return parts.join(' ');
}

/** The problem's identity: the same text block with the same text on the same page. */
export function cutOffKey(path: string, item: CutOffItem): string {
  return `${path}|${item.selector}|${item.fullText}`;
}

interface Known {
  /** The first Step at which the problem was present, and what was measured then. */
  firstStep: number;
  path: string;
  item: CutOffItem;
  /** Already returned as a problem (at a Step where it was inside the viewport). */
  reported: boolean;
}

/**
 * Creates the `cut_off_text` Detector. Make a new one for each Run: it remembers the cut-off text it
 * has seen and which of it was already reported.
 */
export function createCutOffTextDetector(): Detector {
  const known = new Map<string, Known>();

  return {
    type: 'cut_off_text',

    async observe(ctx: DetectorContext) {
      const report = await ctx.inspect<CutOffReport>(READ_CUT_OFF_SCRIPT);
      const stepN = ctx.current.step.n;
      const problems: DetectedProblem[] = [];
      for (const item of report.items) {
        const key = cutOffKey(report.path, item);
        let entry = known.get(key);
        if (!entry) {
          entry = { firstStep: stepN, path: report.path, item, reported: false };
          known.set(key, entry);
        }
        if (entry.reported || !item.inViewport) continue;
        entry.reported = true;
        problems.push({
          key,
          stepN,
          title: CUT_OFF_TITLE,
          evidence: cutOffEvidence(report.path, item, false),
          screenshot: 'step',
        });
      }
      return problems;
    },

    async finish() {
      const problems: DetectedProblem[] = [];
      for (const [key, entry] of known) {
        if (entry.reported) continue;
        entry.reported = true;
        problems.push({
          key,
          stepN: entry.firstStep,
          title: CUT_OFF_TITLE,
          evidence: cutOffEvidence(entry.path, entry.item, true),
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
