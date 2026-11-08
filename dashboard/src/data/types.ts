// Contract types for run files. The allowed values come from contract/run-format.md.

export const GHOST_IDS = ['listener', 'phantom', 'bebe'] as const;
export type GhostId = (typeof GHOST_IDS)[number];

export const RUN_RESULTS = ['succeeded', 'gave_up', 'error'] as const;
export type RunResult = (typeof RUN_RESULTS)[number];

export const FINDING_TYPES = [
  'unlabeled_button',
  'focus_trap',
  'unannounced_error',
  'slow_wait',
  'misclick',
  'cut_off_text',
  'untranslated',
  'dark_pattern',
] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export type RunOrigin = 'samples' | 'runs';

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
  /** null when missing or unsafe */
  screenshot: string | null;
  /** null when absent or w/h <= 0 */
  focusBox: FocusBox | null;
  waitMs: number;
}

export interface Finding {
  type: FindingType;
  step: number;
  title: string;
  evidence: string;
  screenshot: string | null;
}

export interface Mission {
  id: string;
  goal: string;
  requirement: string;
  successCheck: string;
}

export interface Site {
  name: string;
  url: string;
  commit: string;
}

/** A field path such as "steps[3].waitMs" and a plain-words problem. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface Run {
  key: string;
  folder: string;
  origin: RunOrigin;
  formatVersion: 1;
  runId: string;
  ghost: GhostId;
  mission: Mission;
  site: Site;
  /** validated as parseable ISO 8601 */
  startedAt: string;
  result: RunResult;
  /** sorted by n */
  steps: Step[];
  findings: Finding[];
  warnings: ValidationIssue[];
}

export interface InvalidRun {
  ok: false;
  key: string;
  folder: string;
  errors: ValidationIssue[];
}

export type LoadedRun = { ok: true; run: Run } | InvalidRun;

export interface RunMeta {
  key: string;
  folder: string;
  origin: RunOrigin;
}

export interface RunIndexEntry {
  /** Run_Key */
  key: string;
  /** e.g. "samples/listener-gave-up" */
  folder: string;
  origin: RunOrigin;
  /** empty when valid at collect time */
  errors: ValidationIssue[];
}

export interface RunIndex {
  formatVersion: 1;
  /** ISO timestamp */
  generatedAt: string;
  entries: RunIndexEntry[];
}
