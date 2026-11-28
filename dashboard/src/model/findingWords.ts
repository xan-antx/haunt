// Plain words about one finding, built only from the run file: where a keyboard trap held the
// ghost, the first-person phrase for "Where did you get stuck?", and the one readable sentence the
// Stuck_Notice shows from the finding's evidence (Req 12.5, 10.36).

import type { Finding, Run } from '../data/types';
import { FINDING_LABELS } from './findingLabels';

const NOUN = String.raw`(dialog|modal|pop-?up)`;
// A name in straight or curly quotes, never spanning a line.
const QUOTED = String.raw`(?:"([^"\n]{1,60})"|“([^”\n]{1,60})”|'([^'\n]{1,60})'|‘([^’\n]{1,60})’)`;
/** `dialog "Protect your payment"` */
const NOUN_THEN_NAME = new RegExp(String.raw`\b${NOUN}\s+${QUOTED}`, 'i');
/** `the 'Protect your payment' dialog` */
const NAME_THEN_NOUN = new RegExp(String.raw`${QUOTED}\s+${NOUN}\b`, 'i');
/** Screen reader style, at the start of a sentence: `Protect your payment, dialog.` */
const SPOKEN_NAME = new RegExp(String.raw`(?:^|[.!?]\s+)([^,.!?\n]{1,60}),\s*${NOUN}\b`, 'i');
const POP_UP_WORDS = /\b(dialog|modal|pop-?up)\b/i;

function quote(name: string): string {
  return name.includes("'") ? `"${name}"` : `'${name}'`;
}

function plainNoun(noun: string): string {
  return noun.toLowerCase() === 'dialog' ? 'dialog' : 'pop-up';
}

function named(noun: string, name: string | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? null : `the ${quote(trimmed)} ${plainNoun(noun)}`;
}

/** The first sentence of an element trap's evidence: `Keyboard focus could not leave the text box "Note" (role textbox).` */
const ELEMENT_TRAP = new RegExp(
  String.raw`^\s*Keyboard focus could not leave (?:the text box\s+${QUOTED}|a text box with no name|a text box\b)`,
  'i',
);

/** `the 'Note' text box`, `a text box with no name` or `a text box`, or null when the finding is not an element trap. */
function elementTrapPlace(finding: Finding): string | null {
  if (finding.type !== 'focus_trap') return null;
  const m = ELEMENT_TRAP.exec(finding.evidence);
  if (!m) return null;
  const name = (m[1] ?? m[2] ?? m[3] ?? m[4])?.trim() ?? '';
  if (name !== '') return `the ${quote(name)} text box`;
  return /no name/i.test(m[0]) ? 'a text box with no name' : 'a text box';
}

function placeIn(text: string): string | null {
  let m = NOUN_THEN_NAME.exec(text);
  if (m) return named(m[1]!, m[2] ?? m[3] ?? m[4] ?? m[5]);
  m = NAME_THEN_NOUN.exec(text);
  if (m) return named(m[5]!, m[1] ?? m[2] ?? m[3] ?? m[4]);
  m = SPOKEN_NAME.exec(text);
  if (m) return named(m[2]!, m[1]);
  return null;
}

/**
 * Trap_Place: where a keyboard trap held the ghost, such as "the 'Protect your payment' dialog".
 * Looks in the finding's evidence and title, then the step's spoken and thought text. Falls back
 * to "a pop-up" when one of those mentions a dialog, modal or pop-up, and to null otherwise.
 */
export function trapPlace(run: Run, finding: Finding): string | null {
  const element = elementTrapPlace(finding);
  if (element) return element;
  const step = run.steps.find((s) => s.n === finding.step);
  const texts = [finding.evidence, finding.title, step?.spoken ?? '', step?.thought ?? ''];
  for (const text of texts) {
    const place = placeIn(text);
    if (place) return place;
  }
  return [finding.evidence, finding.title, step?.spoken ?? ''].some((t) => POP_UP_WORDS.test(t)) ? 'a pop-up' : null;
}

/** What the ghost says after "At step n I", for example "got trapped in the 'Protect your payment' dialog". */
export function stuckPhrase(run: Run, finding: Finding): string {
  if (finding.type === 'focus_trap') {
    const place = trapPlace(run, finding);
    if (place) return `got trapped in ${place}`;
  }
  return FINDING_LABELS[finding.type].stuck;
}

/**
 * Plain words that tell apart findings which would otherwise read the same (R2-03). `group` holds
 * findings of one type that a reader could mix up. Each entry is the first of these that is
 * different for every finding in the group, all taken from the run file: the finding's own title,
 * its step, or the first sentence of its evidence. An entry is null when the group has one finding,
 * or when nothing in the run file tells them apart (the findings are then left as they are).
 */
export function tellApart(group: Finding[]): (string | null)[] {
  if (group.length < 2) return group.map(() => null);
  const distinct = (values: string[]) => values.every((v) => v !== '') && new Set(values).size === values.length;
  const titles = group.map((f) => f.title.trim());
  if (distinct(titles)) return titles;
  const steps = group.map((f) => `Step ${f.step}`);
  if (distinct(steps)) return steps;
  const sentences = group.map((f) => firstSentence(f.evidence.trim()));
  const plain = sentences.every((s) => s.length <= EVIDENCE_SENTENCE_MAX && !NOT_PLAIN.test(s));
  if (plain && distinct(sentences)) return sentences;
  return group.map(() => null);
}

/** Longest Evidence_Sentence, in characters, before the table sentence is used instead. */
export const EVIDENCE_SENTENCE_MAX = 140;

/** Markup, CSS selectors, attributes, URLs and page paths are details, not plain words. */
const NOT_PLAIN = /[<>{}[\]=\\|]|\._|https?:|(^|[\s(])\/\S*/;
const SENTENCE_END = /[.!?]["'”’)]*$/;

/** The first sentence of a text: up to the first ".", "!" or "?" that ends a word. */
function firstSentence(text: string): string {
  const m = /^[\s\S]+?[.!?]["'”’)]*(?=\s|$)/.exec(text);
  return (m ? m[0] : text).trim();
}

/**
 * Evidence_Sentence (Req 10.36): one readable sentence from a finding's evidence. It is the
 * evidence's first sentence when that is plain words no longer than EVIDENCE_SENTENCE_MAX
 * characters (with a full stop added if it has none). Otherwise it is the finding type's plain
 * sentence from the label table, naming the trap's place for a keyboard trap when it is known.
 */
export function evidenceSentence(run: Run, finding: Finding): string {
  const first = firstSentence(finding.evidence.trim());
  if (first !== '' && first.length <= EVIDENCE_SENTENCE_MAX && !NOT_PLAIN.test(first)) {
    return SENTENCE_END.test(first) ? first : `${first}.`;
  }
  if (finding.type === 'focus_trap') {
    const place = trapPlace(run, finding);
    if (place) return `Keyboard focus got stuck in ${place}, with no way out by keyboard.`;
  }
  return FINDING_LABELS[finding.type].summary;
}
