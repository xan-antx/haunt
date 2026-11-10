import { buildHeard, type RawAxNode } from '../ghosts/listener/ax.ts';
import type { DetectedProblem, Detector, DetectorContext } from '../core/types.ts';

/*
 * The `unlabeled_button` Detector (Requirements 10.1 and 10.2).
 *
 * It records one Finding for each rendered element whose role is `button`, that is not hidden from
 * assistive technology, and whose accessible name in the Accessibility_Tree is empty.
 *
 * How it decides (nothing here computes an accessible name):
 *   1. After every Step it reads `Accessibility.getFullAXTree`. Nodes that Chromium marks as ignored
 *      (`aria-hidden`, `hidden`, `display: none`, `inert`, ...) are not in play. A node with role
 *      `button` and an empty computed name is an unlabeled button.
 *   2. It finds the DOM element behind each such node. The read-only CDP wrapper cannot turn a
 *      `backendDOMNodeId` into a page object, so it takes the node's tag and attributes from
 *      `DOM.describeNode` and its border box from `DOM.getBoxModel`, and one read-only `inspect` call
 *      picks the element with the same tag, the same attributes and the same box. Identical twins are
 *      told apart by document order, which is the order of the Accessibility_Tree.
 *   3. The same `inspect` call asks the element for its engine key (`page/elementKeys.ts`), the same
 *      key the Body writes into `StepTrace.keys[].focusKey` when the element has focus, and reads what
 *      the evidence needs (where it is, what it contains, which naming sources it lacks).
 *
 * The Finding is written in `finish()` and not in `observe()`, so that its Step can be moved to the
 * first Step at which The Listener focused the button, even when that happens after the Detector
 * first saw the button. The Detector keeps what it has seen in a closure, so create a new one for
 * each Run with `createUnlabeledButtonDetector()`. The same page states and Step history always give
 * the same Findings.
 *
 * Everything here only reads: `inspect` scripts do not touch the DOM, focus, scroll or any value, and
 * the CDP calls are the three read-only ones.
 */

/** What the page-side script reports about one element. */
interface PageItem {
  /** Engine element key, or `null` when the key script is not installed. */
  key: string | null;
  /** The opening tag in short form, for example `<button type="submit">`. */
  open: string;
  /** A short selector, for example `form#pay > button[type=submit]`. */
  selector: string;
  /**
   * The nearest dialog, form, landmark or section around the element, nearest first, going outwards
   * until one has a name (at most three).
   */
  containers: { kind: string; name: string | null }[];
  /** The element's own text, whitespace collapsed and cut to 60 characters. */
  text: string;
  /** Short forms of the element children, for example `<svg aria-hidden="true">`. */
  children: string[];
  /** Number of element children, including those not listed in `children`. */
  childCount: number;
  ariaLabel: string | null;
  labelledby: { ids: string; foundTexts: number; missing: number } | null;
  title: string | null;
}

interface PageReport {
  /** Identifies the document (its navigation start). Element keys are only unique within one. */
  doc: string;
  /** One entry per descriptor, in the same order; `null` when no element matched. */
  items: (PageItem | null)[];
}

/** What `DOM.describeNode` and `DOM.getBoxModel` said about one unlabeled button. */
interface Descriptor {
  backendNodeId: number;
  nodeName: string;
  /** Flat list: name, value, name, value ... in source order. */
  attributes: string[];
  /** Border box in CSS px (x, y, w, h), or `null` when the element has no box. */
  box: [number, number, number, number] | null;
}

/** What the Detector remembers about one button between Steps. */
interface Known {
  /** Document and element key. */
  id: string;
  doc: string;
  elementKey: string | null;
  backendNodeId: number;
  /** The first Step on which the Detector saw it. */
  firstSeenStep: number;
  /** The page path at that Step. */
  path: string;
  /** Position among all buttons in the Accessibility_Tree, and how many there were. */
  ordinal: number;
  buttonCount: number;
  item: PageItem;
}

/**
 * Page-side function (as source text, for `ctx.inspect`). Plain JavaScript in a string so that no
 * transpiler helper can leak into the page. Pure reads only; the one call that is not a plain read is
 * `__haunt.keys.key`, which numbers an element in the engine's own WeakMap and never touches the page.
 */
const READ_BUTTONS_SCRIPT: string = String.raw`(function (descriptors) {
  var keys = window.__haunt && window.__haunt.keys ? window.__haunt.keys : null;
  var SEP = '\u0001';

  function collapse(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
  }

  function allElements(root, acc) {
    var list = root.querySelectorAll('*');
    for (var i = 0; i < list.length; i += 1) {
      acc.push(list[i]);
      if (list[i].shadowRoot) allElements(list[i].shadowRoot, acc);
    }
    return acc;
  }

  function attrsOf(el) {
    var out = [];
    for (var i = 0; i < el.attributes.length; i += 1) out.push(el.attributes[i].name, el.attributes[i].value);
    return out;
  }

  function sameBox(el, box) {
    var r = el.getBoundingClientRect();
    return Math.abs(r.left - box[0]) <= 2 && Math.abs(r.top - box[1]) <= 2 &&
      Math.abs(r.width - box[2]) <= 2 && Math.abs(r.height - box[3]) <= 2;
  }

  function idToken(el) {
    return el.id && /^[A-Za-z][\w-]*$/.test(el.id) ? el.id : '';
  }

  function simple(el) {
    var s = el.localName;
    var id = idToken(el);
    if (id) return s + '#' + id;
    var type = el.getAttribute('type');
    if (type && /^[\w-]+$/.test(type) && (s === 'button' || s === 'input')) return s + '[type=' + type + ']';
    var role = el.getAttribute('role');
    if (role && /^[\w-]+$/.test(role)) return s + '[role=' + role + ']';
    var cls = (el.getAttribute('class') || '').split(/\s+/)[0];
    if (cls && /^[\w-]+$/.test(cls)) return s + '.' + collapse(cls, 30);
    return s;
  }

  function selectorOf(el) {
    var parts = [simple(el)];
    var n = el.parentElement;
    var depth = 0;
    while (n && n !== document.body && n !== document.documentElement && depth < 2) {
      parts.unshift(simple(n));
      if (idToken(n)) break;
      n = n.parentElement;
      depth += 1;
    }
    return parts.join(' > ');
  }

  function openTag(el) {
    var s = '<' + el.localName;
    var type = el.getAttribute('type');
    var role = el.getAttribute('role');
    if (type !== null) s += ' type="' + collapse(type, 20) + '"';
    if (role !== null) s += ' role="' + collapse(role, 20) + '"';
    return s + '>';
  }

  function childTag(el) {
    var s = '<' + el.localName;
    var names = ['role', 'aria-hidden', 'alt', 'class'];
    for (var i = 0; i < names.length; i += 1) {
      var v = el.getAttribute(names[i]);
      if (v !== null) s += ' ' + names[i] + '="' + collapse(v, 30) + '"';
    }
    return s + '>';
  }

  function textById(el, ids) {
    var root = el.getRootNode && el.getRootNode();
    var found = 0;
    var missing = 0;
    var list = ids.split(/\s+/).filter(Boolean);
    for (var i = 0; i < list.length; i += 1) {
      var target = root && root.getElementById ? root.getElementById(list[i]) : document.getElementById(list[i]);
      if (!target) missing += 1;
      else if (collapse(target.textContent, 200) !== '') found += 1;
    }
    return { ids: collapse(ids, 60), foundTexts: found, missing: missing };
  }

  var ROLE_KIND = { dialog: 'dialog', alertdialog: 'dialog', form: 'form', region: 'region', navigation: 'navigation',
    banner: 'banner', main: 'main', contentinfo: 'footer', complementary: 'complementary', search: 'search' };
  var TAG_KIND = { dialog: 'dialog', form: 'form', section: 'section', fieldset: 'group', nav: 'navigation',
    header: 'header', footer: 'footer', main: 'main', aside: 'complementary', article: 'article' };

  function nameOfContainer(el) {
    var label = el.getAttribute('aria-label');
    if (label && collapse(label, 60)) return collapse(label, 60);
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var root = el.getRootNode && el.getRootNode();
      var parts = [];
      var ids = by.split(/\s+/).filter(Boolean);
      for (var i = 0; i < ids.length; i += 1) {
        var t = root && root.getElementById ? root.getElementById(ids[i]) : null;
        if (t && collapse(t.textContent, 60)) parts.push(collapse(t.textContent, 60));
      }
      if (parts.length) return collapse(parts.join(' '), 60);
    }
    if (el.localName === 'fieldset') {
      var legend = el.querySelector('legend');
      if (legend && collapse(legend.textContent, 60)) return collapse(legend.textContent, 60);
    }
    var heading = el.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && collapse(heading.textContent, 60)) return collapse(heading.textContent, 60);
    return null;
  }

  // The nearest dialog, form, landmark or section, then the ones around it up to the first that has a name.
  function containersOf(el) {
    var out = [];
    var n = el.parentElement;
    for (var i = 0; n && i < 500 && out.length < 3; i += 1) {
      var role = (n.getAttribute('role') || '').toLowerCase();
      var kind = ROLE_KIND[role] || TAG_KIND[n.localName];
      if (kind) {
        var name = nameOfContainer(n);
        out.push({ kind: kind, name: name });
        if (name) break;
      }
      var root = n.getRootNode ? n.getRootNode() : null;
      n = n.parentElement || (root && root.host) || null;
    }
    return out;
  }

  function describe(el) {
    var kids = el.children;
    var listed = [];
    for (var i = 0; i < kids.length && listed.length < 4; i += 1) listed.push(childTag(kids[i]));
    var own = {
      key: keys ? keys.key(el) : null,
      open: openTag(el),
      selector: selectorOf(el),
      containers: containersOf(el),
      text: collapse(el.textContent, 60),
      children: listed,
      childCount: kids.length,
      ariaLabel: el.getAttribute('aria-label'),
      labelledby: null,
      title: el.getAttribute('title'),
    };
    var by = el.getAttribute('aria-labelledby');
    if (by !== null) own.labelledby = textById(el, by);
    return own;
  }

  var all = allElements(document, []);
  var byName = new Map();
  for (var i = 0; i < all.length; i += 1) {
    var list = byName.get(all[i].localName);
    if (!list) { list = []; byName.set(all[i].localName, list); }
    list.push(all[i]);
  }

  var used = new Set();
  var items = [];
  for (var d = 0; d < descriptors.length; d += 1) {
    var want = descriptors[d];
    var same = (byName.get(String(want.nodeName).toLowerCase()) || []).filter(function (el) {
      return !used.has(el) && attrsOf(el).join(SEP) === want.attributes.join(SEP);
    });
    var pick = null;
    if (want.box) {
      for (var j = 0; j < same.length && !pick; j += 1) if (sameBox(same[j], want.box)) pick = same[j];
    }
    if (!pick && same.length) pick = same[0];
    if (pick) used.add(pick);
    items.push(pick ? describe(pick) : null);
  }
  return { doc: String(Math.round(performance.timeOrigin * 1000)), items: items };
})`;

/** Wraps the helper above as a function expression, the form `ctx.inspect` expects. */
const INSPECT_SCRIPT = `(arg) => ${READ_BUTTONS_SCRIPT}(arg.descriptors)`;

interface DescribeNodeResult {
  node: { nodeName: string; attributes?: string[] };
}
interface BoxModelResult {
  model: { border: number[] };
}

/** The unlabeled buttons of the Accessibility_Tree in tree order, and how many buttons there are. */
async function readUnlabeled(ctx: DetectorContext): Promise<{ descriptors: Descriptor[]; ordinals: number[]; total: number }> {
  const { nodes } = await ctx.cdp.send<{ nodes: RawAxNode[] }>('Accessibility.getFullAXTree');

  // `buildHeard` puts the nodes in tree (document) order and leaves out the ignored ones, which are
  // the nodes hidden from assistive technology. Its refs are `ax-<backendDOMNodeId>`.
  const backendByRef = new Map<string, number>();
  for (const node of nodes) {
    if (node.backendDOMNodeId !== undefined) backendByRef.set(`ax-${node.backendDOMNodeId}`, node.backendDOMNodeId);
  }
  const heard = buildHeard(nodes, { title: '', path: '', readingPosition: null, announcements: [] });

  const descriptors: Descriptor[] = [];
  const ordinals: number[] = [];
  let total = 0;
  for (const node of heard.nodes) {
    if (node.role !== 'button') continue;
    total += 1;
    const backendNodeId = backendByRef.get(node.ref);
    if (node.name.trim() !== '' || backendNodeId === undefined) continue;

    let described: DescribeNodeResult;
    try {
      described = await ctx.cdp.send<DescribeNodeResult>('DOM.describeNode', { backendNodeId });
    } catch {
      continue; // the element went away between the two reads
    }
    let box: Descriptor['box'] = null;
    try {
      const { model } = await ctx.cdp.send<BoxModelResult>('DOM.getBoxModel', { backendNodeId });
      const xs = [model.border[0], model.border[2], model.border[4], model.border[6]];
      const ys = [model.border[1], model.border[3], model.border[5], model.border[7]];
      if ([...xs, ...ys].every((n) => typeof n === 'number' && Number.isFinite(n))) {
        const left = Math.min(...(xs as number[]));
        const top = Math.min(...(ys as number[]));
        box = [left, top, Math.max(...(xs as number[])) - left, Math.max(...(ys as number[])) - top];
      }
    } catch {
      box = null; // no layout box (for example a zero-size or detached element)
    }
    descriptors.push({ backendNodeId, nodeName: described.node.nodeName, attributes: described.node.attributes ?? [], box });
    ordinals.push(total);
  }
  return { descriptors, ordinals, total };
}

/** What to show when the page-side script could not find the element: only what CDP said. */
function itemFromDescriptor(d: Descriptor): PageItem {
  const attr = (name: string): string | null => {
    for (let i = 0; i + 1 < d.attributes.length; i += 2) if (d.attributes[i] === name) return d.attributes[i + 1] ?? '';
    return null;
  };
  const tag = d.nodeName.toLowerCase();
  const type = attr('type');
  const role = attr('role');
  const by = attr('aria-labelledby');
  return {
    key: null,
    open: `<${tag}${type !== null ? ` type="${type}"` : ''}${role !== null ? ` role="${role}"` : ''}>`,
    selector: tag,
    containers: [],
    text: '',
    children: [],
    childCount: 0,
    ariaLabel: attr('aria-label'),
    labelledby: by !== null ? { ids: by, foundTexts: 0, missing: by.split(/\s+/).filter(Boolean).length } : null,
    title: attr('title'),
  };
}

function withArticle(tag: string): string {
  // "an" before a vowel sound; tag names read letter by letter (svg, hr, li, ol) start with a vowel sound too.
  return /^<([aeiou]|svg\b|hr\b|li\b|ol\b)/i.test(tag) ? `an ${tag}` : `a ${tag}`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function describeContents(item: PageItem): string {
  const listed = item.children;
  const extra = item.childCount - listed.length;
  const elements =
    listed.length === 0
      ? ''
      : listed.length === 1 && extra === 0
        ? withArticle(listed[0]!)
        : `${joinList(listed)}${extra > 0 ? ` and ${extra} more element${extra === 1 ? '' : 's'}` : ''}`;
  if (item.text === '' && elements === '') return 'is empty';
  if (item.text === '') return `contains only ${elements}`;
  const text = `the text "${item.text}" (which does not give it a name)`;
  return elements === '' ? `contains ${text}` : `contains ${text} and ${elements}`;
}

function describeSources(item: PageItem): string {
  const parts: string[] = [];
  parts.push(item.text === '' ? 'no text' : 'no usable text');
  if (item.ariaLabel === null) parts.push('no aria-label');
  else parts.push(item.ariaLabel.trim() === '' ? 'a blank aria-label' : 'an aria-label that gives no name');
  if (item.labelledby === null) parts.push('no aria-labelledby');
  else if (item.labelledby.missing > 0 && item.labelledby.foundTexts === 0) {
    parts.push(`an aria-labelledby ("${item.labelledby.ids}") that points to nothing`);
  } else parts.push(`an aria-labelledby ("${item.labelledby.ids}") whose target has no text`);
  if (item.title === null) parts.push('no title');
  else parts.push(item.title.trim() === '' ? 'a blank title' : 'a title that gives no name');
  return joinList(parts);
}

function describeWhere(item: PageItem): string {
  if (item.containers.length === 0) return 'directly on the page, outside any dialog, form or landmark';
  const parts = item.containers.map((c, i) => {
    const what = c.name !== null ? `the "${c.name}" ${c.kind}` : `a ${c.kind} with no name`;
    return i === 0 ? `inside ${what}` : `within ${what}`;
  });
  return parts.join(', ');
}

function buildEvidence(known: Known, focusedAt: number | null): string {
  const item = known.item;
  const focus =
    focusedAt !== null
      ? `The Listener first focused it at Step ${focusedAt}.`
      : `The Listener never focused it; it was first present at Step ${known.firstSeenStep}.`;
  return (
    `On page ${known.path}, the ${item.open} at ${item.selector} (button ${known.ordinal} of ${known.buttonCount} on the page), ` +
    `${describeWhere(item)}, ${describeContents(item)}. ` +
    `It has ${describeSources(item)}, so a screen reader says only "button". ${focus}`
  );
}

/**
 * Creates the `unlabeled_button` Detector. Make a new one for each Run: it remembers the buttons it
 * has seen so far.
 */
export function createUnlabeledButtonDetector(): Detector {
  /** Buttons seen so far, in the order they were first seen. */
  const known = new Map<string, Known>();
  /** The document each Step was observed in, to match element keys only within one document. */
  const docByStep = new Map<number, string>();

  async function scan(ctx: DetectorContext): Promise<void> {
    const { descriptors, ordinals, total } = await readUnlabeled(ctx);
    const report = await ctx.inspect<PageReport>(INSPECT_SCRIPT, { descriptors });
    const stepN = ctx.current.step.n;
    docByStep.set(stepN, report.doc);

    descriptors.forEach((descriptor, index) => {
      const item = report.items[index] ?? null;
      const elementKey = item?.key ?? null;
      const id = `${report.doc}:${elementKey ?? `ax-${descriptor.backendNodeId}`}`;
      if (known.has(id)) return;
      known.set(id, {
        id,
        doc: report.doc,
        elementKey,
        backendNodeId: descriptor.backendNodeId,
        firstSeenStep: stepN,
        path: ctx.current.step.page,
        ordinal: ordinals[index] ?? index + 1,
        buttonCount: total,
        item: item ?? itemFromDescriptor(descriptor),
      });
    });
  }

  /** The first Step at which The Listener focused this button, or `null`. */
  function firstFocusStep(ctx: DetectorContext, entry: Known): number | null {
    if (entry.elementKey === null) return null;
    for (const recorded of ctx.steps) {
      if (docByStep.get(recorded.step.n) !== entry.doc) continue;
      if (recorded.trace.keys.some((k) => k.focusKey === entry.elementKey)) return recorded.step.n;
    }
    return null;
  }

  return {
    type: 'unlabeled_button',

    async observe(ctx) {
      await scan(ctx);
      return [];
    },

    async finish(ctx) {
      const problems: DetectedProblem[] = [];
      for (const entry of known.values()) {
        const focusedAt = firstFocusStep(ctx, entry);
        problems.push({
          key: entry.id,
          stepN: focusedAt ?? entry.firstSeenStep,
          title: 'Button has no accessible name',
          evidence: buildEvidence(entry, focusedAt),
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
