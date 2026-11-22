import type { GiveUpReason } from '../../core/types.ts';
import type { ListenerAction } from '../../ghosts/listener/body.ts';

/*
 * What the AI mind remembers: how many actions it took, and nothing else. It reads no Findings,
 * no Probe and no StepTrace, so the closing sentence cannot be shaped by what the detectors found.
 */
export class AiMindMemory {
  private count = 0;

  /** Counts one action the agent took with the keyboard. */
  recordAction(): void {
    this.count += 1;
  }

  get actions(): number {
    return this.count;
  }

  /** The closing sentence on the last Step when the run ends without success. Built from the action count only. */
  giveUpThought(_reason: GiveUpReason): string {
    const things = this.count === 1 ? '1 thing' : `${this.count} things`;
    return `I tried ${things} with the keyboard and could not finish what I came to do.`;
  }
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
