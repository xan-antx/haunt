import type { GiveUpReason } from '../../core/types.ts';
import type { ListenerAction } from '../../ghosts/listener/body.ts';

/*
 * What the AI mind remembers: each action it took and what it heard back, exactly as the tools told
 * it. It reads no Findings, no Probe and no StepTrace, so neither the closing sentence nor the
 * "continue the mission" prompt can be shaped by what the detectors found.
 */

/** One action the agent took and what it heard back. */
export interface RememberedAction {
  action: string;
  spoken: string;
}

/** Most actions listed in a "continue the mission" prompt. Older ones are counted, not listed. */
export const CONTINUE_PROMPT_ACTIONS = 10;

/** Longest "heard" text per action in that prompt. */
const MAX_HEARD_CHARS = 200;

export class AiMindMemory {
  private readonly taken: RememberedAction[] = [];

  /** Remembers one action the agent took with the keyboard and what it heard back. */
  recordAction(action: RememberedAction): void {
    this.taken.push(action);
  }

  get actions(): number {
    return this.taken.length;
  }

  /** The closing sentence on the last Step when the run ends without success. Built from the action count only. */
  giveUpThought(_reason: GiveUpReason): string {
    const count = this.taken.length;
    const things = count === 1 ? '1 thing' : `${count} things`;
    return `I tried ${things} with the keyboard and could not finish what I came to do.`;
  }

  /**
   * The prompt for a relaunched Kiro session: the goal, what the agent already did, and an instruction
   * to keep using the tools. The page is left as it was, so the agent picks up where it stopped.
   */
  continuePrompt(goal: string): string {
    const lines = [
      `Continue the mission. Your goal: ${goal}`,
      'Your last session ended before the task was done. The page is still open exactly where you left it.',
    ];
    if (this.taken.length === 0) {
      lines.push('You have not pressed any keys yet.');
    } else {
      const shown = this.taken.slice(-CONTINUE_PROMPT_ACTIONS);
      const hidden = this.taken.length - shown.length;
      lines.push(hidden > 0 ? `Your last ${shown.length} of ${this.taken.length} actions so far:` : 'What you did so far:');
      shown.forEach((taken, i) => {
        lines.push(`${hidden + i + 1}. ${taken.action || 'An action'}. You heard: ${heardText(taken.spoken)}`);
      });
    }
    lines.push(
      'Call read_page now to hear where you are, then keep going with the tools, one action at a time.',
      'Do not answer with text alone. Only call finish if you truly cannot go on.',
    );
    return lines.join('\n');
  }
}

function heardText(spoken: string): string {
  const text = spoken.replace(/\s+/g, ' ').trim();
  if (text === '') return 'nothing.';
  const cut = text.length > MAX_HEARD_CHARS ? `${text.slice(0, MAX_HEARD_CHARS - 1)}…` : text;
  return `"${cut}"`;
}

/** A plain sentence for a step where the agent did not say what it thought. Built from the action only. */
export function fallbackThought(action: ListenerAction): string {
  switch (action.type) {
    case 'key':
      return `I press ${action.key} and listen.`;
    case 'type':
      return 'I type some text and listen.';
    case 'jump':
      return `I jump to the ${action.dir} ${action.to} and listen.`;
  }
}
