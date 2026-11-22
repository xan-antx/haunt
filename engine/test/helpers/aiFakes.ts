import type { DetectorFailure } from '../../src/core/detectors.ts';
import { Recorder } from '../../src/core/recorder.ts';
import type { RunLoopDetectors } from '../../src/core/runLoop.ts';
import type { ActionResult, Body, FindingType, GiveUpReason, Probe, RecordedStep, RunState } from '../../src/core/types.ts';
import type { Heard } from '../../src/ghosts/listener/ax.ts';
import type { ListenerAction } from '../../src/ghosts/listener/body.ts';
import { AiRunDriver } from '../../src/mind/ai/driver.ts';
import type { AiRunDriverOptions } from '../../src/mind/ai/driver.ts';
import type { Mission } from '../../src/missions/loadMission.ts';
import { heard } from './heard.ts';

/*
 * Test support for the AI mind: a fake Body, fake detectors and a driver built from them.
 * Nothing here starts a browser or Kiro.
 */

export const mission: Mission = {
  id: 'pay-bill',
  site: 'lantern-bills',
  goal: 'Pay the bill',
  requirement: 'a requirement',
  successCheck: { text: 'Confirmation is visible', visible: '[data-haunt="payment-success"]' },
  intentions: [],
};

export function actionResult(actionText: string, spoken = `spoken: ${actionText}`): ActionResult {
  return {
    actionText,
    spoken,
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: { pathBefore: '/', pathAfter: '/', keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
  };
}

/** The action text the fake Body reports. Typed text is left out on purpose, so findings cannot depend on it. */
export function actionText(action: ListenerAction): string {
  switch (action.type) {
    case 'key':
      return `Press ${action.key}`;
    case 'type':
      return 'Type text';
    case 'jump':
      return `Jump ${action.dir} ${action.to}`;
  }
}

export interface FakeBodyOptions {
  /** Announcements of each perception, in order. The last list repeats. */
  announcements?: string[][];
  /** Throws this from `perceive` when set. */
  perceiveError?: () => Error | null;
  /** Throws this from `act` when set. */
  actError?: () => Error | null;
}

export class FakeBody implements Body<Heard, ListenerAction> {
  opened: string[] = [];
  acts: ListenerAction[] = [];
  perceives = 0;
  private readonly options: FakeBodyOptions;

  constructor(options: FakeBodyOptions = {}) {
    this.options = options;
  }

  async open(url: string): Promise<ActionResult> {
    this.opened.push(url);
    return actionResult(`Open ${url}`);
  }

  async perceive(): Promise<{ perception: Heard; probe: Probe }> {
    const error = this.options.perceiveError?.();
    if (error) throw error;
    const lists = this.options.announcements ?? [];
    const announcements = lists[Math.min(this.perceives, lists.length - 1)] ?? [];
    this.perceives += 1;
    const perception = heard([{ ref: 'ax-1', role: 'button', name: `Button ${this.perceives}` }], { announcements });
    return { perception, probe: { at: 1000 + this.perceives } };
  }

  async act(action: ListenerAction): Promise<ActionResult> {
    const error = this.options.actError?.();
    if (error) throw error;
    this.acts.push(action);
    return actionResult(actionText(action));
  }
}

function failure(thought: string): DetectorFailure {
  return { detector: 'unlabeled_button', message: thought, thought };
}

export interface FakeDetectorOptions {
  /** Fails `observe` for the Step with this number. */
  failAt?: number;
  /** A finding is recorded for every Step whose action text matches. */
  findWhen?: (step: RecordedStep) => boolean;
  /** Makes `finish()` fail. */
  failFinish?: boolean;
}

export class FakeDetectors implements RunLoopDetectors {
  readonly findings: { stepN: number; key: string }[] = [];
  readonly observed: number[] = [];
  finished = 0;
  private readonly options: FakeDetectorOptions;

  constructor(options: FakeDetectorOptions = {}) {
    this.options = options;
  }

  async observe(step: RecordedStep): Promise<DetectorFailure | null> {
    this.observed.push(step.step.n);
    if (this.options.failAt === step.step.n) return failure(`detector failed at ${step.step.n}`);
    if (this.options.findWhen?.(step)) this.findings.push({ stepN: step.step.n, key: step.step.action });
    return null;
  }

  async finish(): Promise<DetectorFailure | null> {
    this.finished += 1;
    return this.options.failFinish ? failure('finish failed') : null;
  }

  get findingCounts(): Readonly<Partial<Record<FindingType, number>>> {
    return { unlabeled_button: this.findings.length } as Partial<Record<FindingType, number>>;
  }
}

export interface DriverHarnessOptions {
  body?: FakeBody;
  detectors?: FakeDetectors;
  /** Success on the n-th call of the success check (1-based). */
  successAtCall?: number;
  /** The stop rule fires when this many Steps exist. */
  stopAtSteps?: number;
  stopReason?: GiveUpReason;
  maxSteps?: number;
}

export interface DriverHarness {
  driver: AiRunDriver;
  body: FakeBody;
  detectors: FakeDetectors;
  recorder: Recorder;
}

export function makeDriver(options: DriverHarnessOptions = {}): DriverHarness {
  const body = options.body ?? new FakeBody();
  const detectors = options.detectors ?? new FakeDetectors();
  const recorder = new Recorder({ width: 100, height: 100, deviceScaleFactor: 1 });
  let successCalls = 0;
  const driverOptions: AiRunDriverOptions = {
    body,
    url: 'http://127.0.0.1:5173/',
    mission,
    detectors,
    recorder,
    stopRule: (state: RunState) =>
      options.stopAtSteps !== undefined && state.steps.length >= options.stopAtSteps ? (options.stopReason ?? 'trapped') : null,
    checkSuccess: async () => {
      successCalls += 1;
      return options.successAtCall !== undefined && successCalls >= options.successAtCall;
    },
    ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
  };
  return { driver: new AiRunDriver(driverOptions), body, detectors, recorder };
}
