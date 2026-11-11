/*
 * The visual ghosts' thoughts (Requirements 6.8, 16.4, 18.4; design "Shared visual body (Phase 2a)" >
 * Visual mind, and the Give_Up_Thoughts in "The Phantom" and "Bebe").
 *
 * Small pure functions that turn what the Mind saw into short first-person sentences in English. They
 * quote the text that was on the screen as it was seen, in Punjabi, Hindi or English (18.4). When the
 * text that matched is not in the ghost's first language, the thought says so: "The button says 'Pay
 * this bill' in English, not Punjabi, but I can make it out. I'll press it."
 *
 * The Give_Up_Thoughts (`noMatchThought`, `misclicksThought`, `slowWaitThought`, `stepLimitThought`)
 * take only a `VisualMemory`: texts and counts of what the Mind saw and did. They never see a Probe, a
 * Finding, a trace or a screenshot.
 *
 * This file does not import `mind.ts`: the memory type lives here and `mind.ts` imports it.
 */

import type { Intention, TargetKind } from '../../missions/loadMission.ts';
import type { PatternLang } from '../../missions/patterns.ts';
import type { SeenLook } from '../../page/sight.ts';

/** How the ghost points at things: The Phantom taps a touch screen, Bebe clicks with a mouse. */
export type Pointer = 'tap' | 'click';

/** What the Mind remembers of what it saw. The Give_Up_Thoughts are built from this and from nothing else. */
export interface VisualMemory {
  /** Number of actions decided so far. */
  actions: number;
  /** The goal of the Mission, in the Mission's words. */
  goal: string;
  /** The Intention the Mind is working on (or was, when it gave up). */
  seeking: Intention | null;
  /** The ghost's first language. */
  preferred: PatternLang;
  pointer: Pointer;
  /** Clicks on a matching target for the current Intention. */
  targetClicks: number;
  /** The text of the last target clicked for the current Intention, as seen. */
  targetText: string | null;
  /** Unexpected pages reached by those clicks, described by what was seen there. */
  wrongPages: string[];
  /** Texts (or field labels) of the items of the target's look seen in the latest search, in order. */
  seenOfKind: string[];
  /** True when the latest search scrolled to the bottom and back to the top. */
  searchedWholePage: boolean;
  /** The start of the visible text of the latest Sight, or '' when it was blank. */
  lastScreen: string;
}

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

/** The most texts a sentence lists before it says "and N more". */
export const MAX_LISTED = 5;

const LANGUAGE_NAMES: Readonly<Record<PatternLang, string>> = { en: 'English', pa: 'Punjabi', hi: 'Hindi' };

export function quoted(text: string): string {
  return `'${text}'`;
}

/** Shortens long text at a word boundary and ends it with "…". */
export function shorten(text: string, max = 40): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = clean.charAt(max) === ' ' ? -1 : cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** `a`, `a and b`, `a, b and c`; more than `MAX_LISTED` items end with "and N more". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length > MAX_LISTED) {
    return `${items.slice(0, MAX_LISTED).join(', ')} and ${items.length - MAX_LISTED} more`;
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** What a sighted person calls each look. */
function noun(look: SeenLook | TargetKind): string {
  switch (look) {
    case 'button':
      return 'button';
    case 'link':
      return 'link';
    case 'field':
      return 'box';
    case 'checkbox':
      return 'tick box';
    case 'text':
      return 'text';
  }
}

/** The verb for acting on something of this look with this pointer. */
function verb(pointer: Pointer, look: SeenLook | TargetKind): string {
  if (pointer === 'tap') return 'tap';
  return look === 'button' ? 'press' : 'click';
}

/** "The button says 'X' in English, not Punjabi, but I can make it out." or "I can see 'X'." */
function sawText(a: { what: string; text: string; lang: PatternLang; preferred: PatternLang }): string {
  if (a.lang === a.preferred) return `I can see ${quoted(shorten(a.text))}.`;
  return `The ${a.what} says ${quoted(shorten(a.text))} in ${LANGUAGE_NAMES[a.lang]}, not ${LANGUAGE_NAMES[a.preferred]}, but I can make it out.`;
}

// ---------------------------------------------------------------------------------------------------------
// Decision thoughts
// ---------------------------------------------------------------------------------------------------------

/** A button, link or tick box whose own text matched. */
export function matchClickThought(a: {
  lead: string;
  look: TargetKind;
  text: string;
  lang: PatternLang;
  preferred: PatternLang;
  pointer: Pointer;
  again: boolean;
}): string {
  const seen = sawText({ what: noun(a.look), text: a.text, lang: a.lang, preferred: a.preferred });
  const again = a.again ? ' again' : '';
  return `${a.lead}${seen} I'll ${verb(a.pointer, a.look)} it${again}.`;
}

/** A field whose label matched: the first of the two Steps of a type Intention. */
export function fieldClickThought(a: {
  lead: string;
  label: string;
  lang: PatternLang;
  preferred: PatternLang;
  pointer: Pointer;
  retry: boolean;
}): string {
  if (a.retry) {
    return `${a.lead}The box under ${quoted(shorten(a.label))} doesn't show what I typed, so I'll ${verb(a.pointer, 'field')} it and try again.`;
  }
  const seen =
    a.lang === a.preferred
      ? `I can see a box labelled ${quoted(shorten(a.label))}.`
      : `The label says ${quoted(shorten(a.label))} in ${LANGUAGE_NAMES[a.lang]}, not ${LANGUAGE_NAMES[a.preferred]}, but I can make it out.`;
  return `${a.lead}${seen} I'll ${verb(a.pointer, 'field')} the box so I can type in it.`;
}

/** The second Step of a type Intention. */
export function typeThought(a: { lead: string; label: string; value: string }): string {
  return `${a.lead}I've put my cursor in the ${quoted(shorten(a.label))} box. I'll type "${a.value}".`;
}

/** Last resort: a button that shows no text. */
export function lastResortThought(a: { lead: string; first: boolean; pointer: Pointer }): string {
  const act = verb(a.pointer, 'button');
  return a.first
    ? `${a.lead}I can't see a button with words that fit. There is a button with no words on it, so I'll ${act} it and hope it's the one I need.`
    : `${a.lead}That didn't get me anywhere. There is another button with no words on it, so I'll ${act} that one.`;
}

/** Unexpected page, with a visible way back. */
export function recoveryLinkThought(a: { lead: string; page: string; link: string; pointer: Pointer }): string {
  const where = a.page === '' ? 'This' : `This page says ${quoted(shorten(a.page))}. It`;
  return `${a.lead}${where} isn't where I meant to go. I'll ${verb(a.pointer, 'link')} ${quoted(shorten(a.link))} to go back.`;
}

/** Unexpected page, with no visible way back. */
export function recoveryBackThought(a: { lead: string; page: string }): string {
  const where = a.page === '' ? 'This' : `This page says ${quoted(shorten(a.page))}. It`;
  return `${a.lead}${where} isn't where I meant to go, and I can't see a way back on the page, so I'll use the browser's Back button.`;
}

export function waitThought(lead: string): string {
  return `${lead}The screen is still blank, so I'll wait for something to appear.`;
}

/**
 * One step of the scroll search. `start`: the first scroll down; `more`: another one in the same
 * direction; `turn`: the bottom was reached, so the search turns round and scrolls up.
 */
export function scrollThought(a: { lead: string; dir: 'down' | 'up'; stage: 'start' | 'more' | 'turn' }): string {
  if (a.stage === 'turn') {
    return `${a.lead}I've reached the bottom of the page and still can't see what I need, so I'll scroll back up.`;
  }
  if (a.stage === 'start') {
    return `${a.lead}I can't see what I'm looking for on the screen, so I'll scroll ${a.dir}.`;
  }
  return `${a.lead}Still nothing that fits, so I'll scroll ${a.dir} a bit more.`;
}

// ---------------------------------------------------------------------------------------------------------
// Give_Up_Thoughts, built only from the Mind's memory
// ---------------------------------------------------------------------------------------------------------

/** `no_match`: the scroll search went down to the bottom and back up without finding a target. */
export function noMatchThought(memory: VisualMemory): string {
  const seeking = memory.seeking;
  if (seeking === null) return "I have nothing left to try, so I'm giving up.";
  const kind = seeking.target.kind;
  const what = noun(kind);
  const where = memory.searchedWholePage
    ? "I've looked from the top of this page to the bottom and back"
    : "I've looked all over this screen";
  const seen = [...new Set(memory.seenOfKind.map((text) => shorten(text, 28)).filter((text) => text !== ''))].map(
    quoted,
  );
  const first = `${where}, and I can't see any ${what} that fits what I need.`;
  if (seen.length === 0) return `${first} I'm giving up.`;
  const label =
    kind === 'field' ? plural(seen.length, 'a box labelled', 'boxes labelled') : plural(seen.length, `a ${what}`, `${what}s`);
  const none = plural(seen.length, "it isn't", 'none of them is');
  return `${first} I saw ${label} ${joinList(seen)}, but ${none} right, so I'm giving up.`;
}

/** `misclicks`: two clicks in a row on the target landed somewhere else. */
export function misclicksThought(memory: VisualMemory): string {
  const times = memory.targetClicks >= 2 ? 'Twice' : 'Again';
  const act = memory.pointer === 'tap' ? 'tapped' : 'clicked';
  const finger = memory.pointer === 'tap' ? 'my finger' : 'my click';
  const target = memory.targetText === null || memory.targetText === '' ? 'the button I wanted' : quoted(shorten(memory.targetText));
  const wrong = memory.wrongPages.find((page) => page !== '');
  const ended = wrong === undefined ? 'so I hit something else' : `so I ended up on a page that says ${quoted(shorten(wrong))} instead`;
  return `${times} I ${act} ${target} and the page jumped just before ${finger} landed, ${ended}. I'm giving up.`;
}

/** `slow_wait`: more than 10 seconds with no sign of progress. */
export function slowWaitThought(memory: VisualMemory): string {
  const screen = memory.lastScreen === '' ? 'a blank screen' : 'the same screen';
  return `I've been looking at ${screen} for over 10 seconds with no sign that anything is happening, so I'm giving up.`;
}

/** The goal as the end of "I haven't managed to ...": "Pay this month's bill." → "pay this month's bill". */
function goalPhrase(goal: string): string {
  const clean = goal.trim().replace(/[.!]+$/u, '').trim();
  if (clean === '') return '';
  const keepCase = /^\p{Lu}{2}/u.test(clean);
  return keepCase ? clean : `${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

/** `step_limit`: the Run used all its Steps. */
export function stepLimitThought(memory: VisualMemory): string {
  // The opening of the page is the first Step, so the count is the actions plus one.
  const tries = memory.actions + 1;
  const goal = goalPhrase(memory.goal);
  const task = goal === '' ? 'finished' : `managed to ${goal}`;
  return `I've tried ${tries} ${plural(tries, 'time', 'times')} and still haven't ${task}, so I'm giving up.`;
}
