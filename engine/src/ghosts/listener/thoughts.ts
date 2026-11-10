/*
 * The Listener's thoughts (Requirements 6.8, 9.8 and 11.4; design "The Listener (Phase 1)" > Mind).
 *
 * Small pure functions that turn what the Mind heard into short first-person sentences in plain words.
 * Each Step shows its thought on the dashboard, so the sentences are short and say two things: what the
 * Mind heard, and why it does what it does next (9.8).
 *
 * ## Decision thoughts
 *
 * They are built from the node the Mind is on (a `HeardNode`, which the Mind has just heard) and from
 * the Mission's own words. They name controls the way a screen reader says them: `'Pay this bill, button'`.
 * Long names are shortened at a word boundary and end with "…". A round of Tab presses that has come back
 * to the start may also say which controls the Mind can hear in the tree but has never landed on.
 *
 * ## Give_Up_Thoughts
 *
 * `trappedThought`, `noMatchThought` and `stepLimitThought` take only a `ListenerMemory`: names, roles and
 * counts of what the Mind heard and did (11.4). They never see a Probe, a Finding, a box or a screenshot,
 * and the memory holds no coordinates. The `ref` in a remembered control is used to tell controls apart and
 * is never written into a sentence.
 *
 * ## Lists
 *
 * A list of control names shows at most `MAX_LISTED` names and then says "and N more", so that a page with
 * a hundred buttons still gives a sentence a person can read.
 *
 * This file does not import `mind.ts`: the memory types live here and `mind.ts` imports them.
 */

import type { Intention, TargetKind } from '../../missions/loadMission.ts';
import type { Heard, HeardNode } from './ax.ts';
import { describeNode } from './speech.ts';

// ---------------------------------------------------------------------------------------------------------
// Roles (shared with the Mind)
// ---------------------------------------------------------------------------------------------------------

/** The roles that the Body's button jump stops on (see `body.ts`). */
export const JUMP_BUTTON_ROLES: ReadonlySet<string> = new Set(['button', 'togglebutton', 'menubutton']);

/** The roles that fit each kind of target. */
export const TARGET_ROLES: Readonly<Record<TargetKind, ReadonlySet<string>>> = {
  button: JUMP_BUTTON_ROLES,
  link: new Set(['link']),
  field: new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']),
  checkbox: new Set(['checkbox']),
};

/** How the Mind looks for a target: by button jump, by field jump, or by pressing Tab. */
export type SearchMode = 'button' | 'field' | 'tab';

// ---------------------------------------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------------------------------------

/** A control the Mind has heard or reached. Only what a screen reader would say, plus a ref to tell controls apart. */
export interface RememberedControl {
  ref: string;
  role: string;
  name: string;
}

/**
 * What the Mind remembers of what it heard. The Give_Up_Thoughts are built from this and from nothing else.
 */
export interface ListenerMemory {
  /** Number of actions decided so far. */
  actions: number;
  /** The Intention the Mind is working on (or was, when it gave up). */
  seeking: Intention | null;
  /** The goal of the Mission, in the Mission's words. */
  goal: string;
  /** Refs of every node that has had focus at the start of a decision. */
  focusedRefs: Set<string>;
  /** Controls reached in the latest search, in the order they were reached. */
  reached: RememberedControl[];
  /** Where the latest search ran. */
  scope: 'page' | 'dialog';
  /** The dialog the Mind is (or was last) in. */
  dialogName: string | null;
  /** Controls the Tab round reached in that dialog, in order. */
  tabReached: RememberedControl[];
  /** Controls the Shift+Tab round reached in that dialog, in order. */
  shiftReached: RememberedControl[];
  /** True once Escape has been pressed in that dialog. */
  escapePressed: boolean;
  /** Controls in that dialog the Mind hears in the tree but has never had focus. */
  dialogUnreached: RememberedControl[];
  /** Controls on the page (outside a dialog) the Mind hears in the tree but has never had focus. */
  pageUnreached: RememberedControl[];
}

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

/** The most control names a sentence lists before it says "and N more". */
export const MAX_LISTED = 5;

/** `'text'`. */
export function quoted(text: string): string {
  return `'${text}'`;
}

/** Shortens long names at a word boundary: "Payment protection for ₹99 Get a refund…" → "Payment protection for ₹99…". */
export function shorten(text: string, max = 28): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = clean.charAt(max) === ' ' ? -1 : cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** `'Pay this bill, button'` as a screen reader says it, or `null` when nothing has focus. */
export function heardAs(node: HeardNode | undefined): string | null {
  if (node === undefined || node.role === 'RootWebArea') return null;
  return quoted(describeNode({ ...node, name: shorten(node.name) }));
}

/** `a`, `a and b`, `a, b and c`. When there are more than `MAX_LISTED` items: `a, b, c, d, e and 3 more`. */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length > MAX_LISTED) {
    return `${items.slice(0, MAX_LISTED).join(', ')} and ${items.length - MAX_LISTED} more`;
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Quoted, shortened names of the named controls, without repeats, in order. */
export function namedList(controls: readonly RememberedControl[]): string[] {
  const names: string[] = [];
  for (const control of controls) {
    const name = shorten(control.name);
    if (name !== '' && !names.includes(quoted(name))) names.push(quoted(name));
  }
  return names;
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** `the 'Protect your payment' dialog`, or `the dialog` when the dialog has no name. */
function theDialog(name: string | null): string {
  const label = name === null ? '' : shorten(name);
  return label === '' ? 'the dialog' : `the ${quoted(label)} dialog`;
}

/** `a dialog` is used when the Mind does not even remember a name. */
function inDialog(name: string | null): string {
  const label = name === null ? '' : shorten(name);
  return label === '' ? 'a dialog' : `the ${quoted(label)} dialog`;
}

// ---------------------------------------------------------------------------------------------------------
// Decision thoughts
// ---------------------------------------------------------------------------------------------------------

export function orientationThought(heard: Heard, first: boolean): string {
  const title = heard.title.trim();
  if (first) {
    return title === ''
      ? "I've just arrived on the page. Before I look for anything, I'll jump to the next heading to hear where I am."
      : `I've just arrived on ${quoted(shorten(title, 60))}. Before I look for anything, I'll jump to the next heading to hear where I am.`;
  }
  return "The page has changed, so I'll jump to the next heading to hear where I am before I look for anything.";
}

export function matchActivateThought(lead: string, node: HeardNode, key: 'Enter' | 'Space'): string {
  return `${lead}I heard ${heardAs(node) ?? 'it'}. That's what I want, so I'll press ${key}.`;
}

export function matchTypeThought(lead: string, node: HeardNode, text: string): string {
  return `${lead}I heard ${heardAs(node) ?? 'it'}. That's the field I want, so I'll type "${text}".`;
}

export function pageSearchThought(a: {
  lead: string;
  mode: SearchMode;
  node: HeardNode | undefined;
  landed: boolean;
  used: boolean;
}): string {
  const go =
    a.mode === 'button' ? 'jump to the next button' : a.mode === 'field' ? 'jump to the next form field' : 'press Tab';
  const here = heardAs(a.node);
  if (!a.landed) {
    return here === null
      ? `${a.lead}I'm not on anything I can use yet, so I'll ${go}.`
      : `${a.lead}I'm on ${here}, which isn't what I'm after, so I'll ${go}.`;
  }
  if (here === null) return `${a.lead}I'm on the page itself, not on a control, so I'll ${go} again.`;
  let why = "That isn't what I'm looking for.";
  if (a.used) why = "I've already used that one.";
  else if (a.node !== undefined && JUMP_BUTTON_ROLES.has(a.node.role) && a.node.name.trim() === '') {
    why = "It has no name, so I can't tell what it does.";
  }
  return `${a.lead}I heard ${here}. ${why} I'll ${go} again.`;
}

export function dialogSearchThought(a: {
  lead: string;
  dialogName: string;
  node: HeardNode | undefined;
  key: 'Tab' | 'Shift+Tab';
  first: boolean;
  used: boolean;
}): string {
  const here = heardAs(a.node);
  const place = inDialog(a.dialogName);
  if (a.first) {
    return a.key === 'Tab'
      ? `${a.lead}I'm inside ${place}${here === null ? '' : ` on ${here}, which isn't what I'm after`}. I'll press Tab and listen to where I land.`
      : `${a.lead}I'll go the other way round ${place}, pressing Shift+Tab and listening to where I land.`;
  }
  const why = a.used ? "I've already used that one." : "That isn't what I'm after.";
  return here === null
    ? `${a.lead}I'm not on a control. I'll press ${a.key} again.`
    : `${a.lead}I heard ${here}. ${why} I'll press ${a.key} again.`;
}

/**
 * A round of Tab or Shift+Tab has come back to a control it already reached. `unreached` (optional) lists
 * the controls the Mind hears in the dialog but has never had focus; it is only spoken before Escape.
 */
export function roundCompleteThought(a: {
  lead: string;
  dialogName: string;
  node: HeardNode | undefined;
  key: 'Tab' | 'Shift+Tab';
  next: 'Shift+Tab' | 'Escape';
  unreached?: readonly RememberedControl[];
}): string {
  const here = heardAs(a.node);
  const back = here === null ? 'somewhere I had already been' : `${here}, where I had already been`;
  const press =
    a.next === 'Escape'
      ? "I'll press Escape once to see if the dialog closes."
      : "I'll go the other way and press Shift+Tab.";
  const names = a.next === 'Escape' ? namedList(a.unreached ?? []) : [];
  const unheard =
    names.length > 0
      ? ` I can hear ${joinList(names)} in ${theDialog(a.dialogName)}, but ${a.key} never lands on ${plural(names.length, 'it', 'them')}.`
      : '';
  return `${a.lead}${a.key} has brought me back to ${back}, so I have been all the way round.${unheard} ${press}`;
}

export function lastResortEnterThought(a: { lead: string; node: HeardNode; first: boolean }): string {
  const here = heardAs(a.node) ?? 'a button';
  return a.first
    ? `${a.lead}I heard ${here}. This button has no name. I've been all the way round and nothing else fits, so I'll try it and hope it's the one I need.`
    : `${a.lead}I heard ${here}. This button has no name either. The last one didn't get me anywhere, so I'll try this one too.`;
}

export function lastResortGoThought(a: { lead: string; remaining: number; tried: number }): string {
  const buttons = plural(a.remaining, 'button with no name', 'buttons with no name');
  return a.tried === 0
    ? `${a.lead}I've been all the way round and nothing else fits. I heard ${a.remaining} ${buttons}, so I'll go back to the first one and try it.`
    : `${a.lead}That didn't get me anywhere. I still have ${a.remaining} ${buttons} to try, so I'll move on to the next one.`;
}

// ---------------------------------------------------------------------------------------------------------
// Give_Up_Thoughts, built only from the Mind's memory
// ---------------------------------------------------------------------------------------------------------

/**
 * `trapped`: Tab, Shift+Tab and Escape all failed inside a dialog. Says where the Mind is stuck, which
 * controls the keys moved between, and which controls it can hear but cannot reach.
 */
export function trappedThought(memory: ListenerMemory): string {
  const parts = [`I'm stuck in ${inDialog(memory.dialogName)}.`];

  const reached = namedList([...memory.tabReached, ...memory.shiftReached]);
  if (reached.length > 0) {
    const where =
      reached.length === 1
        ? `Tab and Shift+Tab only land on ${reached[0]}`
        : `Tab and Shift+Tab only move between ${joinList(reached)}`;
    parts.push(memory.escapePressed ? `${where}, and Escape does nothing.` : `${where}.`);
  } else if (memory.escapePressed) {
    parts.push('Escape does nothing.');
  }

  const unreached = memory.dialogUnreached;
  const names = namedList(unreached);
  if (names.length > 0) {
    const allButtons = unreached.every((control) => JUMP_BUTTON_ROLES.has(control.role));
    const noun = allButtons ? plural(names.length, 'button', 'buttons') : plural(names.length, 'control', 'controls');
    parts.push(
      `I can hear ${joinList(names)} ${noun}, but I can't reach ${plural(names.length, 'it', 'them')} with the keyboard, so I'm giving up.`,
    );
  } else {
    parts.push("I can't get out with the keyboard, so I'm giving up.");
  }
  return parts.join(' ');
}

/**
 * `no_match`: a Full_Pass found nothing that fits the Intention. Says what kind of control the Mind was
 * after, where it looked, what it went through, and which fitting controls it hears but cannot reach.
 */
export function noMatchThought(memory: ListenerMemory): string {
  const seeking = memory.seeking;
  if (seeking === null) return "I have nothing left to try, so I'm giving up.";

  const kind = seeking.target.kind;
  const noun = kind === 'field' ? 'form field' : kind;
  const inDialogScope = memory.scope === 'dialog';
  const where = inDialogScope ? `in ${theDialog(memory.dialogName)}` : 'on this page';

  const named = namedList(memory.reached);
  const unnamed = memory.reached.filter((control) => control.name.trim() === '').length;
  const parts: string[] = [];
  if (memory.reached.length === 0) {
    parts.push(`I couldn't land on any ${noun} ${where}, so I'm giving up.`);
  } else {
    const bits = [...named, ...(unnamed > 0 ? [`${unnamed} with no name`] : [])];
    const list = bits.length > 0 ? ` (${joinList(bits)})` : '';
    parts.push(
      `I went through every ${noun} I could reach ${where}${list} and none of them sounded like what I was looking for, so I'm giving up.`,
    );
  }

  const roles = TARGET_ROLES[kind];
  const unreached = (inDialogScope ? memory.dialogUnreached : memory.pageUnreached).filter((control) =>
    roles.has(control.role),
  );
  const unreachedNames = namedList(unreached);
  if (unreachedNames.length > 0) {
    parts.push(
      `I can hear ${joinList(unreachedNames)} ${where}, but my keyboard never lands on ${plural(unreachedNames.length, 'it', 'them')}.`,
    );
  }
  return parts.join(' ');
}

/** The goal as the end of "I haven't managed to ...": "Pay this bill." → "pay this bill". */
function goalPhrase(goal: string): string {
  const clean = goal.trim().replace(/[.!]+$/u, '').trim();
  if (clean === '') return '';
  // Keep the capital letter of an acronym or a name written in capitals ("PDF", "OK").
  const keepCase = /^\p{Lu}{2}/u.test(clean);
  return keepCase ? clean : `${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

/** `step_limit`: the Run used all its Steps. Says how many times the Mind tried and what it wanted to do. */
export function stepLimitThought(memory: ListenerMemory): string {
  // The opening of the page is the first Step, so the count is the actions plus one.
  const tries = memory.actions + 1;
  const goal = goalPhrase(memory.goal);
  const task = goal === '' ? 'finished' : `managed to ${goal}`;
  return `I've tried ${tries} ${plural(tries, 'time', 'times')} and still haven't ${task}, so I'm giving up.`;
}
