/*
 * The visual ghosts' Mind (Requirements 14, 18 and 16.4; design "Shared visual body (Phase 2a)" >
 * Visual mind). One class shared by The Phantom (languages `en`) and Bebe (`pa`, `hi`, `en`).
 *
 * A scripted state machine over the Mission's Intentions. It looks for controls the way a sighted
 * person does: by how they look and by the text on the screen. It uses no AI.
 *
 * The Mind sees only a `Sight` (see `page/sight.ts`): the path, the viewport, the screenshot hash and
 * the Seen_Items. It never sees a Probe, a StepTrace, a DetectorContext, a Finding or the DOM. It
 * reads no clock and no random numbers, so the same sequence of Sights gives the same decisions.
 *
 * ## One decision, in order
 *
 *   1. Move to the next Intention while the current one's `doneWhen` holds.
 *   2. Type Intentions take two Steps: after clicking the field, type the value.
 *   3. A visible target that matches: click it (14.1, 18.1).
 *   4. Last resort, when the Intention allows it: buttons that show no text, in reading order (14.2, 18.2).
 *   5. A Sight with no items (blank or still loading): wait (14.4).
 *   6. After a click for this Intention changed the path to a page with no target of this or any later
 *      Intention: go back, by a visible "back" link or the browser's Back, marked `recovery: true` (14.5).
 *   7. Otherwise scroll down until a scroll leaves the screenshot unchanged (the bottom), then up until
 *      the same happens (the top), then give up with `no_match` (14.3, 18.5).
 *
 * A blank Sight right after a page change is treated as a page still loading, so step 5 comes before
 * step 6: the Mind waits until it can see the new page before it decides that it is unexpected.
 *
 * ## Matching
 *
 * Patterns are tried language by language in the ghost's order, then `en` (see `languageOrder`): every
 * visible item is tried against the first language's patterns before any item is tried against the
 * next language. Buttons and links match on their own visible text. A tick box matches on the nearest
 * text to its right on the same line. A field matches on its label: the nearest `text` item whose box
 * ends above the field's top (at most 48 px above, overlapping it horizontally) or that lies to its left
 * on the same line. Items are tried in reading order: top to bottom, then left to right.
 *
 * An item with the same look and text (a field: the same label) as one used for an earlier Intention
 * does not match a later Intention. The same item may be clicked again for the same Intention, which
 * is how The Phantom retries "Pay this bill" after going back.
 *
 * ## Thoughts
 *
 * Every decision has a thought in English that quotes the text that was seen (18.4). The text builders
 * and the type of the Mind's memory (`VisualMemory`) are in `thoughts.ts`. `giveUpThought` is built
 * only from `memory`.
 */

import type { Decision, GiveUpReason, Mind, MindOptions } from '../../core/types.ts';
import type { Intention, Mission, NamePatterns, TargetKind } from '../../missions/loadMission.ts';
import {
  compilePattern,
  languageOrder,
  matchPatterns,
  normaliseText,
  type PatternLang,
} from '../../missions/patterns.ts';
import type { SeenItem, Sight } from '../../page/sight.ts';
import type { VisualAction } from './types.ts';
import {
  fieldClickThought,
  lastResortThought,
  matchClickThought,
  misclicksThought,
  noMatchThought,
  recoveryBackThought,
  recoveryLinkThought,
  scrollThought,
  slowWaitThought,
  stepLimitThought,
  typeThought,
  waitThought,
  type Pointer,
  type VisualMemory,
} from './thoughts.ts';

export type { Pointer, VisualMemory } from './thoughts.ts';

/** How the visual Mind is set up for one ghost. */
export interface VisualMindParams {
  /** Languages whose patterns are tried, in order. `en` is always tried last when it is not listed. */
  languages: readonly PatternLang[];
  /** Only changes the wording of thoughts: "tap" (The Phantom) or "click"/"press" (Bebe). Default `click`. */
  pointer?: Pointer;
}

// ---------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------

/** How far above a field its label may end, in CSS px. */
export const LABEL_ABOVE_MAX_PX = 48;

/** Boxes may touch or overlap by this much and still count as above or to the left. */
const EDGE_TOLERANCE_PX = 2;

/** Patterns for a link that goes back, per language. */
export const BACK_PATTERNS: NamePatterns = { en: ['\\bback\\b'], pa: ['ਵਾਪਸ'], hi: ['वापस'] };

/** The most recovery decisions in a row on the same unexpected page. */
const MAX_RECOVERIES = 3;

/** Text longer than this is not used to describe a page. */
const PAGE_TITLE_MAX = 60;

// ---------------------------------------------------------------------------------------------------------
// Seeing
// ---------------------------------------------------------------------------------------------------------

/** Items in reading order: top to bottom, then left to right. */
export function readingOrder(items: readonly SeenItem[]): SeenItem[] {
  return [...items].sort(
    (a, b) => Math.round(a.box.y) - Math.round(b.box.y) || Math.round(a.box.x) - Math.round(b.box.x),
  );
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * The label of a field: the nearest text item that ends above the field's top (within 48 px and
 * overlapping it horizontally) or lies to its left on the same line. `null` when there is none.
 */
export function fieldLabel(field: SeenItem, items: readonly SeenItem[]): string | null {
  const f = field.box;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const item of readingOrder(items)) {
    if (item.look !== 'text') continue;
    const text = normaliseText(item.text);
    if (text === '') continue;
    const t = item.box;
    const bottom = t.y + t.h;
    let distance: number;
    if (
      bottom <= f.y + EDGE_TOLERANCE_PX &&
      f.y - bottom <= LABEL_ABOVE_MAX_PX &&
      overlap(t.x, t.x + t.w, f.x, f.x + f.w) > 0
    ) {
      distance = Math.max(0, f.y - bottom);
    } else if (t.x + t.w <= f.x + EDGE_TOLERANCE_PX && sameLine(t, f)) {
      distance = Math.max(0, f.x - (t.x + t.w));
    } else {
      continue;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = text;
    }
  }
  return best;
}

/** True when the vertical centre of `a` lies within the height of `b`. */
function sameLine(a: SeenItem['box'], b: SeenItem['box']): boolean {
  const centre = a.y + a.h / 2;
  return centre >= b.y && centre <= b.y + b.h;
}

/** The text a tick box is known by: the nearest text to its right on the same line. */
function checkboxText(box: SeenItem, items: readonly SeenItem[]): string {
  const own = normaliseText(box.text);
  if (own !== '') return own;
  let best = '';
  let bestDistance = Infinity;
  for (const item of readingOrder(items)) {
    if (item.look !== 'text') continue;
    const text = normaliseText(item.text);
    if (text === '' || item.box.x < box.box.x + box.box.w - EDGE_TOLERANCE_PX) continue;
    if (!sameLine(item.box, box.box) && !sameLine(box.box, item.box)) continue;
    const distance = item.box.x - (box.box.x + box.box.w);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = text;
    }
  }
  return best;
}

/** The text an item is matched on: a field's label, a tick box's text, or the item's own text. */
function matchText(item: SeenItem, items: readonly SeenItem[]): string {
  if (item.look === 'field') return fieldLabel(item, items) ?? '';
  if (item.look === 'checkbox') return checkboxText(item, items);
  return normaliseText(item.text);
}

/** Identifies "the same look and text" across Sights. */
function signature(item: SeenItem, text: string): string {
  return `${item.look}|${text.toLocaleLowerCase()}`;
}

/** Whitespace-free text, so that "4111 1111 1111 1111" shows "4111111111111111". */
function compact(text: string): string {
  return normaliseText(text).replace(/\s+/gu, '');
}

interface Match {
  item: SeenItem;
  /** The text that matched (a field's label). */
  text: string;
  lang: PatternLang;
}

// ---------------------------------------------------------------------------------------------------------
// The Mind
// ---------------------------------------------------------------------------------------------------------

type LastAction =
  | { kind: 'intention-click'; index: number; path: string; texts: ReadonlySet<string> }
  | { kind: 'type' }
  | { kind: 'recovery'; path: string; count: number }
  | { kind: 'scroll'; hash: string }
  | { kind: 'wait' };

interface ScrollSearch {
  dir: 'down' | 'up';
}

export class VisualMind implements Mind<Sight, VisualAction> {
  /** What the Mind remembers of what it saw. Read by `giveUpThought`. */
  readonly memory: VisualMemory;

  private readonly intentions: readonly Intention[];
  private readonly langs: readonly PatternLang[];
  private readonly pointer: Pointer;
  private index = 0;
  /** Signature of an item acted on → the index of the Intention it was used for (the first one). */
  private readonly usedBy = new Map<string, number>();
  /** Intentions whose own thought has already been said. */
  private readonly announced = new Set<string>();
  /** For type Intentions: `type` right after the field was clicked. */
  private typeStage: 'click' | 'type' = 'click';
  /** True once the current type Intention has typed at least once. */
  private typed = false;
  /** Last-resort buttons tried for the current Intention. */
  private lastResortTried = 0;
  private search: ScrollSearch | null = null;
  private last: LastAction | null = null;
  private lastPath: string | null = null;

  constructor(mission: Mission, params: VisualMindParams) {
    this.intentions = mission.intentions;
    this.langs = languageOrder(params.languages);
    this.pointer = params.pointer ?? 'click';
    this.memory = {
      actions: 0,
      goal: mission.goal,
      seeking: null,
      preferred: this.langs[0] ?? 'en',
      pointer: this.pointer,
      targetClicks: 0,
      targetText: null,
      wrongPages: [],
      seenOfKind: [],
      searchedWholePage: false,
      lastScreen: '',
    };
  }

  decide(sight: Sight): Decision<VisualAction> {
    const items = readingOrder(sight.items);
    this.memory.lastScreen = items
      .map((item) => normaliseText(item.text))
      .filter((text) => text !== '')
      .join(' ')
      .slice(0, 80);
    if (this.lastPath !== null && this.lastPath !== sight.path) this.search = null;
    this.lastPath = sight.path;

    this.advance(items);
    const intention = this.intentions[this.index];
    if (intention === undefined) return this.giveUp();
    this.memory.seeking = intention;
    const last = this.last;

    // Type Intentions, second Step: the field was clicked just before and the page stayed put.
    if (
      intention.do === 'type' &&
      this.typeStage === 'type' &&
      last?.kind === 'intention-click' &&
      last.index === this.index &&
      last.path === sight.path
    ) {
      this.typeStage = 'click';
      this.typed = true;
      const field = this.findTarget(intention, this.index, items);
      const label = field?.text ?? this.memory.targetText ?? '';
      return this.act(
        intention,
        { type: 'type', text: intention.value },
        typeThought({ lead: this.lead(intention), label, value: intention.value }),
        { kind: 'type' },
      );
    }
    this.typeStage = 'click';

    // A visible target.
    const match = this.findTarget(intention, this.index, items);
    if (match !== null) return this.clickTarget(intention, match, sight, items);

    // Last resort: buttons that show no text.
    if (intention.lastResort === 'unnamedButton') {
      const candidates = items.filter(
        (item) => item.look === 'button' && normaliseText(item.text) === '' && !this.skipped(signature(item, '')),
      );
      const candidate = candidates[this.lastResortTried];
      if (candidate !== undefined) {
        const first = this.lastResortTried === 0;
        this.lastResortTried++;
        this.markUsed(signature(candidate, ''));
        return this.act(
          intention,
          { type: 'click', itemId: candidate.id },
          lastResortThought({ lead: this.lead(intention), first, pointer: this.pointer }),
          this.intentionClick(sight, items),
        );
      }
    }

    // Nothing to act on yet.
    if (items.length === 0) return this.act(intention, { type: 'wait' }, waitThought(this.lead(intention)), { kind: 'wait' });

    // An unexpected page.
    const recovery = this.recovery(intention, sight, items);
    if (recovery !== null) return recovery;

    return this.scrollSearch(intention, sight, items);
  }

  giveUpThought(reason: GiveUpReason): string {
    switch (reason) {
      case 'no_match':
        return noMatchThought(this.memory);
      case 'misclicks':
        return misclicksThought(this.memory);
      case 'slow_wait':
        return slowWaitThought(this.memory);
      case 'step_limit':
        return stepLimitThought(this.memory);
      default:
        return "I can't carry on, so I'm giving up.";
    }
  }

  // -- Intentions ---------------------------------------------------------------------------------------

  private advance(items: readonly SeenItem[]): void {
    for (let i = this.intentions[this.index]; i !== undefined && this.isDone(i, items); i = this.intentions[this.index]) {
      this.index++;
      this.typeStage = 'click';
      this.typed = false;
      this.lastResortTried = 0;
      this.search = null;
      this.memory.targetClicks = 0;
      this.memory.targetText = null;
      this.memory.wrongPages = [];
      this.memory.seenOfKind = [];
      this.memory.searchedWholePage = false;
    }
  }

  private isDone(intention: Intention, items: readonly SeenItem[]): boolean {
    const done = intention.doneWhen;
    if (done === 'success') return false;
    if ('fieldValue' in done) {
      const field = this.findTarget(intention, this.index, items);
      return (
        field !== null &&
        field.item.placeholder !== true &&
        compact(field.item.text) !== '' &&
        compact(field.item.text) === compact(intention.value ?? '')
      );
    }
    const kind = done.present.kind;
    return items.some((item) => {
      if (kind !== 'any' && item.look !== kind) return false;
      const text = kind === 'any' ? normaliseText(item.text) : matchText(item, items);
      return text !== '' && matchPatterns(text, done.present, this.langs) !== null;
    });
  }

  private lead(intention: Intention): string {
    if (this.announced.has(intention.id)) return '';
    this.announced.add(intention.id);
    return `${intention.thought} `;
  }

  // -- Matching -----------------------------------------------------------------------------------------

  /** True when an item with this signature was used for an Intention before the current one. */
  private skipped(sig: string, index = this.index): boolean {
    const usedAt = this.usedBy.get(sig);
    return usedAt !== undefined && usedAt < index;
  }

  private markUsed(sig: string): void {
    if (!this.usedBy.has(sig)) this.usedBy.set(sig, this.index);
  }

  /** The first item that matches the Intention's target, language by language, in reading order. */
  private findTarget(intention: Intention, index: number, items: readonly SeenItem[]): Match | null {
    const kind: TargetKind = intention.target.kind;
    const candidates: { item: SeenItem; text: string }[] = [];
    for (const item of items) {
      if (item.look !== kind) continue;
      const text = matchText(item, items);
      if (text === '' || this.skipped(signature(item, text), index)) continue;
      candidates.push({ item, text });
    }
    for (const lang of this.langs) {
      const sources = intention.target[lang];
      if (sources === undefined || sources.length === 0) continue;
      const patterns = sources.map(compilePattern);
      for (const { item, text } of candidates) {
        if (patterns.some((re) => re.test(text))) return { item, text, lang };
      }
    }
    return null;
  }

  private clickTarget(intention: Intention, match: Match, sight: Sight, items: readonly SeenItem[]): Decision<VisualAction> {
    const lead = this.lead(intention);
    this.markUsed(signature(match.item, match.text));
    const action: VisualAction = { type: 'click', itemId: match.item.id };
    const after = this.intentionClick(sight, items);
    if (intention.do === 'type') {
      this.typeStage = 'type';
      this.memory.targetText = match.text;
      return this.act(
        intention,
        action,
        fieldClickThought({
          lead,
          label: match.text,
          lang: match.lang,
          preferred: this.memory.preferred,
          pointer: this.pointer,
          retry: this.typed,
        }),
        after,
      );
    }
    this.memory.targetClicks++;
    this.memory.targetText = match.text;
    return this.act(
      intention,
      action,
      matchClickThought({
        lead,
        look: intention.target.kind,
        text: match.text,
        lang: match.lang,
        preferred: this.memory.preferred,
        pointer: this.pointer,
        again: this.memory.targetClicks > 1,
      }),
      after,
    );
  }

  private intentionClick(sight: Sight, items: readonly SeenItem[]): LastAction {
    const texts = new Set(items.map((item) => normaliseText(item.text)).filter((text) => text !== ''));
    return { kind: 'intention-click', index: this.index, path: sight.path, texts };
  }

  // -- Unexpected pages ---------------------------------------------------------------------------------

  /** Some item matches the target of this or a later Intention. */
  private anyTargetFrom(items: readonly SeenItem[]): boolean {
    for (let i = this.index; i < this.intentions.length; i++) {
      const intention = this.intentions[i];
      if (intention !== undefined && this.findTarget(intention, i, items) !== null) return true;
    }
    return false;
  }

  private recovery(intention: Intention, sight: Sight, items: readonly SeenItem[]): Decision<VisualAction> | null {
    const last = this.last;
    let count: number;
    if (last?.kind === 'intention-click' && last.index === this.index && last.path !== sight.path) {
      count = 0;
    } else if (last?.kind === 'recovery' && last.path === sight.path && last.count < MAX_RECOVERIES) {
      count = last.count;
    } else {
      return null;
    }
    if (this.anyTargetFrom(items)) return null;
    if (last.kind === 'intention-click') this.memory.wrongPages.push(describePage(items, last.texts));

    const lead = this.lead(intention);
    const page = this.memory.wrongPages[this.memory.wrongPages.length - 1] ?? '';
    const next: LastAction = { kind: 'recovery', path: sight.path, count: count + 1 };
    // The first try uses a visible way back; when that did not work, the browser's Back.
    const link =
      count === 0
        ? items.find(
            (item) => item.look === 'link' && matchPatterns(normaliseText(item.text), BACK_PATTERNS, this.langs) !== null,
          )
        : undefined;
    if (link !== undefined) {
      return this.act(
        intention,
        { type: 'click', itemId: link.id },
        recoveryLinkThought({ lead, page, link: normaliseText(link.text), pointer: this.pointer }),
        next,
        true,
      );
    }
    return this.act(intention, { type: 'back' }, recoveryBackThought({ lead, page }), next, true);
  }

  // -- Scroll search ------------------------------------------------------------------------------------

  private scrollSearch(intention: Intention, sight: Sight, items: readonly SeenItem[]): Decision<VisualAction> {
    const last = this.last;
    let stage: 'start' | 'more' | 'turn';
    if (this.search === null) {
      this.search = { dir: 'down' };
      this.memory.seenOfKind = [];
      this.memory.searchedWholePage = false;
      stage = 'start';
    } else if (last?.kind === 'scroll' && last.hash === sight.screenshotHash) {
      if (this.search.dir === 'down') {
        this.search.dir = 'up';
        stage = 'turn';
      } else {
        this.rememberSeen(intention, items);
        this.memory.searchedWholePage = true;
        return this.giveUp();
      }
    } else {
      stage = 'more';
    }
    this.rememberSeen(intention, items);
    const dir = this.search.dir;
    return this.act(
      intention,
      { type: 'scroll', dir },
      scrollThought({ lead: this.lead(intention), dir, stage }),
      { kind: 'scroll', hash: sight.screenshotHash },
    );
  }

  /** Remembers the texts of the items of the target's look, for the `no_match` Give_Up_Thought. */
  private rememberSeen(intention: Intention, items: readonly SeenItem[]): void {
    for (const item of items) {
      if (item.look !== intention.target.kind) continue;
      const text = matchText(item, items);
      if (text !== '' && !this.memory.seenOfKind.includes(text)) this.memory.seenOfKind.push(text);
    }
  }

  // -- Deciding -----------------------------------------------------------------------------------------

  private act(
    intention: Intention,
    action: VisualAction,
    thought: string,
    last: LastAction,
    recovery = false,
  ): Decision<VisualAction> {
    this.memory.actions++;
    this.last = last;
    // Any action other than a scroll ends the scroll search.
    if (action.type !== 'scroll') this.search = null;
    return recovery
      ? { kind: 'act', action, thought, intentionId: intention.id, recovery: true }
      : { kind: 'act', action, thought, intentionId: intention.id };
  }

  private giveUp(): Decision<VisualAction> {
    return { kind: 'give_up', reason: 'no_match', thought: this.giveUpThought('no_match') };
  }
}

/**
 * Describes an unexpected page by what is on it: the tallest short text that was not on the page
 * before the click (headings are short and large), or '' when there is none.
 */
function describePage(items: readonly SeenItem[], before: ReadonlySet<string>): string {
  let best = '';
  let bestHeight = 0;
  for (const item of items) {
    if (item.look !== 'text') continue;
    const text = normaliseText(item.text);
    if (text === '' || text.length > PAGE_TITLE_MAX || before.has(text)) continue;
    if (item.box.h > bestHeight) {
      bestHeight = item.box.h;
      best = text;
    }
  }
  return best;
}

/** Creates the visual Mind with the ghost's languages (default `en`). `opts.rng` is not used. */
export function createVisualMind(
  mission: Mission,
  opts: MindOptions & { pointer?: Pointer },
): Mind<Sight, VisualAction> {
  const params: VisualMindParams = { languages: opts.languages ?? ['en'] };
  if (opts.pointer !== undefined) params.pointer = opts.pointer;
  return new VisualMind(mission, params);
}
