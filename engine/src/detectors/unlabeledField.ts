import type { DetectedProblem, Detector, DetectorContext } from '../core/types.ts';
import { buildHeard, type HeardNode, type RawAxNode } from '../ghosts/listener/ax.ts';

/*
 * The `unlabeled_field` Detector.
 *
 * This part is the pure selection step. It decides on the name that Chromium computes in
 * `Accessibility.getFullAXTree` and on nothing else. It reads no `placeholder` or `aria-placeholder`
 * data and has no exemption for any attribute. There is no name computation in the page.
 */

/** The roles Chromium gives native form fields and text-box-like elements. */
export const FIELD_AX_ROLES: readonly string[] = [
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'checkbox',
  'radio',
  'switch',
  'slider',
  // Chromium's roles for the native date, time and color inputs (found by the fixture test).
  'Date',
  'DateTime',
  'InputTime',
  'ColorWell',
];

/** A node of the accessibility tree that is a field with an empty Computed_Name. */
export interface UnnamedFieldNode extends HeardNode {
  /** The DOM node behind it, when Chromium reported one. */
  backendNodeId: number | undefined;
}

/**
 * From the raw nodes of `Accessibility.getFullAXTree`, the nodes that Chromium does not ignore
 * (`aria-hidden`, `hidden`, `display: none`, `inert`), whose role is in `FIELD_AX_ROLES` and whose
 * name is empty after `trim()`, in tree order. Pure: the same nodes always give the same result.
 */
export function selectUnnamedFields(nodes: RawAxNode[]): UnnamedFieldNode[] {
  const backendByRef = new Map<string, number>();
  for (const node of nodes) {
    if (node.backendDOMNodeId !== undefined) backendByRef.set(`ax-${node.backendDOMNodeId}`, node.backendDOMNodeId);
  }
  const heard = buildHeard(nodes, { title: '', path: '', readingPosition: null, announcements: [] });
  const selected: UnnamedFieldNode[] = [];
  for (const node of heard.nodes) {
    if (!FIELD_AX_ROLES.includes(node.role)) continue;
    if (node.name.trim() !== '') continue;
    selected.push({ ...node, backendNodeId: backendByRef.get(node.ref) });
  }
  return selected;
}

/*
 * The detector itself. After every Step it reads `Accessibility.getFullAXTree`, selects the unnamed
 * fields with `selectUnnamedFields`, finds the page element behind each one (the same method as
 * `unlabeledButton.ts`: `DOM.describeNode` and `DOM.getBoxModel` give the tag, attributes and box, and
 * one read-only `inspect` call picks the element), and remembers it. `finish()` writes the Findings, so
 * that a Finding can be moved to the first Step at which The Listener focused the element.
 *
 * `placeholder` and `aria-placeholder` are read only to write the evidence. They never decide anything.
 */

interface PageItem {
  key: string | null;
  tag: string;
  role: string;
  type: string | null;
  selector: string;
  /** Where the element is, in words, for example `inside the "Sign in" form`. */
  where: string;
  placeholder: string | null;
  ariaPlaceholder: string | null;
  /** A reason the element is not a field a person fills in, or `null`. */
  ignored: string | null;
}

interface PageReport {
  doc: string;
  items: (PageItem | null)[];
}

interface Descriptor {
  backendNodeId: number;
  nodeName: string;
  attributes: string[];
  box: [number, number, number, number] | null;
  /** Chromium's role for the node. */
  role: string;
}

interface Known {
  id: string;
  doc: string;
  elementKey: string | null;
  firstSeenStep: number;
  path: string;
  item: PageItem;
}

/** Page-side function (as source text, for `ctx.inspect`). Pure reads only. */
const READ_FIELDS_SCRIPT: string = String.raw`(function (descriptors) {
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
    if (type && /^[\w-]+$/.test(type) && s === 'input') return s + '[type=' + type + ']';
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

  var ROLE_KIND = { dialog: 'dialog', alertdialog: 'dialog', form: 'form', region: 'region', navigation: 'navigation',
    banner: 'banner', main: 'main', contentinfo: 'footer', complementary: 'complementary', search: 'search' };
  var TAG_KIND = { dialog: 'dialog', form: 'form', section: 'section', fieldset: 'group', nav: 'navigation',
    header: 'header', footer: 'footer', main: 'main', aside: 'complementary', article: 'article' };

  function nameOfContainer(el) {
    var label = el.getAttribute('aria-label');
    if (label && collapse(label, 60)) return collapse(label, 60);
    var heading = el.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && collapse(heading.textContent, 60)) return collapse(heading.textContent, 60);
    return null;
  }

  function whereOf(el) {
    var n = el.parentElement;
    for (var i = 0; n && i < 500; i += 1) {
      var role = (n.getAttribute('role') || '').toLowerCase();
      var kind = ROLE_KIND[role] || TAG_KIND[n.localName];
      if (kind) {
        var name = nameOfContainer(n);
        return name ? 'inside the "' + name + '" ' + kind : 'inside a ' + kind + ' with no name';
      }
      var root = n.getRootNode ? n.getRootNode() : null;
      n = n.parentElement || (root && root.host) || null;
    }
    return 'directly on the page';
  }

  function visible(el) {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkVisibilityCSS: true })) return false;
    } else {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    var rects = el.getClientRects();
    for (var i = 0; i < rects.length; i += 1) if (rects[i].width > 0 && rects[i].height > 0) return true;
    return false;
  }

  var NATIVE = { input: 1, select: 1, textarea: 1 };
  var TEXTBOX_ROLES = { textbox: 1, searchbox: 1, combobox: 1 };
  var SKIP_TYPES = { hidden: 1, submit: 1, button: 1, reset: 1, image: 1 };

  function ignoredReason(el) {
    var tag = el.localName;
    var type = (el.getAttribute('type') || '').toLowerCase();
    var role = (el.getAttribute('role') || '').toLowerCase().split(/\s+/)[0];
    if (!NATIVE[tag] && !(TEXTBOX_ROLES[role] === 1)) return 'not a form field or text box';
    if (tag === 'input' && SKIP_TYPES[type]) return 'input of type ' + type;
    if (el.closest('[inert]')) return 'inert';
    if (el.closest('[aria-hidden="true"]')) return 'hidden from assistive technology';
    if (!visible(el)) return 'not visible';
    return null;
  }

  function describe(el, role) {
    var tag = el.localName;
    var ph = el.getAttribute('placeholder');
    var aph = el.getAttribute('aria-placeholder');
    return {
      key: keys ? keys.key(el) : null,
      tag: tag,
      role: role,
      type: el.getAttribute('type'),
      selector: selectorOf(el),
      where: whereOf(el),
      placeholder: ph !== null && collapse(ph, 60) ? collapse(ph, 60) : null,
      ariaPlaceholder: aph !== null && collapse(aph, 60) ? collapse(aph, 60) : null,
      ignored: ignoredReason(el),
    };
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
    items.push(pick ? describe(pick, want.role) : null);
  }
  return { doc: String(Math.round(performance.timeOrigin * 1000)), items: items };
})`;

const INSPECT_SCRIPT = `(arg) => ${READ_FIELDS_SCRIPT}(arg.descriptors)`;

interface DescribeNodeResult {
  node: { nodeName: string; attributes?: string[] };
}
interface BoxModelResult {
  model: { border: number[] };
}

async function readUnnamed(ctx: DetectorContext): Promise<Descriptor[]> {
  const { nodes } = await ctx.cdp.send<{ nodes: RawAxNode[] }>('Accessibility.getFullAXTree');
  const descriptors: Descriptor[] = [];
  for (const node of selectUnnamedFields(nodes)) {
    if (node.backendNodeId === undefined) continue;
    const backendNodeId = node.backendNodeId;
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
      box = null;
    }
    descriptors.push({ backendNodeId, nodeName: described.node.nodeName, attributes: described.node.attributes ?? [], box, role: node.role });
  }
  return descriptors;
}

/** What to show when the page script could not find the element: only what CDP said. */
function itemFromDescriptor(d: Descriptor): PageItem {
  const attr = (name: string): string | null => {
    for (let i = 0; i + 1 < d.attributes.length; i += 2) if (d.attributes[i] === name) return d.attributes[i + 1] ?? '';
    return null;
  };
  const tag = d.nodeName.toLowerCase();
  return { key: null, tag, role: d.role, type: attr('type'), selector: tag, where: '', placeholder: null, ariaPlaceholder: null, ignored: null };
}

function openTag(item: PageItem): string {
  return `<${item.tag}${item.type !== null ? ` type="${item.type}"` : ''} role="${item.role}">`;
}

function placeholderSentence(item: PageItem): string {
  if (item.ariaPlaceholder !== null) return `A placeholder is present (aria-placeholder "${item.ariaPlaceholder}") and is not providing a name. `;
  if (item.placeholder !== null) return `A placeholder is present (placeholder "${item.placeholder}") and is not providing a name. `;
  return '';
}

function buildEvidence(known: Known, focusedAt: number | null): string {
  const item = known.item;
  const where = item.where === '' ? '' : ` (${item.where})`;
  const focus =
    focusedAt !== null
      ? `The Listener first focused it at Step ${focusedAt}.`
      : `It was first present at Step ${known.firstSeenStep} and never focused.`;
  return (
    `On page ${known.path}, the ${openTag(item)} at ${item.selector}${where} has no accessible name: ` +
    `the name that Chromium computes for it is empty, so a screen reader says only the kind of field, for example "edit text". ` +
    `${placeholderSentence(item)}${focus}`
  );
}

/**
 * Creates the `unlabeled_field` Detector. Make a new one for each Run: it remembers the fields it has
 * seen so far. It decides on the Computed_Name from Chromium's accessibility tree and nothing else.
 */
export function createUnlabeledFieldDetector(): Detector {
  const known = new Map<string, Known>();
  const docByStep = new Map<number, string>();

  async function scan(ctx: DetectorContext): Promise<void> {
    const descriptors = await readUnnamed(ctx);
    const stepN = ctx.current.step.n;
    if (descriptors.length === 0) {
      docByStep.set(stepN, '');
      return;
    }
    const report = await ctx.inspect<PageReport>(INSPECT_SCRIPT, { descriptors });
    docByStep.set(stepN, report.doc);
    descriptors.forEach((descriptor, index) => {
      const matched = report.items[index] ?? null;
      if (matched !== null && matched.ignored !== null) return;
      const item = matched ?? itemFromDescriptor(descriptor);
      const elementKey = item.key;
      const id = `${report.doc}:${elementKey ?? `ax-${descriptor.backendNodeId}`}`;
      if (known.has(id)) return;
      known.set(id, { id, doc: report.doc, elementKey, firstSeenStep: stepN, path: ctx.current.step.page, item });
    });
  }

  function firstFocusStep(ctx: DetectorContext, entry: Known): number | null {
    if (entry.elementKey === null) return null;
    for (const recorded of ctx.steps) {
      if (docByStep.get(recorded.step.n) !== entry.doc) continue;
      if (recorded.trace.keys.some((k) => k.focusKey === entry.elementKey)) return recorded.step.n;
    }
    return null;
  }

  return {
    type: 'unlabeled_field',

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
          title: 'Form field has no accessible name',
          evidence: buildEvidence(entry, focusedAt),
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
