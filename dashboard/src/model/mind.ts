// Which runs the AI mind made. Scripted runs (and runs from before the field existed) get no label.

import type { Run } from '../data/types';

/** The visible label on every AI run the Dashboard names. */
export const AI_MIND_LABEL = 'AI mind';

export function isAiRun(run: Run): boolean {
  return run.mind === 'ai';
}
