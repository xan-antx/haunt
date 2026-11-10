import type { SiteConfig } from '../config/loadConfig.ts';
import { validate } from '../contract/invariants.ts';
import type { ScreenshotSize } from '../contract/invariants.ts';
import type { Finding, FindingType, GhostId, Problem, Run, RunResult } from '../contract/types.ts';
import type { Mission } from '../missions/loadMission.ts';
import { shotPath } from './recorder.ts';
import type { Recorder } from './recorder.ts';

/**
 * A problem found by a Detector, with its Finding type. The engine has already
 * checked (or will check, here) that `stepN` is a recorded Step.
 */
export interface FindingInput {
  type: FindingType;
  stepN: number;
  title: string;
  evidence: string;
  /** `step`: `shots/NNN.png` of the Step. `seen`: `shots/NNN-seen.png` of the Step. */
  screenshot: 'step' | 'seen';
}

export interface FinalizeInput {
  runId: string;
  ghost: GhostId;
  mission: Pick<Mission, 'id' | 'goal' | 'requirement' | 'successCheck'>;
  /** The Haunt_Config entry of the Site_Key. */
  site: Pick<SiteConfig, 'name'>;
  /** The `--url` value as the user gave it. */
  url: string;
  /** Output of `git rev-parse --short HEAD`, or `unknown`. */
  commit: string;
  /** The Run's start time. Milliseconds are dropped. */
  startedAt: Date;
  result: RunResult;
  recorder: Recorder;
  findings: readonly FindingInput[];
  /** Viewport size times device scale factor. */
  screenshotSize: ScreenshotSize;
}

export interface FinalizeResult {
  run: Run;
  /** Screenshots to write, keyed by run-relative name such as `shots/001.png`. */
  files: Map<string, Buffer>;
  /** Schema and invariant problems. When this is not empty, nothing may be written. */
  problems: Problem[];
}

/**
 * `YYYY-MM-DDTHH:mm:ssZ` in UTC, whole seconds. Throws on an invalid date.
 */
export function formatStartedAt(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Cannot format an invalid start time.');
  }
  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * The `--url` value as parsed by the WHATWG URL parser, without the slash after the host
 * when the path is `/`. Throws a TypeError when the value is not a URL.
 */
export function normalizeSiteUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.pathname === '/') {
    return `${parsed.protocol}//${parsed.host}${parsed.search}${parsed.hash}`;
  }
  return parsed.href;
}

/** `shots/NNN(-seen).png` for a Finding, or `''` when the Step number cannot be used in a file name. */
function findingShotPath(input: FindingInput): string {
  try {
    return shotPath(input.stepN, input.screenshot);
  } catch {
    return '';
  }
}

/**
 * Builds the run JSON from the Run's data and validates it against the Run_Schema and the
 * Run_Invariants. Writes nothing. The caller must not write the Run when `problems` is not empty.
 */
export function finalizeRun(input: FinalizeInput): FinalizeResult {
  const { recorder } = input;
  const own: Problem[] = [];

  const findings: Finding[] = input.findings.map((f, i) => {
    const screenshot = findingShotPath(f);
    if (f.screenshot === 'seen' && screenshot !== '' && !recorder.hasSeenScreenshot(f.stepN)) {
      own.push({
        path: `findings[${i}].screenshot`,
        message: `refers to ${JSON.stringify(screenshot)}, but Step ${f.stepN} has no seen screenshot`,
      });
    }
    return { type: f.type, step: f.stepN, title: f.title, evidence: f.evidence, screenshot };
  });

  const referencedSeen = findings.map((f) => f.screenshot).filter((name) => /^shots\/\d{3}-seen\.png$/.test(name));
  const files = recorder.filesToWrite(referencedSeen);

  const run: Run = {
    formatVersion: 1,
    runId: input.runId,
    ghost: input.ghost,
    mission: {
      id: input.mission.id,
      goal: input.mission.goal,
      requirement: input.mission.requirement,
      successCheck: input.mission.successCheck.text,
    },
    site: {
      name: input.site.name,
      url: normalizeSiteUrl(input.url),
      commit: input.commit,
    },
    startedAt: formatStartedAt(input.startedAt),
    result: input.result,
    steps: recorder.toSteps(),
    findings,
  };

  // Keep one message per path: ours is clearer than the generic invariant message.
  const ownPaths = new Set(own.map((p) => p.path));
  const validation = validate(run, files.keys(), { screenshotSize: input.screenshotSize }).filter(
    (p) => !ownPaths.has(p.path),
  );

  return { run, files, problems: [...own, ...validation] };
}
