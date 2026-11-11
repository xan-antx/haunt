import type { DetectedProblem, Detector, DetectorContext } from '../core/types.ts';
import { AMOUNT_PATTERN_SOURCE, findAmounts, firstAmount, formatAmount, type Amount } from './money.ts';

/*
 * The `dark_pattern` Detector (Requirements 19.3, 19.4 and 19.5; design "Bebe / Detectors / dark_pattern").
 *
 * The bill amount is the first amount (`money.ts`) in the rendered text (`document.body.innerText`) of
 * the first page, read when Step 1 settles. When Step 1 shows no amount there is no bill amount, and
 * no total is compared with it.
 *
 * Two kinds of Finding:
 *
 *   `pre-ticked|<doc>:<key>`  A visible checkbox (`input[type=checkbox]` or `[role=checkbox]`) whose
 *                             label text contains an amount, that was ticked the first time the
 *                             Detector saw it, and that was not in `touchedKeys` of any Step up to
 *                             then. A checkbox the ghost ticked itself first appears unticked, so it
 *                             never counts.
 *   `total|<doc>:<key>`       A visible element holding an amount (the innermost element whose text
 *                             contains one) that is labelled as a total, and that shows an amount in
 *                             the bill's currency higher than the bill amount. It is labelled as a
 *                             total when its own text, or its nearest preceding label (the `dt` before
 *                             a `dd`, a `dt` or `label` right before it, or the text before it in the
 *                             same block after any earlier amount) contains `total`, `ਕੁੱਲ` or `कुल`.
 *
 * Step rule (Requirement 19.4): a Finding is reported at the first Step, from the one at which the
 * problem was first present, at which it was inside the viewport (its box, clipped by the viewport and
 * by every ancestor that clips its overflow, has an area). A problem that never was inside the
 * viewport is reported by `finish()` at the Step at which it was first present, and its evidence ends
 * with "It was outside the visible part of the screen."
 *
 * Element keys (`page/elementKeys.ts`) are numbered per document, so every key is kept together with
 * the document it came from (its `performance.timeOrigin`). A touch counts for a document when it was
 * recorded in a Step that ended in that document or started in it (a click that loaded a new page).
 * Elements without a key (the key script is not installed) are not tracked.
 *
 * Everything here only reads: the one `inspect` script reads text, attributes, `checked`, computed
 * styles and boxes, and uses a Range only to read text. Create a new Detector for each Run with
 * `createDarkPatternDetector()`: it remembers the bill amount and what it has seen. The same page
 * states and Step history give the same Findings.
 */

export const PRE_TICKED_TITLE = 'A paid option was ticked in advance';
export const TOTAL_TITLE = 'The total is higher than the bill';
export const OUTSIDE_SENTENCE = 'It was outside the visible part of the screen.';

/** One checkbox as the page-side script sees it. */
interface PageCheckbox {
  key: string | null;
  checked: boolean;
  /** Label text, whitespace collapsed. */
  label: string;
  inView: boolean;
}

/** One element holding an amount, as the page-side script sees it. */
interface PageAmount {
  key: string | null;
  /** The element's text, whitespace collapsed. */
  text: string;
  /** The `dt` before a `dd`, or a `dt`/`label` right before the element, or `null`. */
  prevLabel: string | null;
  /** Text before the element in its nearest block ancestor (last 200 characters). */
  preceding: string;
  inView: boolean;
}

interface PageReport {
  doc: string;
  /** `document.body.innerText` when asked for, else `null`. */
  text: string | null;
  checkboxes: PageCheckbox[];
  amounts: PageAmount[];
}

/**
 * Page-side function. Plain JavaScript in a string so that no transpiler helper can leak into the page.
 * Pure reads only; `__haunt.keys.key` numbers an element in the engine's own WeakMap and never
 * touches the page.
 */
const READ_SCRIPT: string = String.raw`(function (arg) {
  var keys = window.__haunt && window.__haunt.keys ? window.__haunt.keys : null;
  var amountRe = new RegExp(arg.amountSource);
  var SKIP = { script: 1, style: 1, noscript: 1, template: 1, head: 1, title: 1 };

  function collapse(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function allElements(root, acc) {
    var list = root.querySelectorAll('*');
    for (var i = 0; i < list.length; i += 1) {
      acc.push(list[i]);
      if (list[i].shadowRoot) allElements(list[i].shadowRoot, acc);
    }
    return acc;
  }

  function hasArea(el) {
    var rects = el.getClientRects();
    for (var i = 0; i < rects.length; i += 1) if (rects[i].width > 0 && rects[i].height > 0) return true;
    return false;
  }

  function rendered(el) {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false;
    if (getComputedStyle(el).visibility !== 'visible') return false;
    return hasArea(el);
  }

  function parentOf(n) {
    var root = n.getRootNode ? n.getRootNode() : null;
    return n.parentElement || (root && root.host) || null;
  }

  // The element's box, clipped by the viewport and by every ancestor that clips its overflow.
  function inView(el) {
    var r = el.getBoundingClientRect();
    var left = Math.max(r.left, 0);
    var top = Math.max(r.top, 0);
    var right = Math.min(r.right, window.innerWidth);
    var bottom = Math.min(r.bottom, window.innerHeight);
    var fixed = getComputedStyle(el).position === 'fixed';
    for (var n = parentOf(el), i = 0; n && !fixed && i < 500 && left < right && top < bottom; i += 1) {
      if (n === document.body || n === document.documentElement) break;
      var cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        var c = n.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { left = Math.max(left, c.left); right = Math.min(right, c.right); }
        if (cs.overflowY !== 'visible') { top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom); }
      }
      if (cs.position === 'fixed') fixed = true;
      n = parentOf(n);
    }
    return right - left >= 1 && bottom - top >= 1;
  }

  function textOfIds(el, ids) {
    var root = el.getRootNode && el.getRootNode();
    var parts = [];
    var list = String(ids).split(/\s+/).filter(Boolean);
    for (var i = 0; i < list.length; i += 1) {
      var t = root && root.getElementById ? root.getElementById(list[i]) : document.getElementById(list[i]);
      if (t) parts.push(collapse(t.textContent));
    }
    return collapse(parts.join(' '));
  }

  function checkboxOf(el) {
    var isInput = el.localName === 'input' && String(el.type).toLowerCase() === 'checkbox';
    var labelEls = isInput && el.labels ? Array.prototype.slice.call(el.labels) : [];
    var label = '';
    var by = el.getAttribute('aria-labelledby');
    if (by) label = textOfIds(el, by);
    if (!label) label = collapse(labelEls.map(function (l) { return l.textContent; }).join(' '));
    if (!label) label = collapse(el.getAttribute('aria-label'));
    if (!label && !isInput) label = collapse(el.textContent);
    var visible = rendered(el) || labelEls.some(rendered);
    if (!visible) return null;
    var seen = inView(el) || labelEls.some(function (l) { return rendered(l) && inView(l); });
    return {
      key: keys ? keys.key(el) : null,
      checked: isInput ? !!el.checked : el.getAttribute('aria-checked') === 'true',
      label: label,
      inView: seen,
    };
  }

  function isInline(el) {
    var d = getComputedStyle(el).display;
    return d.indexOf('inline') === 0 || d === 'contents';
  }

  function prevLabelOf(el) {
    var prev = el.previousElementSibling;
    if (el.localName === 'dd') {
      while (prev && prev.localName !== 'dt') prev = prev.previousElementSibling;
      return prev ? collapse(prev.textContent) : null;
    }
    if (prev && (prev.localName === 'dt' || prev.localName === 'label')) return collapse(prev.textContent);
    return null;
  }

  function precedingOf(el) {
    var block = parentOf(el);
    while (block && block !== document.body && isInline(block)) block = parentOf(block);
    if (!block || block.getRootNode() !== el.getRootNode()) return '';
    var range = document.createRange();
    range.setStart(block, 0);
    range.setEndBefore(el);
    var text = collapse(range.toString());
    return text.length > 200 ? text.slice(text.length - 200) : text;
  }

  var all = allElements(document, []);
  var checkboxes = [];
  var amounts = [];
  for (var i = 0; i < all.length; i += 1) {
    var el = all[i];
    if (SKIP[el.localName]) continue;
    if ((el.localName === 'input' && String(el.type).toLowerCase() === 'checkbox') ||
        (el.getAttribute('role') || '').toLowerCase() === 'checkbox') {
      var box = checkboxOf(el);
      if (box) checkboxes.push(box);
    }
    var text = collapse(el.textContent);
    if (!amountRe.test(text)) continue;
    var inner = false;
    for (var c = 0; c < el.children.length && !inner; c += 1) {
      if (!SKIP[el.children[c].localName] && amountRe.test(collapse(el.children[c].textContent))) inner = true;
    }
    if (inner || !rendered(el)) continue;
    amounts.push({
      key: keys ? keys.key(el) : null,
      text: text,
      prevLabel: prevLabelOf(el),
      preceding: precedingOf(el),
      inView: inView(el),
    });
  }
  return {
    doc: String(Math.round(performance.timeOrigin * 1000)),
    text: arg.wantText && document.body ? document.body.innerText : null,
    checkboxes: checkboxes,
    amounts: amounts,
  };
})`;

const INSPECT_SCRIPT = `(arg) => ${READ_SCRIPT}(arg)`;

/** The words that label a total: English `total`, Punjabi `ਕੁੱਲ` (either mark order), Hindi `कुल`. */
const TOTAL_WORD = /\btotal|ਕ(?:ੁੱ|ੱੁ)ਲ|कुल/i;

/** Whether a text labels a total. */
export function isTotalLabel(text: string): boolean {
  return TOTAL_WORD.test(text.normalize('NFC'));
}

/** The nearest label in the text before an element: what follows the last amount in it, trimmed. */
export function nearestPrecedingLabel(preceding: string): string {
  const found = findAmounts(preceding);
  const last = found[found.length - 1];
  const after = last ? preceding.slice(last.index + last.text.length) : preceding;
  const trimmed = after.trim();
  return trimmed.length > 80 ? trimmed.slice(trimmed.length - 80).trim() : trimmed;
}

/** The text that labels an amount-holding element as a total, or `null` when nothing does. */
export function totalLabelOf(item: { text: string; prevLabel: string | null; preceding: string }): string | null {
  if (isTotalLabel(item.text)) return item.text;
  if (item.prevLabel !== null && isTotalLabel(item.prevLabel)) return item.prevLabel;
  const near = nearestPrecedingLabel(item.preceding);
  return isTotalLabel(near) ? near : null;
}

/** The highest amount in `text` in the bill's currency that is higher than the bill, or `null`. */
export function amountAboveBill(text: string, bill: Amount): Amount | null {
  let best: Amount | null = null;
  for (const a of findAmounts(text)) {
    if (a.currency !== bill.currency || a.minor <= bill.minor) continue;
    if (!best || a.minor > best.minor) best = a;
  }
  return best;
}

function quote(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Evidence for a pre-ticked paid option. */
export function preTickedEvidence(f: { label: string; price: string; path: string; firstStep: number; outside: boolean }): string {
  return (
    `The paid option "${quote(f.label)}" (${f.price}) was already ticked when it appeared on ${f.path} at Step ${f.firstStep}. ` +
    `Bebe did not tick it.${f.outside ? ` ${OUTSIDE_SENTENCE}` : ''}`
  );
}

/** Evidence for a total that is higher than the bill. */
export function totalEvidence(f: {
  shown: Amount;
  label: string;
  path: string;
  bill: Amount;
  billPath: string;
  outside: boolean;
}): string {
  const diff = formatAmount(f.bill.currency, f.shown.minor - f.bill.minor);
  const labelled = f.label.includes(f.shown.text) ? `"${quote(f.label)}"` : `"${quote(f.label)}" ${f.shown.text}`;
  return (
    `The total says ${f.shown.text} (${labelled}, on ${f.path}) but the bill was ${f.bill.text} (${diff} more). ` +
    `The bill amount is the first amount on the first page (${f.billPath}), read at Step 1.` +
    `${f.outside ? ` ${OUTSIDE_SENTENCE}` : ''}`
  );
}

interface SeenCheckbox {
  /** `true` when it is a pre-ticked paid option that the ghost had not touched when it appeared. */
  candidate: boolean;
  firstStep: number;
  path: string;
  label: string;
  price: string;
  reported: boolean;
}

interface SeenTotal {
  firstStep: number;
  path: string;
  label: string;
  shown: Amount;
  reported: boolean;
}

/** Creates the `dark_pattern` Detector. Make a new one for each Run. */
export function createDarkPatternDetector(): Detector {
  let bill: { amount: Amount; path: string } | null = null;
  const docByStep = new Map<number, string>();
  const checkboxes = new Map<string, SeenCheckbox>();
  const totals = new Map<string, SeenTotal>();

  /** Whether the ghost clicked or typed into this element in any Step up to `upTo`. */
  function touched(ctx: DetectorContext, doc: string, key: string, upTo: number): boolean {
    for (const recorded of ctx.steps) {
      const n = recorded.step.n;
      if (n > upTo) continue;
      if (docByStep.get(n) !== doc && docByStep.get(n - 1) !== doc) continue;
      if (recorded.trace.touchedKeys.includes(key)) return true;
    }
    return false;
  }

  return {
    type: 'dark_pattern',

    async observe(ctx) {
      const stepN = ctx.current.step.n;
      const path = ctx.current.step.page;
      const report = await ctx.inspect<PageReport>(INSPECT_SCRIPT, {
        amountSource: AMOUNT_PATTERN_SOURCE,
        wantText: stepN === 1,
      });
      docByStep.set(stepN, report.doc);
      if (stepN === 1) {
        const first = firstAmount(report.text ?? '');
        bill = first ? { amount: first, path } : null;
      }

      const problems: DetectedProblem[] = [];

      for (const box of report.checkboxes) {
        if (box.key === null) continue;
        const id = `${report.doc}:${box.key}`;
        let seen = checkboxes.get(id);
        if (!seen) {
          const price = firstAmount(box.label);
          seen = {
            candidate: price !== null && box.checked && !touched(ctx, report.doc, box.key, stepN),
            firstStep: stepN,
            path,
            label: box.label,
            price: price?.text ?? '',
            reported: false,
          };
          checkboxes.set(id, seen);
        }
        if (seen.candidate && !seen.reported && box.inView) {
          seen.reported = true;
          problems.push({
            key: `pre-ticked|${id}`,
            stepN,
            title: PRE_TICKED_TITLE,
            evidence: preTickedEvidence({ ...seen, outside: false }),
            screenshot: 'step',
          });
        }
      }

      if (bill) {
        for (const item of report.amounts) {
          if (item.key === null) continue;
          const id = `${report.doc}:${item.key}`;
          let seen = totals.get(id);
          if (!seen) {
            const label = totalLabelOf(item);
            const shown = label === null ? null : amountAboveBill(item.text, bill.amount);
            if (label === null || shown === null) continue;
            seen = { firstStep: stepN, path, label, shown, reported: false };
            totals.set(id, seen);
          }
          if (!seen.reported && item.inView) {
            seen.reported = true;
            problems.push({
              key: `total|${id}`,
              stepN,
              title: TOTAL_TITLE,
              evidence: totalEvidence({ ...seen, bill: bill.amount, billPath: bill.path, outside: false }),
              screenshot: 'step',
            });
          }
        }
      }

      return problems;
    },

    async finish() {
      const problems: DetectedProblem[] = [];
      for (const [id, seen] of checkboxes) {
        if (!seen.candidate || seen.reported) continue;
        seen.reported = true;
        problems.push({
          key: `pre-ticked|${id}`,
          stepN: seen.firstStep,
          title: PRE_TICKED_TITLE,
          evidence: preTickedEvidence({ ...seen, outside: true }),
          screenshot: 'step',
        });
      }
      if (bill) {
        for (const [id, seen] of totals) {
          if (seen.reported) continue;
          seen.reported = true;
          problems.push({
            key: `total|${id}`,
            stepN: seen.firstStep,
            title: TOTAL_TITLE,
            evidence: totalEvidence({ ...seen, bill: bill.amount, billPath: bill.path, outside: true }),
            screenshot: 'step',
          });
        }
      }
      return problems;
    },
  };
}
