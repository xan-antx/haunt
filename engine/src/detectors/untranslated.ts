import type { DetectedProblem, Detector, DetectorContext, RecordedStep } from '../core/types.ts';

/*
 * The `untranslated` Detector (Requirements 19.2 and 19.4, design "Bebe / Detectors / untranslated").
 *
 * It runs only when the page is shown in Punjabi: `document.documentElement.lang` starts with `pa`.
 * For each visible leaf text block (an element's own text nodes), each button or link (all its text)
 * and each placeholder of an empty field, it:
 *
 *   1. leaves out what Bebe typed (the `Type "..."` actions of the Steps so far), so a card number or
 *      a name she typed, echoed somewhere on the page, does not count. Fields that hold a value are
 *      not read at all, only placeholders of empty fields;
 *   2. removes the site's `allowedTerms` from the Haunt_Config (case-insensitive);
 *   3. removes acronyms (`\b[A-Z]{2,4}\b`) and tokens that contain a digit, an `@` (an e-mail
 *      address) or that start like a web address;
 *   4. counts the words matching `\b[A-Za-z]{3,}\b`.
 *
 * Two or more words is a Finding, with the key `<document>:<element key>|<text>`, so the same English
 * text in the same element is recorded once.
 *
 * The step rule: the Finding is reported at the first Step at which the text was inside the viewport,
 * from `observe()`. Text that was never inside the viewport is reported from `finish()` at the first
 * Step at which it was present, and its evidence ends with "It was outside the visible part of the
 * screen."
 *
 * "Visible" means rendered (not `display: none`, `visibility: hidden` or `opacity: 0`), with a box of
 * at least 2×2 CSS px after the clipping ancestors (so visually hidden "screen reader only" text is
 * left out). "Inside the viewport" means part of that box lies inside the viewport.
 *
 * Everything here only reads. The page-side script does not touch the DOM, focus, scroll or any
 * value; the one call that is not a plain read is `__haunt.keys.key`, which numbers an element in the
 * engine's own WeakMap. Create a new Detector for each Run with `createUntranslatedDetector()`.
 */

/** What kind of text a block is. */
export type BlockKind = 'text' | 'button' | 'link' | 'placeholder';

/** One block of text as the page-side script reports it. */
interface PageBlock {
  /** Engine element key, or `null` when the key script is not installed. */
  key: string | null;
  kind: BlockKind;
  /** Whitespace collapsed, at most 300 characters. */
  text: string;
  /** Placeholders only: the field's label, or `null` when it has none. */
  label: string | null;
  /** The nearest dialog, form, landmark or section and its name, for the evidence. */
  container: { kind: string; name: string | null } | null;
  /** Part of the block lies inside the viewport. */
  inView: boolean;
}

interface PageReport {
  /** Identifies the document (its navigation start). Element keys are only unique within one. */
  doc: string;
  /** `document.documentElement.lang` as written. */
  lang: string;
  path: string;
  /** Empty unless the lang starts with `pa`. */
  blocks: PageBlock[];
}

/**
 * Page-side function (as source text, for `ctx.inspect`). Plain JavaScript in a string so that no
 * transpiler helper can leak into the page. Pure reads only.
 */
const READ_TEXT_SCRIPT: string = String.raw`(function () {
  var keys = window.__haunt && window.__haunt.keys ? window.__haunt.keys : null;
  var lang = String(document.documentElement.getAttribute('lang') || '');
  var report = { doc: String(Math.round(performance.timeOrigin * 1000)), lang: lang, path: String(location.pathname), blocks: [] };
  if (!/^pa/i.test(lang.trim())) return report;

  var SKIP = { script: 1, style: 1, noscript: 1, template: 1, head: 1, title: 1, iframe: 1, object: 1, embed: 1,
    canvas: 1, video: 1, audio: 1, datalist: 1, option: 1, optgroup: 1, select: 1, svg: 1 };
  var BUTTON_INPUTS = { button: 1, submit: 1, reset: 1 };
  var NO_PLACEHOLDER = { checkbox: 1, radio: 1, hidden: 1, file: 1, image: 1, range: 1, color: 1, button: 1, submit: 1, reset: 1 };
  var INTERACTIVE = 'button, a[href], summary';
  var MAX_BLOCKS = 2000;
  var DEPTH = 500;
  var VIS = { opacityProperty: true, visibilityProperty: true };

  function collapse(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
  }

  function parentOf(n) {
    if (n.parentElement) return n.parentElement;
    var root = n.getRootNode ? n.getRootNode() : null;
    return root && root.host ? root.host : null;
  }

  function allElements(root, acc) {
    var list = root.querySelectorAll('*');
    for (var i = 0; i < list.length; i += 1) {
      acc.push(list[i]);
      if (list[i].shadowRoot) allElements(list[i].shadowRoot, acc);
    }
    return acc;
  }

  function skipped(el) {
    for (var n = el, i = 0; n && i < DEPTH; n = parentOf(n), i += 1) {
      if (SKIP[n.localName] === 1) return true;
    }
    return false;
  }

  function shown(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility(VIS);
    for (var n = el, i = 0; n && i < DEPTH; n = parentOf(n), i += 1) {
      var s = getComputedStyle(n);
      if (s.display === 'none' || s.opacity === '0') return false;
    }
    return getComputedStyle(el).visibility === 'visible';
  }

  // The rectangle the element's content can show in, from its clipping ancestors (null: clipped away).
  // includeSelf: the element's own overflow clips too (for its text content, not for its own box).
  function clipOf(el, includeSelf) {
    var l = -Infinity, t = -Infinity, r = Infinity, b = Infinity;
    for (var n = el, i = 0; n && i < DEPTH; n = parentOf(n), i += 1) {
      var s = getComputedStyle(n);
      if (s.clipPath && /inset\(\s*(50|100)%/.test(s.clipPath)) return null;
      var box = n.getBoundingClientRect();
      if ((s.position === 'absolute' || s.position === 'fixed') && s.clip && s.clip !== 'auto') {
        var m = /rect\(([^)]*)\)/.exec(s.clip);
        if (m) {
          var p = m[1].split(/[\s,]+/).filter(function (x) { return x.length > 0; }).map(parseFloat);
          if (p.length === 4 && p.every(function (x) { return !isNaN(x); })) {
            l = Math.max(l, box.left + p[3]); t = Math.max(t, box.top + p[0]);
            r = Math.min(r, box.left + p[1]); b = Math.min(b, box.top + p[2]);
          }
        }
      }
      if ((includeSelf || n !== el) && n !== document.documentElement && n !== document.body &&
          s.display !== 'inline' && s.display !== 'contents') {
        var left = box.left + n.clientLeft;
        var top = box.top + n.clientTop;
        if (s.overflowX !== 'visible') { l = Math.max(l, left); r = Math.min(r, left + n.clientWidth); }
        if (s.overflowY !== 'visible') { t = Math.max(t, top); b = Math.min(b, top + n.clientHeight); }
      }
      if (r - l < 2 || b - t < 2) return null;
    }
    return { l: l, t: t, r: r, b: b };
  }

  // { present, inView } for a list of rects inside the clipping rectangle of el.
  function placement(el, rects, includeSelf) {
    var clip = clipOf(el, includeSelf);
    var out = { present: false, inView: false };
    if (!clip) return out;
    var vw = window.innerWidth, vh = window.innerHeight;
    for (var i = 0; i < rects.length; i += 1) {
      var q = rects[i];
      var l = Math.max(q.left, clip.l), t = Math.max(q.top, clip.t);
      var r = Math.min(q.right, clip.r), b = Math.min(q.bottom, clip.b);
      if (r - l < 2 || b - t < 2) continue;
      out.present = true;
      if (Math.min(r, vw) - Math.max(l, 0) > 0 && Math.min(b, vh) - Math.max(t, 0) > 0) { out.inView = true; break; }
    }
    return out;
  }

  var range = document.createRange();
  function textRects(nodes) {
    var rects = [];
    for (var i = 0; i < nodes.length; i += 1) {
      range.selectNodeContents(nodes[i]);
      var list = range.getClientRects();
      for (var j = 0; j < list.length; j += 1) rects.push(list[j]);
    }
    return rects;
  }

  var ROLE_KIND = { dialog: 'dialog', alertdialog: 'dialog', form: 'form', region: 'region', navigation: 'navigation',
    banner: 'banner', main: 'main', contentinfo: 'footer', complementary: 'complementary' };
  var TAG_KIND = { dialog: 'dialog', form: 'form', section: 'section', fieldset: 'group', nav: 'navigation',
    header: 'header', footer: 'footer', main: 'main', aside: 'complementary', article: 'article' };

  function nameOfContainer(el) {
    var label = collapse(el.getAttribute('aria-label'), 60);
    if (label) return label;
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var root = el.getRootNode && el.getRootNode();
      var parts = [];
      var ids = by.split(/\s+/).filter(Boolean);
      for (var i = 0; i < ids.length; i += 1) {
        var target = root && root.getElementById ? root.getElementById(ids[i]) : null;
        if (target && collapse(target.textContent, 60)) parts.push(collapse(target.textContent, 60));
      }
      if (parts.length) return collapse(parts.join(' '), 60);
    }
    var heading = el.querySelector('h1, h2, h3, h4, h5, h6, legend');
    if (heading && collapse(heading.textContent, 60)) return collapse(heading.textContent, 60);
    return null;
  }

  function containerOf(el) {
    for (var n = parentOf(el), i = 0; n && i < DEPTH; n = parentOf(n), i += 1) {
      var role = (n.getAttribute('role') || '').toLowerCase();
      var kind = ROLE_KIND[role] || TAG_KIND[n.localName];
      if (kind) return { kind: kind, name: nameOfContainer(n) };
    }
    return null;
  }

  function labelOf(field) {
    if (field.labels && field.labels.length) {
      var t = collapse(field.labels[0].textContent, 60);
      if (t) return t;
    }
    return collapse(field.getAttribute('aria-label'), 60) || null;
  }

  function add(el, kind, text, rects, label) {
    text = collapse(text, 300);
    if (!/[A-Za-z]{3}/.test(text)) return;
    if (!shown(el)) return;
    var where = placement(el, rects, kind === 'text');
    if (!where.present) return;
    report.blocks.push({
      key: keys ? keys.key(el) : null,
      kind: kind,
      text: text,
      label: label,
      container: containerOf(el),
      inView: where.inView,
    });
  }

  var root = document.body || document.documentElement;
  var all = root ? allElements(root, [root]) : [];
  for (var i = 0; i < all.length && report.blocks.length < MAX_BLOCKS; i += 1) {
    var el = all[i];
    if (skipped(el)) continue;
    var outer = parentOf(el);
    if (outer && outer.closest && outer.closest(INTERACTIVE)) continue; // part of a button or link
    var tag = el.localName;

    if (el.matches(INTERACTIVE)) {
      add(el, tag === 'a' ? 'link' : 'button', el.textContent, el.getClientRects(), null);
      continue;
    }
    if (tag === 'input' || tag === 'textarea') {
      var type = tag === 'input' ? String(el.type || 'text').toLowerCase() : 'textarea';
      if (BUTTON_INPUTS[type] === 1) {
        add(el, 'button', el.value || '', el.getClientRects(), null);
      } else if (NO_PLACEHOLDER[type] !== 1 && String(el.value || '') === '') {
        // Only the placeholder of an empty field: what Bebe typed is never read.
        add(el, 'placeholder', el.placeholder || '', el.getClientRects(), labelOf(el));
      }
      continue;
    }

    var own = [];
    var kids = el.childNodes;
    for (var k = 0; k < kids.length; k += 1) {
      if (kids[k].nodeType === 3 && /\S/.test(kids[k].data)) own.push(kids[k]);
    }
    if (own.length === 0) continue;
    var text = '';
    for (var o = 0; o < own.length; o += 1) text += ' ' + own[o].data;
    add(el, 'text', text, textRects(own), null);
  }
  return report;
})`;

/** Wraps the helper above as a function expression, the form `ctx.inspect` expects. */
const INSPECT_SCRIPT = `() => ${READ_TEXT_SCRIPT}()`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes every case-insensitive occurrence of each term, longest first, leaving a space. A term
 * only matches where it is not glued to another letter or digit, so a typed "a" leaves "bill" alone.
 */
function removeTerms(text: string, terms: readonly string[]): string {
  const sorted = [...terms].map((t) => t.trim()).filter((t) => t !== '').sort((a, b) => b.length - a.length);
  let out = text;
  for (const term of sorted) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu'), ' ');
  }
  return out;
}

/** What to leave out of a text before counting its English words. */
export interface LeaveOut {
  /** The site's `allowedTerms` from the Haunt_Config. */
  allowedTerms: readonly string[];
  /** What the Ghost typed so far. */
  typed: readonly string[];
}

/**
 * The English words of three or more letters left in `text` after leaving out typed values, the
 * site's allowed terms (case-insensitive), acronyms of two to four capital letters and tokens that
 * contain a digit. In the order they appear.
 */
export function englishWords(text: string, leaveOut: LeaveOut): string[] {
  let rest = removeTerms(text, leaveOut.typed);
  rest = removeTerms(rest, leaveOut.allowedTerms);
  rest = rest
    .split(/\s+/)
    // Digits, e-mail addresses and web addresses are not words that could be translated.
    .filter((token) => !/\p{Nd}/u.test(token) && !/@|^(?:https?:\/\/|www\.)/i.test(token))
    .join(' ');
  rest = rest.replace(/\b[A-Z]{2,4}\b/g, ' ');
  return rest.match(/\b[A-Za-z]{3,}\b/g) ?? [];
}

/** The values typed in the Steps so far, from their `Type "..."` actions. */
export function typedValues(steps: readonly RecordedStep[]): string[] {
  const out: string[] = [];
  for (const recorded of steps) {
    const m = /^Type "([\s\S]*)"$/.exec(recorded.step.action);
    if (m && m[1]!.trim() !== '' && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What the Detector remembers about one block between Steps. */
interface Known {
  id: string;
  firstSeenStep: number;
  reported: boolean;
  /** The first observation, used when the block is never inside the viewport. */
  block: PageBlock;
  lang: string;
  path: string;
  words: string[];
}

function describeBlock(block: Pick<PageBlock, 'kind' | 'label'>): string {
  switch (block.kind) {
    case 'button':
      return 'button text';
    case 'link':
      return 'link text';
    case 'placeholder':
      return block.label ? `placeholder of the "${block.label}" field` : 'placeholder of a field with no label';
    default:
      return 'text';
  }
}

/** Builds the evidence: the text, the English words found, where it is and the page language. */
export function untranslatedEvidence(a: {
  block: Pick<PageBlock, 'kind' | 'text' | 'label' | 'container'>;
  words: readonly string[];
  lang: string;
  path: string;
  outsideView: boolean;
}): string {
  const { block, words } = a;
  const container = block.container
    ? block.container.name
      ? `, inside the "${block.container.name}" ${block.container.kind}`
      : `, inside a ${block.container.kind} with no name`
    : '';
  const quoted = words.map((w) => `"${w}"`);
  return (
    `The ${describeBlock(block)} "${block.text}" is in English on a page shown in Punjabi (lang="${a.lang}"). ` +
    `After leaving out the site's allowed terms, acronyms, tokens with digits and what Bebe typed, ` +
    `it still has ${words.length} English words: ${joinList(quoted)}. ` +
    `It is on page ${a.path}${container}.` +
    (a.outsideView ? ' It was outside the visible part of the screen.' : '')
  );
}

const TITLE = 'Text is in English on a Punjabi page';

/**
 * Creates the `untranslated` Detector. Make a new one for each Run: it remembers the text it has
 * seen so far.
 */
export function createUntranslatedDetector(): Detector {
  const known = new Map<string, Known>();

  return {
    type: 'untranslated',

    async observe(ctx: DetectorContext) {
      const report = await ctx.inspect<PageReport>(INSPECT_SCRIPT);
      if (!/^pa/i.test(report.lang.trim())) return [];
      const stepN = ctx.current.step.n;
      const leaveOut: LeaveOut = { allowedTerms: ctx.site.allowedTerms, typed: typedValues(ctx.steps) };
      const problems: DetectedProblem[] = [];

      report.blocks.forEach((block, index) => {
        const words = englishWords(block.text, leaveOut);
        if (words.length < 2) return;
        const id = `${report.doc}:${block.key ?? `block-${index}`}|${block.text}`;
        let entry = known.get(id);
        if (!entry) {
          entry = { id, firstSeenStep: stepN, reported: false, block, lang: report.lang, path: report.path, words };
          known.set(id, entry);
        }
        if (entry.reported || !block.inView) return;
        entry.reported = true;
        problems.push({
          key: id,
          stepN,
          title: TITLE,
          evidence: untranslatedEvidence({ block, words, lang: report.lang, path: report.path, outsideView: false }),
          screenshot: 'step',
        });
      });
      return problems;
    },

    async finish() {
      const problems: DetectedProblem[] = [];
      for (const entry of known.values()) {
        if (entry.reported) continue;
        entry.reported = true;
        problems.push({
          key: entry.id,
          stepN: entry.firstSeenStep,
          title: TITLE,
          evidence: untranslatedEvidence({
            block: entry.block,
            words: entry.words,
            lang: entry.lang,
            path: entry.path,
            outsideView: true,
          }),
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
