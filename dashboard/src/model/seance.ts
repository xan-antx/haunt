// Séance answers: first person, built only from run fields, with step citations.
// No AI model or outside service is involved.

import type { Finding, GhostId, Run } from '../data/types';
import type { QuestionId } from '../routes';
import { runColdSpots } from './coldSpots';
import { FINDING_LABELS } from './findingLabels';
import { stuckPhrase } from './findingWords';
import { missionWords, pageName } from './sites';

export type AnswerPart =
  | { kind: 'text'; text: string }
  /** Rendered as a link "step 9" (or "Step 9" when capitalized) to the Ghost Cam. */
  | { kind: 'cite'; step: number; capitalize?: boolean };

export interface Answer {
  /** One paragraph per line of the answer. */
  paragraphs: AnswerPart[][];
}

/**
 * The question as a ghost is asked it. Only The Listener hears the page; The Phantom and Bebe
 * see it, so they are asked what they were thinking (UI-02).
 */
export function questionLabel(ghost: GhostId, question: QuestionId): string {
  switch (question) {
    case 'why-give-up':
      return 'Why did you give up?';
    case 'where-stuck':
      return 'Where did you get stuck?';
    case 'what-heard':
      return ghost === 'listener' ? 'What did you hear?' : 'What were you thinking?';
    case 'what-helped':
      return 'What would have helped?';
  }
}

const text = (t: string): AnswerPart => ({ kind: 'text', text: t });
const cite = (step: number, capitalize = false): AnswerPart => ({ kind: 'cite', step, capitalize });

function stripEnd(sentence: string): string {
  return sentence.trim().replace(/[.!?]+$/, '');
}

/** Lower-cases a title's first letter so it reads inside a sentence, but leaves "ARIA" and "OK" alone. */
function inSentence(title: string): string {
  const t = stripEnd(title);
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** One finding for each step and type, in step order, so the same problem is never told twice. */
function distinctFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return [...findings]
    .sort((a, b) => a.step - b.step)
    .filter((f) => {
      const key = `${f.step}:${f.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function whyGiveUp(run: Run): AnswerPart[][] {
  const last = run.steps[run.steps.length - 1]!;
  switch (run.result) {
    case 'gave_up': {
      const lines: AnswerPart[][] = [
        [text('I gave up at '), cite(last.n), text(` on ${pageName(run.site.name, last.page)}.`)],
      ];
      const before = distinctFindings(run.findings).filter((f) => f.step <= last.n);
      for (const f of before) lines.push([text('At '), cite(f.step), text(`, ${inSentence(f.title)}.`)]);
      return lines;
    }
    case 'succeeded': {
      const done = missionWords(run.mission.id).done;
      return [[text("I didn't give up. I finished at "), cite(last.n), text(done ? ` and ${done}.` : '.')]];
    }
    case 'error':
      return [[text('Something broke on the technical side at '), cite(last.n), text(', so I had to stop.')]];
  }
}

/** "a", "a and b", "a, b and c". */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases.join('');
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

/**
 * One line per Cold_Spot, in step order, naming in plain words what the ghost found there
 * (Req 12.5, revised by Req 24.6): "At step 12 I found a button with no name." A Cold_Spot with
 * no finding is where the ghost gave up or a technical error stopped it, on its Page_Name.
 */
function whereStuck(run: Run): AnswerPart[][] {
  const spots = runColdSpots(run);
  if (spots.length === 0) return [[text('I never got stuck.')]];
  const pageOf = new Map(run.steps.map((s) => [s.n, s.page]));
  return spots.map((spot) => {
    const found = run.findings.filter((f) => f.step === spot.step);
    if (found.length > 0) {
      const phrases = [...new Set(found.map((f) => stuckPhrase(run, f)))];
      return [text('At '), cite(spot.step), text(` I ${joinPhrases(phrases)}.`)];
    }
    const page = pageName(run.site.name, pageOf.get(spot.step) ?? '');
    return spot.reason === 'error'
      ? [text('At '), cite(spot.step), text(` a technical error stopped me on ${page}.`)]
      : [text('At '), cite(spot.step), text(` I gave up on ${page}.`)];
  });
}

/**
 * The Listener answers with what it heard, in quotes. The Phantom and Bebe have nothing spoken, so
 * they answer with what they were thinking at each step. A step with nothing to say is left out.
 */
function whatHeard(run: Run): AnswerPart[][] {
  const lines: AnswerPart[][] = [];
  for (const step of run.steps) {
    if (run.ghost === 'listener') {
      const heard = step.spoken.trim();
      if (heard !== '') lines.push([cite(step.n, true), text(`: '${heard}'.`)]);
    } else {
      const thought = step.thought.trim();
      if (thought !== '') lines.push([cite(step.n, true), text(`: ${/[.!?]$/.test(thought) ? thought : `${thought}.`}`)]);
    }
  }
  return lines.length > 0 ? lines : [[text('I have nothing to tell you about this visit.')]];
}

function whatHelped(run: Run): AnswerPart[][] {
  if (run.findings.length === 0) return [[text('Nothing got in my way this time, so I have nothing to wish for.')]];
  return distinctFindings(run.findings).map((f) => [
    text('At '),
    cite(f.step),
    text(`: ${FINDING_LABELS[f.type].helped}`),
  ]);
}

export function answer(run: Run, question: QuestionId): Answer {
  switch (question) {
    case 'why-give-up':
      return { paragraphs: whyGiveUp(run) };
    case 'where-stuck':
      return { paragraphs: whereStuck(run) };
    case 'what-heard':
      return { paragraphs: whatHeard(run) };
    case 'what-helped':
      return { paragraphs: whatHelped(run) };
  }
}

/** Plain text of an answer, for tests and announcements. */
export function answerText(a: Answer): string {
  return a.paragraphs
    .map((p) =>
      p.map((part) => (part.kind === 'text' ? part.text : `${part.capitalize ? 'Step' : 'step'} ${part.step}`)).join(''),
    )
    .join('\n');
}
