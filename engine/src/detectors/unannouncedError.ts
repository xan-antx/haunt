import type { DetectedProblem, Detector, DetectorContext, RecordedStep } from '../core/types.ts';
import { ERROR_CLASS_ID_SOURCE, looksLikeErrorText, normalizeText } from './errorWords.ts';

/*
 * The `unannounced_error` Detector (Requirements 10.5 and 10.6).
 *
 * Error text is any visible text that matches the error wording list (`errorWords.ts`), or that sits in an
 * element whose class or id contains `error` or `invalid`. After every Step, `observe` lists the visible
 * error texts and tracks each one, by element position and text, from the Step where it first appeared
 * until it disappears or the Run ends.
 *
 * A text counts as heard when, at any Step while it was visible:
 *   - a Live_Announcement of that Step contained it (`StepTrace.announcements`), or
 *   - the focused element's accessible description contained it (CDP `Accessibility.getFullAXTree`,
 *     which is where `aria-describedby` ends up).
 * The Step in which a text disappears still counts as one where it was visible.
 *
 * `finish` makes the decision at the end of the Run: every text that was never heard becomes a Problem at
 * the Step where it first appeared. That Step is an earlier one, which is allowed because Findings are only
 * written after the Run ends.
 *
 * All state is per Run and lives in the instance that `createUnannouncedErrorDetector` returns, so the same
 * page states and Step history give the same Problems. Page reads go through `ctx.inspect` and are pure.
 */

/** One visible element that may hold error text, as the page script reports it. */
interface PageEntry {
  /** Position of the element in the document, for example `html:nth-child(1)>body:nth-child(2)>div:nth-child(1)`. */
  path: string;
  tag: string;
  className: string;
  id: string;
  /** Rendered text of the element, whitespace collapsed. */
  text: string;
  /** The class or the id contains `error` or `invalid`. */
  byClass: boolean;
}

/** An error text that is being tracked. */
interface Tracked {
  key: string;
  /** Text as shown on the page. */
  text: string;
  /** Normalised and lower-cased, for comparisons. */
  match: string;
  tag: string;
  className: string;
  id: string;
  /** Step number where the text was first seen. */
  firstStep: number;
  /** Last Step at which it was visible. */
  lastVisibleStep: number;
  /** Last Step that counts for it: the last visible Step, or the Step in which it disappeared. */
  endStep: number;
  /** Number of Steps in which it was visible. */
  visibleSteps: number;
  /** The last Step counted in `visibleSteps`, so that observing the same Step twice counts it once. */
  countedStep: number;
  /** Still visible after the latest Step. */
  open: boolean;
  /** Heard in a description. (Heard in a Live_Announcement is worked out from the Step history.) */
  described: boolean;
}

/**
 * Page-side script, run through `inspect`: a pure read. It lists visible elements with their own text or
 * with a class or id that says `error` or `invalid`, leaving out controls, labels and elements that hold
 * form controls (a `has-error` wrapper around a whole form group is not an error message).
 */
const LIST_VISIBLE_TEXT_SCRIPT = String.raw`(arg) => {
  const classId = new RegExp(arg.classId, 'i');
  const skip = new Set(['html', 'body', 'head', 'script', 'style', 'noscript', 'template', 'title', 'meta', 'link',
    'label', 'legend', 'option', 'optgroup', 'button', 'input', 'select', 'textarea', 'svg']);
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const parent = n.parentElement;
      const index = parent ? Array.prototype.indexOf.call(parent.children, n) + 1 : 1;
      parts.push(n.localName + ':nth-child(' + index + ')');
    }
    return parts.reverse().join('>');
  };
  const isVisible = (el) => {
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const out = [];
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    if (skip.has(el.localName)) continue;
    let own = '';
    for (const child of el.childNodes) if (child.nodeType === 3) own += child.data;
    own = own.replace(/\s+/g, ' ').trim();
    const className = el.getAttribute('class') || '';
    const id = el.getAttribute('id') || '';
    const byClass = classId.test(className) || classId.test(id);
    if (!own && !byClass) continue;
    if (!isVisible(el)) continue;
    if (el.querySelector('input, select, textarea, button')) continue;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 300) continue;
    out.push({ path: pathOf(el), tag: el.localName, className, id, text, byClass });
  }
  return out;
}`;

/** The parts of a CDP `Accessibility.AXNode` this Detector reads. */
interface RawAxNode {
  ignored?: boolean;
  description?: { value?: unknown };
  properties?: { name: string; value?: { value?: unknown } }[];
}

function key(text: string): string {
  return normalizeText(text).toLowerCase();
}

function contains(haystack: string, needle: string): boolean {
  return needle !== '' && key(haystack).includes(needle);
}

/** Keeps the entries that are error text, and drops an element when something inside it is reported too. */
function errorEntries(entries: readonly PageEntry[]): PageEntry[] {
  const errors = entries.filter((entry) => entry.byClass || looksLikeErrorText(entry.text));
  return errors.filter((entry) => !errors.some((other) => other.path.startsWith(`${entry.path}>`)));
}

/** The text of the element for the evidence: `<div class="errorText" id="card-error">`. */
function describeElement(entry: Pick<Tracked, 'tag' | 'className' | 'id'>): string {
  const attributes = [
    entry.className ? ` class="${entry.className}"` : '',
    entry.id ? ` id="${entry.id}"` : '',
  ].join('');
  return `<${entry.tag}${attributes}>`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** `true` when a Live_Announcement made during the Steps where the text was visible contained it. */
function announced(tracked: Tracked, steps: readonly RecordedStep[]): boolean {
  for (const recorded of steps) {
    const n = recorded.step.n;
    if (n < tracked.firstStep || n > tracked.endStep) continue;
    if (recorded.trace.announcements.some((announcement) => contains(announcement, tracked.match))) return true;
  }
  return false;
}

async function focusedDescriptions(ctx: DetectorContext): Promise<string[]> {
  const { nodes } = await ctx.cdp.send<{ nodes: RawAxNode[] }>('Accessibility.getFullAXTree');
  const descriptions: string[] = [];
  for (const node of nodes) {
    if (node.ignored === true) continue;
    const focused = node.properties?.some((p) => p.name === 'focused' && (p.value?.value === true || p.value?.value === 'true'));
    const description = node.description?.value;
    if (focused && typeof description === 'string' && description !== '') descriptions.push(description);
  }
  return descriptions;
}

export function createUnannouncedErrorDetector(): Detector {
  /** Every text tracked in this Run, in the order it was first seen. */
  const all: Tracked[] = [];
  /** The texts that are visible now, by key. */
  let open = new Map<string, Tracked>();

  const isHeard = (tracked: Tracked, steps: readonly RecordedStep[]): boolean =>
    tracked.described || announced(tracked, steps);

  return {
    type: 'unannounced_error',

    async observe(ctx: DetectorContext): Promise<DetectedProblem[]> {
      const n = ctx.current.step.n;
      const entries = await ctx.inspect<PageEntry[]>(LIST_VISIBLE_TEXT_SCRIPT, { classId: ERROR_CLASS_ID_SOURCE });
      const visible = new Map<string, PageEntry>();
      for (const entry of errorEntries(entries)) visible.set(`${entry.path}|${key(entry.text)}`, entry);

      // A text that is no longer visible stops here. This Step still counts for it.
      for (const tracked of open.values()) {
        if (!visible.has(tracked.key)) {
          tracked.open = false;
          tracked.endStep = n;
        }
      }

      const next = new Map<string, Tracked>();
      for (const [entryKey, entry] of visible) {
        let tracked = open.get(entryKey);
        if (!tracked) {
          tracked = {
            key: entryKey,
            text: entry.text,
            match: key(entry.text),
            tag: entry.tag,
            className: entry.className,
            id: entry.id,
            firstStep: n,
            lastVisibleStep: n,
            endStep: n,
            visibleSteps: 0,
            countedStep: 0,
            open: true,
            described: false,
          };
          all.push(tracked);
        }
        if (tracked.countedStep !== n) {
          tracked.visibleSteps += 1;
          tracked.countedStep = n;
        }
        tracked.lastVisibleStep = n;
        tracked.endStep = n;
        next.set(entryKey, tracked);
      }
      open = next;

      // Is it in the description of the focused element? Read the tree only when a text is still unheard.
      const unheard = [...open.values()].filter((tracked) => !isHeard(tracked, ctx.steps));
      if (unheard.length > 0) {
        const descriptions = await focusedDescriptions(ctx);
        for (const tracked of unheard) {
          if (descriptions.some((description) => contains(description, tracked.match))) tracked.described = true;
        }
      }
      return [];
    },

    async finish(ctx: DetectorContext): Promise<DetectedProblem[]> {
      const problems: DetectedProblem[] = [];
      for (const tracked of all) {
        if (isHeard(tracked, ctx.steps)) continue;
        const span =
          tracked.lastVisibleStep === tracked.firstStep
            ? `Step ${tracked.firstStep}`
            : `Steps ${tracked.firstStep} to ${tracked.lastVisibleStep}`;
        const ending = tracked.open ? 'It was still on the screen when the Run ended.' : 'It then disappeared.';
        problems.push({
          key: tracked.key,
          stepN: tracked.firstStep,
          title: 'Error message is not announced',
          evidence:
            `The text "${tracked.text}" appeared in ${describeElement(tracked)} at Step ${tracked.firstStep} and was visible for ` +
            `${plural(tracked.visibleSteps, 'Step')} (${span}). ` +
            `No live region, role="alert" or aria-live announced it, and the accessible description of the focused field ` +
            `did not include it, so a screen reader user hears nothing. ${ending}`,
          screenshot: 'step',
        });
      }
      return problems;
    },
  };
}
