import type { CDPSession, Page } from 'playwright';
import type { HauntConfig, SiteConfig } from '../config/loadConfig.ts';
import type { FindingInput } from './finalize.ts';
import type {
  DetectedProblem,
  Detector,
  DetectorContext,
  FindingType,
  ReadOnlyCdp,
  ReadOnlyCdpMethod,
  RecordedStep,
} from './types.ts';

/*
 * The detector framework (Requirement 7).
 *
 *   - Every Detector of the Ghost runs after every Step, one after the other in the order the
 *     Ghost lists them, so the same page state and Step history give the same Findings.
 *   - A distinct problem is recorded once per Run: Findings are de-duplicated by (type, key).
 *   - A problem whose `stepN` is not a recorded Step is an engine error, not a Finding.
 *   - A Detector that throws, or reports such a problem, stops detection and is reported as a
 *     DetectorFailure. The run loop ends the Run with result `error` and appends
 *     `failure.thought` to the last Step's thought.
 *   - Detectors only read. They get `inspect` and a read-only CDP wrapper, never the Page.
 */

/** The only CDP methods a Detector may call. Each one only reads. */
export const READ_ONLY_CDP_METHODS: ReadonlySet<string> = new Set<ReadOnlyCdpMethod>([
  'Accessibility.getFullAXTree',
  'DOM.describeNode',
  'DOM.getBoxModel',
]);

/** A Detector stopped the Run: it threw, or it reported a problem for a Step that was never recorded. */
export interface DetectorFailure {
  /** The Detector's Finding type, for example `focus_trap`. */
  detector: FindingType;
  /** The error's message. */
  message: string;
  /** Goes at the end of the last Step's thought: `<detector> failed: <message>`. */
  thought: string;
}

/** The part of a Page that `inspect` needs. */
export type InspectablePage = Pick<Page, 'evaluate'>;

/** The part of a CDPSession that the read-only wrapper forwards to. */
export type CdpSender = Pick<CDPSession, 'send'>;

/**
 * Wraps a CDP session so that only the read-only methods in READ_ONLY_CDP_METHODS go through.
 * Any other method throws before anything reaches the browser. The check also runs at run time,
 * so a Detector that casts around the type still cannot change the page.
 */
export function createReadOnlyCdp(session: CdpSender): ReadOnlyCdp {
  const raw = session as unknown as { send(method: string, params?: object): Promise<unknown> };
  return {
    async send<T = unknown>(method: ReadOnlyCdpMethod, params?: Record<string, unknown>): Promise<T> {
      if (!READ_ONLY_CDP_METHODS.has(method)) {
        throw new Error(`CDP method "${String(method)}" is not allowed in a Detector: only read-only methods are.`);
      }
      return (await raw.send(method, params)) as T;
    },
  };
}

/**
 * Builds `DetectorContext.inspect`.
 *
 * `script` is the source of a function expression, for example `(sel) => document.querySelectorAll(sel).length`.
 * It is called in the page with `arg` (which must be JSON-serialisable) and its result, or the
 * resolved value of the promise it returns, is returned.
 *
 * Scripts MUST be pure reads: no clicks, key presses, focus(), scrolling, value changes, DOM
 * changes or timers. The engine cannot check this, so it is a rule for Detector authors and reviewers.
 *
 * The source is evaluated as a string expression through CDP `Runtime.evaluate`, which the
 * page's Content-Security-Policy does not restrict, so `unsafe-eval` is not needed.
 */
export function createInspect(page: InspectablePage): DetectorContext['inspect'] {
  return async <T>(script: string, arg?: unknown): Promise<T> => {
    const argSource = arg === undefined ? 'undefined' : JSON.stringify(arg);
    return (await page.evaluate(`(${script})(${argSource})`)) as T;
  };
}

export interface DetectorRunnerOptions {
  /** The Ghost's Detectors, in the order they run. */
  detectors: readonly Detector[];
  page: InspectablePage;
  cdp: CdpSender;
  config: HauntConfig;
  site: SiteConfig;
  /** The Recorder (or anything with its `steps`). Read each time a Detector runs. */
  recorder: { readonly steps: readonly RecordedStep[] };
}

/** Runs a Ghost's Detectors and keeps the Findings they produce. */
export class DetectorRunner {
  private readonly detectors: readonly Detector[];
  private readonly recorder: DetectorRunnerOptions['recorder'];
  private readonly config: HauntConfig;
  private readonly site: SiteConfig;
  private readonly inspect: DetectorContext['inspect'];
  private readonly cdp: ReadOnlyCdp;
  private readonly seen = new Set<string>();
  private readonly found: FindingInput[] = [];
  private readonly counts: Partial<Record<FindingType, number>> = {};

  constructor(options: DetectorRunnerOptions) {
    this.detectors = [...options.detectors];
    this.recorder = options.recorder;
    this.config = options.config;
    this.site = options.site;
    this.inspect = createInspect(options.page);
    this.cdp = createReadOnlyCdp(options.cdp);
  }

  /** Every Finding so far, in the order it was found. */
  get findings(): readonly FindingInput[] {
    return this.found;
  }

  /** Number of Findings so far, by type. Types with no Finding are absent. For `RunState.findingCounts`. */
  get findingCounts(): Readonly<Partial<Record<FindingType, number>>> {
    return { ...this.counts };
  }

  /**
   * Runs every Detector's `observe` after `afterStep` (the Step just recorded).
   * Returns `null` when all of them ran, or the first failure, after which the
   * remaining Detectors are not run.
   */
  async observe(afterStep: RecordedStep): Promise<DetectorFailure | null> {
    return this.runAll(afterStep, (detector, ctx) => detector.observe(ctx));
  }

  /**
   * Runs every Detector's `finish`, if it has one, once the Run has ended. Returns the first failure or `null`.
   * Does nothing when no Step was recorded.
   */
  async finish(): Promise<DetectorFailure | null> {
    const last = this.recorder.steps[this.recorder.steps.length - 1];
    if (!last) return null;
    return this.runAll(last, (detector, ctx) => detector.finish?.(ctx) ?? Promise.resolve([]));
  }

  private async runAll(
    current: RecordedStep,
    call: (detector: Detector, ctx: DetectorContext) => Promise<DetectedProblem[]>,
  ): Promise<DetectorFailure | null> {
    for (const detector of this.detectors) {
      try {
        const ctx: DetectorContext = {
          inspect: this.inspect,
          cdp: this.cdp,
          steps: this.recorder.steps,
          current,
          config: this.config,
          site: this.site,
        };
        const problems = await call(detector, ctx);
        this.accept(detector.type, problems);
      } catch (error) {
        return failure(detector.type, error);
      }
    }
    return null;
  }

  /** Checks every problem first, then records the new ones. Throws on a problem for an unrecorded Step. */
  private accept(type: FindingType, problems: readonly DetectedProblem[]): void {
    const recorded = this.recorder.steps.length;
    for (const problem of problems) {
      if (!Number.isInteger(problem.stepN) || problem.stepN < 1 || problem.stepN > recorded) {
        throw new Error(
          `reported a problem ("${problem.key}") for Step ${String(problem.stepN)}, but only Steps 1 to ${recorded} are recorded`,
        );
      }
    }
    for (const problem of problems) {
      const id = JSON.stringify([type, problem.key]);
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      this.found.push({
        type,
        stepN: problem.stepN,
        title: problem.title,
        evidence: problem.evidence,
        screenshot: problem.screenshot,
      });
      this.counts[type] = (this.counts[type] ?? 0) + 1;
    }
  }
}

function failure(detector: FindingType, error: unknown): DetectorFailure {
  const message = error instanceof Error ? error.message : String(error);
  return { detector, message, thought: `${detector} failed: ${message}` };
}
