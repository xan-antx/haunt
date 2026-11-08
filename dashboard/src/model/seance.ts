// Séance answers: first person, built only from run fields, with step citations.
// No AI model or outside service is involved.

import type { Run } from '../data/types';
import type { QuestionId } from '../routes';
import { runColdSpots } from './coldSpots';
import { FINDING_LABELS } from './findingLabels';
import { formatSeconds } from './format';

export type AnswerPart =
  | { kind: 'text'; text: string }
  /** Rendered as a link "step 9" (or "Step 9" when capitalized) to the Ghost Cam. */
  | { kind: 'cite'; step: number; capitalize?: boolean };

export interface Answer {
  /** One paragraph per line of the answer. */
  paragraphs: AnswerPart[][];
}

export const QUESTIONS: Record<QuestionId, string> = {
  'why-give-up': 'Why did you give up?',
  'where-stuck': 'Where did you get stuck?',
  'what-heard': 'What did you hear?',
  'what-helped': 'What would have helped?',
};

const text = (t: string): AnswerPart => ({ kind: 'text', text: t });
const cite = (step: number, capitalize = false): AnswerPart => ({ kind: 'cite', step, capitalize });

function stripEnd(sentence: string): string {
  return sentence.trim().replace(/[.!?]+$/, '');
}

function whyGiveUp(run: Run): AnswerPart[][] {
  const last = run.steps[run.steps.length - 1]!;
  switch (run.result) {
    case 'gave_up': {
      const lines: AnswerPart[][] = [[text('I gave up at '), cite(last.n), text(` on ${last.page}.`)]];
      const before = run.findings.filter((f) => f.step <= last.n).sort((a, b) => a.step - b.step);
      for (const f of before) lines.push([text('At '), cite(f.step), text(`, ${stripEnd(f.title)}.`)]);
      return lines;
    }
    case 'succeeded':
      return [[text("I didn't give up. I finished at "), cite(last.n), text(`: ${stripEnd(last.spoken)}.`)]];
    case 'error':
      return [[text('Something broke on the technical side at '), cite(last.n), text(', so I had to stop.')]];
  }
}

function whereStuck(run: Run): AnswerPart[][] {
  const spots = runColdSpots(run);
  if (spots.length === 0) return [[text('I never got stuck.')]];
  const pageOf = new Map(run.steps.map((s) => [s.n, s.page]));
  return spots.map((spot) => [
    text(`On ${pageOf.get(spot.step)} at `),
    cite(spot.step),
    text(`, I waited ${formatSeconds(spot.waitMs)}.`),
  ]);
}

function whatHeard(run: Run): AnswerPart[][] {
  return run.steps.map((step) => [cite(step.n, true), text(`: '${step.spoken}'.`)]);
}

function whatHelped(run: Run): AnswerPart[][] {
  if (run.findings.length === 0) return [[text('Nothing got in my way this time, so I have nothing to wish for.')]];
  return [...run.findings]
    .sort((a, b) => a.step - b.step)
    .map((f) => [text('At '), cite(f.step), text(`: ${FINDING_LABELS[f.type].helped}`)]);
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
