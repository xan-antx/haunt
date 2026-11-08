// Transcript lines for the Ghost Cam's Spoken_Panel and Thought_Panel (Req 10.4, 10.5,
// 10.16–10.19, 10.22, 10.27). One line per step from the first step up to the current one.

import type { Run } from '../data/types';

/** 0 is the Current_Line; 3 is the floor for lines three or more steps back. */
export type FadeLevel = 0 | 1 | 2 | 3;

export interface TranscriptLine {
  n: number;
  text: string;
  empty: boolean;
  fade: FadeLevel;
  current: boolean;
}

export const NOTHING_SPOKEN = 'Nothing was spoken at this step.';
export const NOTHING_THOUGHT = 'Nothing was thought at this step.';

/** `distance` is how many steps this line sits before the Current_Line. */
export function fadeLevel(distance: number): FadeLevel {
  if (!(distance > 0)) return 0;
  if (distance >= 3) return 3;
  return Math.floor(distance) as FadeLevel;
}

export function buildTranscript(run: Run, currentN: number): TranscriptLine[] {
  const lastIndex = run.steps.findIndex((step) => step.n === currentN);
  if (lastIndex < 0) return [];

  const listener = run.ghost === 'listener';
  const placeholder = listener ? NOTHING_SPOKEN : NOTHING_THOUGHT;
  const lines: TranscriptLine[] = [];

  for (let i = 0; i <= lastIndex; i++) {
    const step = run.steps[i];
    if (step === undefined) continue; // unreachable: i <= lastIndex < run.steps.length
    const raw: string | undefined = listener ? step.spoken : step.thought;
    const empty = typeof raw !== 'string' || raw.trim() === '';
    lines.push({
      n: step.n,
      text: empty ? placeholder : raw,
      empty,
      fade: fadeLevel(lastIndex - i),
      current: i === lastIndex,
    });
  }

  return lines;
}
