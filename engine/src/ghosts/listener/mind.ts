/*
 * The Listener's Mind (Requirement 9; design "The Listener (Phase 1)" > Mind).
 *
 * A scripted state machine over the Mission's Intentions. It looks for controls the way a screen reader
 * user does: it listens to where focus is, jumps by kind, and tabs round a dialog. It uses no AI.
 *
 * The Mind sees only a `Heard` (see `ax.ts`). It never sees a Probe, a StepTrace, a DetectorContext, a
 * Finding or a screenshot. It reads no clock and no random numbers, so the same sequence of Heard values
 * always gives the same decisions (Requirement 9.9).
 *
 * ## One decision, in order
 *
 *   1. Remember what was heard (for the thoughts).
 *   2. Move to the next Intention while the current one's `doneWhen` holds (9.1).
 *   3. When the page path is new (the Run's start, or a page change): jump to the next heading once (9.10).
 *   4. When the focused node matches the current Intention's target and has not been used: act on it (9.2, 9.5).
 *   5. Last-resort mode: try the buttons with no name that the pass reached, one at a time (9.6).
 *   6. Inside a dialog: Tab round, Shift+Tab round, Escape once (9.4).
 *      Elsewhere: jumps of the target's kind until a Full_Pass (9.3).
 *   7. Nothing found: last resort if the Intention allows it, else give up (9.7).
 *
 * ## Rounds and the Full_Pass
 *
 * A search keeps the controls it has reached in the current round. A press that lands on one of them has
 * come all the way round: that is a Full_Pass. The control where a round starts counts as reached. A field
 * or button jump that finds no control of its kind at all (focus stays on something of another kind) also
 * ends the pass, because there is nothing left to find.
 *
 * The search state is dropped whenever the Mind acts on a match, moves to another Intention, sees a new
 * page, or sees the dialog change (opens, closes, or is another dialog).
 *
 * ## Links
 *
 * The Body has no link jump. For a link target the page search presses Tab until it lands on a control it
 * has already reached.
 *
 * ## Thoughts
 *
 * Every decision has a thought in first person. The text builders are in `thoughts.ts`, together with the
 * types of the Mind's memory of what it heard (`ListenerMemory`, the `memory` field). `giveUpThought` is
 * built only from `memory`.
 */

import type { Decision, GiveUpReason, Mind, MindOptions } from '../../core/types.ts';
import type { Intention, Mission, PresentCondition, TargetKind } from '../../missions/loadMission.ts';
import { matchPatterns, type PatternLang } from '../../missions/patterns.ts';
import type { Heard, HeardNode } from './ax.ts';
import type { JumpTarget, ListenerAction } from './body.ts';
import { focusedNode } from './speech.ts';
import {
  JUMP_BUTTON_ROLES,
  TARGET_ROLES,
  dialogSearchThought,
  lastResortEnterThought,
  lastResortGoThought,
  matchActivateThought,
  matchTypeThought,
  noMatchThought,
  orientationThought,
  pageSearchThought,
  roundCompleteThought,
  stepLimitThought,
  trappedThought,
  type ListenerMemory,
  type RememberedControl,
  type SearchMode,
} from './thoughts.ts';

export type { ListenerMemory, RememberedControl } from './thoughts.ts';

// ---------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------

// The field roles that the Body's field jump stops on (see `body.ts`). The button roles are in
// `thoughts.ts`. The Mind uses them to tell whether a jump found anything of its kind.
const JUMP_FIELD_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'checkbox',
  'radio',
  'listbox',
  'slider',
  'switch',
]);

/** Roles of controls a person can reach with the keyboard, for the "heard but not reached" memory. */
const CONTROL_ROLES: ReadonlySet<string> = new Set([
  'button',
  'togglebutton',
  'menubutton',
  'link',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'menuitem',
]);

/** Does `role` fit what a `doneWhen.present` condition asks for? `any` fits every role. */
function presentRoleFits(kind: PresentCondition['kind'], role: string): boolean {
  return kind === 'any' || TARGET_ROLES[kind].has(role);
}

function searchModeOf(kind: TargetKind): SearchMode {
  switch (kind) {
    case 'button':
      return 'button';
    case 'field':
    case 'checkbox':
      return 'field';
    case 'link':
      return 'tab';
  }
}

function jumpTargetOf(mode: 'button' | 'field'): JumpTarget {
  return mode;
}

/** Stands for "focus is on the page itself" in the set of reached controls. */
const DOCUMENT = '(document)';

// ---------------------------------------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------------------------------------

// The types `ListenerMemory` and `RememberedControl` are in `thoughts.ts`.

function newMemory(goal: string): ListenerMemory {
  return {
    actions: 0,
    seeking: null,
    goal,
    focusedRefs: new Set(),
    reached: [],
    scope: 'page',
    dialogName: null,
    tabReached: [],
    shiftReached: [],
    escapePressed: false,
    dialogUnreached: [],
    pageUnreached: [],
  };
}

function remember(node: HeardNode): RememberedControl {
  return { ref: node.ref, role: node.role, name: node.name };
}

// ---------------------------------------------------------------------------------------------------------
// Search state
// ---------------------------------------------------------------------------------------------------------

type Phase = 'jump' | 'tab' | 'shift' | 'escaped' | 'lastResort';

interface Search {
  context: 'page' | 'dialog';
  dialogRef: string | null;
  phase: Phase;
  /** Keys of the controls reached in the current round (a ref, or `DOCUMENT`). */
  reached: Set<string>;
  /** Every control reached in this search, in order, without repeats. */
  all: RememberedControl[];
  /** Presses made in the current round. */
  presses: number;
  /** Unnamed buttons to try in last-resort mode, in the order they were reached. */
  candidates: RememberedControl[];
  /** Candidates that could not be reached by jumping. */
  skipped: Set<string>;
  /** Jumps made since the last candidate was tried. */
  jumpsToCandidate: number;
  /** How many candidates have been tried. */
  tried: number;
}

function newSearch(context: 'page' | 'dialog', dialogRef: string | null): Search {
  return {
    context,
    dialogRef,
    phase: context === 'dialog' ? 'tab' : 'jump',
    reached: new Set(),
    all: [],
    presses: 0,
    candidates: [],
    skipped: new Set(),
    jumpsToCandidate: 0,
    tried: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------
// The Mind
// ---------------------------------------------------------------------------------------------------------

export class ListenerMind implements Mind<Heard, ListenerAction> {
  /** What the Mind remembers of what it heard. Read by `giveUpThought`. */
  readonly memory: ListenerMemory;

  private readonly intentions: readonly Intention[];
  private readonly langs: readonly PatternLang[];
  private index = 0;
  private lastPath: string | null = null;
  /** Refs of controls acted on, for this and earlier Intentions. */
  private readonly used = new Set<string>();
  /** The field the Mind last typed into, for `doneWhen: { fieldValue: true }`. */
  private actedRef: string | null = null;
  /** Intentions whose own thought has already been said. */
  private readonly announced = new Set<string>();
  private search: Search | null = null;

  constructor(mission: Mission, opts: MindOptions) {
    this.intentions = mission.intentions;
    this.langs = opts.languages ?? ['en'];
    this.memory = newMemory(mission.goal);
  }

  decide(heard: Heard): Decision<ListenerAction> {
    const focus = focusedNode(heard);
    this.observe(heard, focus);
    this.advance(heard);

    // 9.10: hear where we are before searching.
    if (this.lastPath !== heard.path) {
      const first = this.lastPath === null;
      this.lastPath = heard.path;
      this.search = null;
      return this.act(
        this.current()?.id ?? 'orientation',
        { type: 'jump', to: 'heading', dir: 'next' },
        orientationThought(heard, first),
      );
    }

    const intention = this.current();
    if (intention === undefined) return this.giveUp();
    this.memory.seeking = intention;

    // 9.2, 9.5: the focused node is what we want.
    if (focus !== undefined && this.matches(intention, focus)) return this.actOnMatch(intention, focus);

    const search = this.searchFor(heard);
    if (search.phase === 'lastResort') return this.lastResortStep(intention, focus, search);
    return search.context === 'dialog'
      ? this.dialogStep(intention, heard, focus, search)
      : this.pageStep(intention, focus, search);
  }

  giveUpThought(reason: GiveUpReason): string {
    switch (reason) {
      case 'trapped':
        return trappedThought(this.memory);
      case 'no_match':
        return noMatchThought(this.memory);
      case 'step_limit':
        return stepLimitThought(this.memory);
      default:
        return "I can't carry on, so I'm giving up.";
    }
  }

  // -- Intentions ---------------------------------------------------------------------------------------

  private current(): Intention | undefined {
    return this.intentions[this.index];
  }

  /** 9.1: move on only when the current Intention's `doneWhen` holds. */
  private advance(heard: Heard): void {
    for (let i = this.current(); i !== undefined && this.isDone(i, heard); i = this.current()) {
      this.index++;
      this.search = null;
      this.actedRef = null;
    }
  }

  private isDone(intention: Intention, heard: Heard): boolean {
    const done = intention.doneWhen;
    if (done === 'success') return false;
    if ('fieldValue' in done) {
      const ref = this.actedRef;
      const field = ref === null ? undefined : heard.nodes.find((node) => node.ref === ref);
      return field !== undefined && field.value.trim() !== '';
    }
    return heard.nodes.some(
      (node) =>
        presentRoleFits(done.present.kind, node.role) && matchPatterns(node.name, done.present, this.langs) !== null,
    );
  }

  /** The Intention's own thought, the first time it is used in a decision. */
  private lead(intention: Intention): string {
    if (this.announced.has(intention.id)) return '';
    this.announced.add(intention.id);
    return `${intention.thought} `;
  }

  // -- Matching and acting ------------------------------------------------------------------------------

  /** 9.5: the role fits the kind, the name matches an `en` (or other language) pattern, and the control is unused. */
  private matches(intention: Intention, node: HeardNode): boolean {
    return (
      !this.used.has(node.ref) &&
      TARGET_ROLES[intention.target.kind].has(node.role) &&
      matchPatterns(node.name, intention.target, this.langs) !== null
    );
  }

  private actOnMatch(intention: Intention, node: HeardNode): Decision<ListenerAction> {
    this.used.add(node.ref);
    this.actedRef = node.ref;
    this.search = null;
    const lead = this.lead(intention);
    if (intention.do === 'type') {
      return this.act(intention.id, { type: 'type', text: intention.value }, matchTypeThought(lead, node, intention.value));
    }
    const key = intention.target.kind === 'checkbox' ? 'Space' : 'Enter';
    return this.act(intention.id, { type: 'key', key }, matchActivateThought(lead, node, key));
  }

  private act(intentionId: string, action: ListenerAction, thought: string): Decision<ListenerAction> {
    this.memory.actions++;
    return { kind: 'act', action, thought, intentionId };
  }

  private giveUp(): Decision<ListenerAction> {
    return { kind: 'give_up', reason: 'no_match', thought: this.giveUpThought('no_match') };
  }

  // -- Search -------------------------------------------------------------------------------------------

  private searchFor(heard: Heard): Search {
    const context = heard.dialog !== null ? 'dialog' : 'page';
    const dialogRef = heard.dialog?.ref ?? null;
    let search = this.search;
    if (search === null || search.context !== context || search.dialogRef !== dialogRef) {
      search = newSearch(context, dialogRef);
      this.search = search;
      this.memory.reached = [];
      if (heard.dialog !== null) {
        this.memory.dialogName = heard.dialog.name;
        this.memory.tabReached = [];
        this.memory.shiftReached = [];
        this.memory.escapePressed = false;
      }
    }
    this.memory.scope = context;
    return search;
  }

  /** Records a control as reached in this round. */
  private reach(search: Search, node: HeardNode | undefined): void {
    search.reached.add(node?.ref ?? DOCUMENT);
    if (node === undefined) return;
    const control = remember(node);
    if (!search.all.some((c) => c.ref === node.ref)) search.all.push(control);
    this.memory.reached = [...search.all];
    if (search.context === 'dialog') {
      const list = search.phase === 'shift' ? this.memory.shiftReached : this.memory.tabReached;
      if (!list.some((c) => c.ref === node.ref)) list.push(control);
    }
  }

  /** 9.3: jumps of the target's kind until a Full_Pass. */
  private pageStep(intention: Intention, focus: HeardNode | undefined, search: Search): Decision<ListenerAction> {
    const mode = searchModeOf(intention.target.kind);
    const landed = search.presses > 0;
    const lead = this.lead(intention);
    let complete = false;

    if (mode === 'tab') {
      if (landed && search.reached.has(focus?.ref ?? DOCUMENT)) complete = true;
      else this.reach(search, focus);
    } else {
      const roles = mode === 'button' ? JUMP_BUTTON_ROLES : JUMP_FIELD_ROLES;
      const fits = focus !== undefined && roles.has(focus.role);
      if (landed && (!fits || search.reached.has(focus.ref))) complete = true;
      else if (fits) this.reach(search, focus);
    }

    if (!complete) {
      search.presses++;
      const action: ListenerAction =
        mode === 'tab' ? { type: 'key', key: 'Tab' } : { type: 'jump', to: jumpTargetOf(mode), dir: 'next' };
      const used = focus !== undefined && this.used.has(focus.ref);
      return this.act(intention.id, action, pageSearchThought({ lead, mode, node: focus, landed, used }));
    }

    // A Full_Pass without a match (9.6, 9.7).
    if (intention.lastResort === 'unnamedButton') {
      search.candidates = this.unnamedButtons(search);
      if (search.candidates.length > 0) {
        search.phase = 'lastResort';
        search.jumpsToCandidate = 0;
        return this.lastResortStep(intention, focus, search);
      }
    }
    return this.giveUp();
  }

  /** 9.4: Tab until a Full_Pass, Shift+Tab until a Full_Pass, then Escape once. */
  private dialogStep(
    intention: Intention,
    heard: Heard,
    focus: HeardNode | undefined,
    search: Search,
  ): Decision<ListenerAction> {
    const lead = this.lead(intention);
    const dialogName = heard.dialog?.name ?? '';
    const key = focus?.ref ?? DOCUMENT;

    if (search.phase === 'tab' || search.phase === 'shift') {
      let roundDone = false;
      if (search.presses === 0) this.reach(search, focus);
      else if (search.reached.has(key)) roundDone = true;
      else this.reach(search, focus);

      if (roundDone && search.phase === 'tab') {
        // The Tab round has come back to a control it already reached. Start the Shift+Tab round here.
        search.phase = 'shift';
        search.reached = new Set();
        search.presses = 0;
        this.reach(search, focus);
        search.presses++;
        return this.act(
          intention.id,
          { type: 'key', key: 'Shift+Tab' },
          roundCompleteThought({ lead, dialogName, node: focus, key: 'Tab', next: 'Shift+Tab' }),
        );
      }
      if (roundDone) {
        search.phase = 'escaped';
        this.memory.escapePressed = true;
        return this.act(
          intention.id,
          { type: 'key', key: 'Escape' },
          roundCompleteThought({
            lead,
            dialogName,
            node: focus,
            key: 'Shift+Tab',
            next: 'Escape',
            unreached: this.memory.dialogUnreached,
          }),
        );
      }

      const first = search.presses === 0;
      search.presses++;
      const keyName = search.phase === 'tab' ? 'Tab' : 'Shift+Tab';
      return this.act(
        intention.id,
        { type: 'key', key: keyName },
        dialogSearchThought({ lead, dialogName, node: focus, key: keyName, first, used: focus !== undefined && this.used.has(focus.ref) }),
      );
    }

    // Escape was pressed once and the dialog is still here.
    if (intention.lastResort === 'unnamedButton') {
      search.candidates = this.unnamedButtons(search);
      if (search.candidates.length > 0) {
        search.phase = 'lastResort';
        search.jumpsToCandidate = 0;
        return this.lastResortStep(intention, focus, search);
      }
    }
    return this.giveUp();
  }

  /** 9.6: the buttons with no name that the pass reached, one at a time, in the order reached. */
  private lastResortStep(intention: Intention, focus: HeardNode | undefined, search: Search): Decision<ListenerAction> {
    const lead = this.lead(intention);
    const candidate = search.candidates.find((c) => !this.used.has(c.ref) && !search.skipped.has(c.ref));
    if (candidate === undefined) return this.giveUp();

    if (focus !== undefined && focus.ref === candidate.ref) {
      this.used.add(candidate.ref);
      search.jumpsToCandidate = 0;
      const first = search.tried === 0;
      search.tried++;
      return this.act(intention.id, { type: 'key', key: 'Enter' }, lastResortEnterThought({ lead, node: focus, first }));
    }

    // Jumping next button visits the buttons in document order and wraps round, so a candidate that has not
    // come up after more jumps than there are controls cannot be reached this way.
    if (search.jumpsToCandidate > search.all.length + 1) {
      search.skipped.add(candidate.ref);
      return this.lastResortStep(intention, focus, search);
    }
    search.jumpsToCandidate++;
    const remaining = search.candidates.filter((c) => !this.used.has(c.ref) && !search.skipped.has(c.ref)).length;
    return this.act(
      intention.id,
      { type: 'jump', to: 'button', dir: 'next' },
      lastResortGoThought({ lead, remaining, tried: search.tried }),
    );
  }

  /** The buttons with an empty name reached in this search that have not been tried, in the order reached. */
  private unnamedButtons(search: Search): RememberedControl[] {
    return search.all.filter(
      (control) => JUMP_BUTTON_ROLES.has(control.role) && control.name.trim() === '' && !this.used.has(control.ref),
    );
  }

  // -- Memory -------------------------------------------------------------------------------------------

  /** Remembers who has had focus and which controls are heard but never reached. */
  private observe(heard: Heard, focus: HeardNode | undefined): void {
    const memory = this.memory;
    if (focus !== undefined) memory.focusedRefs.add(focus.ref);
    const scope = heard.dialog !== null ? nodesInDialog(heard, heard.dialog.ref) : heard.nodes;
    const unreached = scope
      .filter((node) => CONTROL_ROLES.has(node.role) && node.name.trim() !== '' && !memory.focusedRefs.has(node.ref))
      .map(remember);
    if (heard.dialog !== null) memory.dialogUnreached = unreached;
    else memory.pageUnreached = unreached;
  }
}

/** The nodes below the dialog node, in document order. */
function nodesInDialog(heard: Heard, dialogRef: string): HeardNode[] {
  const start = heard.nodes.findIndex((node) => node.ref === dialogRef);
  const dialog = heard.nodes[start];
  if (start < 0 || dialog === undefined) return [];
  const inside: HeardNode[] = [];
  for (const node of heard.nodes.slice(start + 1)) {
    if (node.depth <= dialog.depth) break;
    inside.push(node);
  }
  return inside;
}

/** Creates The Listener's Mind. `opts.languages` defaults to English; `opts.rng` is not used. */
export function createListenerMind(mission: Mission, opts: MindOptions): Mind<Heard, ListenerAction> {
  return new ListenerMind(mission, opts);
}

