import type { CDPSession, Page } from 'playwright';
import type { HauntConfig, SiteConfig } from '../config/loadConfig.ts';
import type { FindingType, GhostId, Step } from '../contract/types.ts';
import type { Mission } from '../missions/loadMission.ts';
import type { PatternLang } from '../missions/patterns.ts';

/*
 * Core types shared by the run loop, the recorder, the bodies, the minds and the detectors.
 * Names and shapes follow the design's "Core types".
 *
 * The boundary between a Mind and everything else is enforced here:
 *   - `Body.perceive()` returns the Perception (for the Mind) and the Probe (for the Detectors) as
 *     two separate values.
 *   - `Mind.decide()` takes only the Perception. A Mind never sees a Probe, a StepTrace, a
 *     DetectorContext or a Finding.
 *
 * Only type imports are used, so importing this file never loads Playwright.
 */

export type { FindingType, GhostId };

/** A box in CSS pixels, relative to the viewport. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What one action did, as measured by the Body. Never given to a Mind. */
export interface StepTrace {
  pathBefore: string;
  pathAfter: string;
  /** One entry per key press. */
  keys: { key: string; focusKey: string | null; dialogKey: string | null }[];
  click?: { aimed: Box; point: { x: number; y: number }; hitKey: string | null; at: number };
  /** Elements the ghost clicked or typed into. */
  touchedKeys: string[];
  /** Page clock, ms. */
  actionEndedAt: number;
  /** Page clock, ms. */
  readyAt: number;
  waits: { from: number; to: number; progress: number[]; loadingUntil: number | null }[];
  announcements: string[];
}

/** Detector-only data captured together with the Perception. */
export interface Probe {
  /** Page clock, ms. */
  at: number;
  /** Seen_Item id to the element key under its centre (visual ghosts). */
  itemKeys?: Record<string, string>;
}

/** The result of one Body action (`open` or `act`). */
export interface ActionResult {
  /** Becomes `Step.action`. */
  actionText: string;
  /** Becomes `Step.spoken`. */
  spoken: string;
  /** CSS px; converted to screenshot px by the recorder. */
  focusBox: Box | null;
  trace: StepTrace;
  /** Viewport PNG, after Settle. */
  screenshot: Buffer;
  /** Visual click steps: the Sight screenshot the click was based on. */
  seenScreenshot?: Buffer;
}

/** A recorded Step together with the data the detectors need. */
export interface RecordedStep {
  step: Step;
  trace: StepTrace;
  probe: Probe;
}

/** The browser profile values the recorder needs to convert boxes. */
export interface RecorderViewport {
  /** Viewport size in CSS px. */
  width: number;
  height: number;
  /** Device scale factor: screenshot pixels per CSS pixel. */
  deviceScaleFactor: number;
}

/** Why a Ghost stopped without succeeding. */
export type GiveUpReason = 'trapped' | 'no_match' | 'step_limit' | 'slow_wait' | 'misclicks';

/** What a Mind decides. `A` is the Ghost's action type. */
export type Decision<A> =
  | { kind: 'act'; action: A; thought: string; intentionId: string; recovery?: boolean }
  | { kind: 'give_up'; reason: 'no_match'; thought: string };

/** Network throttling, in the units of the Chrome DevTools Protocol's `Network.emulateNetworkConditions`. */
export interface NetworkThrottling {
  /** Round-trip latency added to every request, ms. */
  latencyMs: number;
  /** Bytes per second. */
  downloadBytesPerSecond: number;
  /** Bytes per second. */
  uploadBytesPerSecond: number;
}

/** How a Ghost's browser looks and behaves. */
export interface BrowserProfile extends RecorderViewport {
  locale: string;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent?: string;
  extraHTTPHeaders?: Record<string, string>;
  /** Absent means no throttling. */
  throttling?: {
    network?: NetworkThrottling;
    /** CPU slowdown factor: 4 means four times slower. */
    cpuRate?: number;
  };
}

/** What the engine gives a Body when it creates it. */
export interface BodyOptions {
  /** Seeded random numbers in [0, 1), for the visual ghosts' Reaction_Delay. */
  rng: () => number;
  site: SiteConfig;
  profile: BrowserProfile;
}

/** What the engine gives a Mind when it creates it. */
export interface MindOptions {
  /** Seeded random numbers in [0, 1). */
  rng: () => number;
  /** Languages whose patterns the Mind tries, in order of preference. */
  languages?: readonly PatternLang[];
}

/** What the Ghost's stop rule may look at after the Detectors have run. */
export interface RunState {
  steps: readonly RecordedStep[];
  /** Number of Findings recorded so far, by type. */
  findingCounts: Readonly<Partial<Record<FindingType, number>>>;
  mission: Mission;
}

/** The Body: perceives the page and performs actions in the browser. */
export interface Body<P, A> {
  open(url: string): Promise<ActionResult>;
  perceive(): Promise<{ perception: P; probe: Probe }>;
  act(action: A): Promise<ActionResult>;
}

/** The Mind: decides the next action from a Perception, and nothing else. */
export interface Mind<P, A> {
  decide(perception: P): Decision<A>;
  /** Built from the Mind's own memory. */
  giveUpThought(reason: GiveUpReason): string;
}

/** A problem found by a Detector. The engine assigns the Finding's step from `stepN`. */
export interface DetectedProblem {
  /** Identifies the distinct problem, for de-duplication. */
  key: string;
  /** Must be a Step already recorded; checked by the engine. */
  stepN: number;
  title: string;
  evidence: string;
  /** `shots/NNN.png` or `shots/NNN-seen.png` of `stepN`. */
  screenshot: 'step' | 'seen';
}

/** The CDP methods a Detector may call. Every one only reads. */
export type ReadOnlyCdpMethod = 'Accessibility.getFullAXTree' | 'DOM.describeNode' | 'DOM.getBoxModel';

/** A CDP session that only allows read-only methods. */
export interface ReadOnlyCdp {
  send<T = unknown>(method: ReadOnlyCdpMethod, params?: Record<string, unknown>): Promise<T>;
}

export interface DetectorContext {
  /** Read-only page evaluation. */
  inspect<T>(script: string, arg?: unknown): Promise<T>;
  cdp: ReadOnlyCdp;
  /** Includes each Step's trace and probe. */
  steps: readonly RecordedStep[];
  current: RecordedStep;
  config: HauntConfig;
  site: SiteConfig;
}

export interface Detector {
  type: FindingType;
  /** Runs after every Step. Returns new problems; the engine assigns step numbers. */
  observe(ctx: DetectorContext): Promise<DetectedProblem[]>;
  /** Runs once when the Run ends, for problems that are only known at the end. */
  finish?(ctx: DetectorContext): Promise<DetectedProblem[]>;
}

export interface Ghost<P, A> {
  id: GhostId;
  /** Viewport, scale, locale, mobile, throttling. */
  profile: BrowserProfile;
  createBody(page: Page, cdp: CDPSession, opts: BodyOptions): Body<P, A>;
  createMind(mission: Mission, opts: MindOptions): Mind<P, A>;
  detectors(): Detector[];
  /** Checked after the Detectors, before the next decision. */
  stopRule(state: RunState): GiveUpReason | null;
}
