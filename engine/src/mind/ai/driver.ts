import { OPENING_THOUGHT } from '../../core/runLoop.ts';
import type { RunLoopOptions, RunLoopOutcome } from '../../core/runLoop.ts';
import { afterStep, closeRun, engineErrorSentence, messageOf } from '../../core/stepPipeline.ts';
import type { StepPipelineOptions } from '../../core/stepPipeline.ts';
import type { ActionResult, Body, Probe } from '../../core/types.ts';
import type { Heard } from '../../ghosts/listener/ax.ts';
import type { ListenerAction } from '../../ghosts/listener/body.ts';
import { AiMindMemory, fallbackThought } from './memory.ts';
import { formatHeard, toListenerAction } from './tools.ts';
import type { ToolCall, ToolResult } from './tools.ts';

/*
 * The AI run driver (design: "AiRunDriver").
 *
 * In the scripted path `runLoop` owns the loop. In the AI path the agent owns the pace, so the driver
 * answers one tool call at a time and runs the same step pipeline after every recorded Step.
 *
 * What the agent never gets: the Probe, the StepTrace and the Findings. Every result is plain text,
 * and the driver has no tool that reads or writes Findings. The detectors alone decide what is wrong.
 */

/** The `intentionId` recorded with every AI step. It never reaches the run file. */
export const AI_INTENTION_ID = 'ai-mind';

/** What every tool says once the run is over. */
export const RUN_ENDED = 'The run has ended. Stop now.';

/** What `read_announcements` says when nothing new was announced. */
export const NO_ANNOUNCEMENTS = 'No new announcements.';

export interface AiRunDriverOptions extends StepPipelineOptions {
  body: Body<Heard, ListenerAction>;
  url: string;
  onOpenFailure?: RunLoopOptions<Heard, ListenerAction>['onOpenFailure'];
}

/**
 * Why Kiro is no longer driving the run. `launches` is how many times Kiro was started for this run,
 * counting the first launch; it defaults to 1.
 */
export type EndCause = { kind: 'exit'; code: number | null; launches?: number } | { kind: 'timeout'; ms: number };

/** The sentence added to the last thought when Kiro kept ending its session and the engine gave up. */
export function kiroStoppedSentence(launches: number): string {
  if (launches <= 1) return 'Kiro ended its session before the run was over, so the engine stopped the run here.';
  const relaunches = launches - 1;
  return `Kiro ended its session ${launches} times before the run was over (the first launch and ${relaunches} ${relaunches === 1 ? 'relaunch' : 'relaunches'}), so the engine stopped the run here.`;
}

export class AiRunDriver {
  private readonly options: AiRunDriverOptions;
  private readonly memory = new AiMindMemory();
  private latest: { heard: Heard; probe: Probe } | null = null;
  private announcementQueue: string[] = [];
  private pendingThought: string | null = null;
  /** Added after the closing sentence when the run gives up because Kiro stopped. */
  private giveUpNote: string | null = null;
  private ended_: RunLoopOutcome | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private resolveEnded: (outcome: RunLoopOutcome) => void = () => undefined;

  /** Resolves when the outcome is set. */
  readonly ended: Promise<RunLoopOutcome>;

  constructor(options: AiRunDriverOptions) {
    this.options = options;
    this.ended = new Promise<RunLoopOutcome>((resolve) => {
      this.resolveEnded = resolve;
    });
  }

  /** The outcome once ended, else null. */
  get outcome(): RunLoopOutcome | null {
    return this.ended_;
  }

  /** `body.open`, Step 1, first pipeline pass. Never throws: a failure becomes an outcome. */
  start(): Promise<void> {
    return this.serial(async () => {
      const { body, url, recorder } = this.options;
      let opened: ActionResult;
      try {
        opened = await body.open(url);
      } catch (error) {
        await this.endAfterOpenFailure(error);
        return;
      }
      try {
        recorder.add(opened, OPENING_THOUGHT);
        const ended = await afterStep(this.options);
        if (ended) await this.end(ended);
      } catch (error) {
        await this.fail(error);
      }
    });
  }

  /** Serialised: one tool call at a time. */
  handle(call: ToolCall): Promise<ToolResult> {
    return this.serial(async () => {
      if (this.ended_) return { ok: false, error: RUN_ENDED };
      try {
        return await this.dispatch(call);
      } catch (error) {
        return this.fail(error);
      }
    });
  }

  /** The outcome after every tool call already queued has been answered, else null. */
  settled(): Promise<RunLoopOutcome | null> {
    return this.serial(async () => this.ended_);
  }

  /** The prompt for a relaunched Kiro session, built from what the agent did and heard so far. */
  continuePrompt(goal: string): string {
    return this.memory.continuePrompt(goal);
  }

  /** Kiro exited or timed out. Ends the run through the give-up or error path. */
  endExternally(cause: EndCause): Promise<RunLoopOutcome> {
    return this.serial(async () => {
      if (this.ended_) return this.ended_;
      if (cause.kind === 'timeout') {
        return this.end({ result: 'error', errorMessage: `Kiro did not finish within the time limit of ${cause.ms} ms.` });
      }
      if (cause.code === 0) {
        this.giveUpNote = kiroStoppedSentence(cause.launches ?? 1);
        return this.end({ result: 'gave_up', reason: 'no_match' });
      }
      const named = cause.code === null ? 'no exit code' : `exit code ${cause.code}`;
      return this.end({ result: 'error', errorMessage: `Kiro stopped before the run ended (${named}).` });
    });
  }

  // ---------------------------------------------------------------------------------------------------

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async dispatch(call: ToolCall): Promise<ToolResult> {
    switch (call.name) {
      case 'read_page': {
        const { perception, probe } = await this.options.body.perceive();
        this.take(perception, probe);
        return { ok: true, text: formatHeard(perception) };
      }

      case 'read_announcements': {
        const queued = this.announcementQueue;
        this.announcementQueue = [];
        return { ok: true, text: queued.length === 0 ? NO_ANNOUNCEMENTS : queued.join('\n') };
      }

      case 'think':
        this.pendingThought = call.text;
        return { ok: true, text: 'Noted.' };

      case 'finish':
        await this.end({ result: 'gave_up', reason: 'no_match' });
        return { ok: true, text: 'The run is finished. Stop now.' };

      case 'press_key':
      case 'type_text':
      case 'jump':
        return this.act(call);
    }
  }

  /** Keeps what a perception gave: the Heard for later actions, the announcements for the agent. */
  private take(heard: Heard, probe: Probe): void {
    this.latest = { heard, probe };
    this.announcementQueue.push(...heard.announcements);
  }

  private async act(call: ToolCall): Promise<ToolResult> {
    const action = toListenerAction(call);
    if (!action) return { ok: false, error: `The tool ${call.name} is not an action.` };
    const { body, recorder } = this.options;

    if (!this.latest) {
      const { perception, probe } = await body.perceive();
      this.take(perception, probe);
    }
    const probe = this.latest?.probe;

    // A thought belongs to the action that follows it: take it before acting, so that it is used once, by this action.
    const thought = this.pendingThought ?? fallbackThought(action);
    this.pendingThought = null;

    const result = await body.act(action);
    recorder.add(result, thought, probe, { intentionId: AI_INTENTION_ID, recovery: false });
    this.memory.recordAction({ action: result.actionText, spoken: result.spoken });
    this.latest = null;

    const ended = await afterStep(this.options);
    if (ended) {
      await this.end(ended);
      return { ok: true, text: RUN_ENDED };
    }
    return { ok: true, text: result.spoken.trim() === '' ? 'Nothing was announced.' : result.spoken };
  }

  /** A thrown `perceive`, `act` or pipeline step ends the run with an error and tells the agent why. */
  private async fail(error: unknown): Promise<ToolResult> {
    const message = messageOf(error);
    if (!this.ended_) await this.end({ result: 'error', errorMessage: message });
    return { ok: false, error: message };
  }

  private async end(outcome: RunLoopOutcome): Promise<RunLoopOutcome> {
    if (this.ended_) return this.ended_;
    let closed: RunLoopOutcome;
    try {
      closed = await closeRun(this.options, outcome, (reason) =>
        [this.memory.giveUpThought(reason), this.giveUpNote ?? ''].join(' ').trim(),
      );
    } catch (error) {
      closed = { result: 'error', errorMessage: messageOf(error) };
    }
    this.ended_ = closed;
    this.latest = null;
    this.resolveEnded(closed);
    return closed;
  }

  /** `body.open` threw: keep a Step 1 if the caller can supply one, then end with an error. */
  private async endAfterOpenFailure(error: unknown): Promise<void> {
    const message = messageOf(error);
    let fallback: ActionResult | null = null;
    try {
      fallback = (await this.options.onOpenFailure?.(error)) ?? null;
    } catch {
      fallback = null;
    }
    if (fallback) {
      try {
        this.options.recorder.add(fallback, OPENING_THOUGHT);
        this.options.recorder.appendToLastThought(`I couldn't open the page. ${engineErrorSentence(message)}`);
      } catch {
        // Nothing was recorded; the CLI sees recorder.steps.length === 0.
      }
    }
    this.ended_ = { result: 'error', errorMessage: message };
    this.resolveEnded(this.ended_);
  }
}
