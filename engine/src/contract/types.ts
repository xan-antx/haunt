/** Types for a Haunt run file. They follow contract/run-format.md and contract/run.schema.json. */

export type GhostId = 'listener' | 'phantom' | 'bebe';

export type FindingType =
  | 'unlabeled_button'
  | 'focus_trap'
  | 'unannounced_error'
  | 'slow_wait'
  | 'misclick'
  | 'cut_off_text'
  | 'untranslated'
  | 'dark_pattern';

export type RunResult = 'succeeded' | 'gave_up' | 'error';

/** Bounding box of the focused element, in screenshot pixels. */
export interface FocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Step {
  n: number;
  page: string;
  action: string;
  spoken: string;
  thought: string;
  screenshot: string;
  focusBox?: FocusBox;
  waitMs: number;
}

export interface Finding {
  type: FindingType;
  step: number;
  title: string;
  evidence: string;
  screenshot: string;
}

export interface RunMission {
  id: string;
  goal: string;
  requirement: string;
  successCheck: string;
}

export interface RunSite {
  name: string;
  url: string;
  commit: string;
}

export interface Run {
  formatVersion: 1;
  runId: string;
  ghost: GhostId;
  mission: RunMission;
  site: RunSite;
  startedAt: string;
  result: RunResult;
  steps: Step[];
  findings: Finding[];
}

/** One problem found while validating a run. `path` is a JSON path such as `steps[3].n`. */
export interface Problem {
  path: string;
  message: string;
}
