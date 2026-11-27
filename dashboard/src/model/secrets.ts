// Hides a throwaway account's password wherever a recorded run shows it (UI-05). The password is
// found in the mission goal ("... password HauntTest123!)") and replaced by dots everywhere in the
// run the dashboard keeps in memory. The run files themselves are never changed.

import type { Run } from '../data/types';

export const MASK = '••••••••';

const PASSWORD_IN_GOAL = /\bpassword\s+([^\s,;)]+)/gi;

/** The passwords a mission goal spells out, longest first so a longer one is masked whole. */
export function secretsIn(goal: string): string[] {
  const found = new Set<string>();
  for (const m of goal.matchAll(PASSWORD_IN_GOAL)) if (m[1]) found.add(m[1]);
  return [...found].sort((a, b) => b.length - a.length);
}

function maskText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join(MASK);
  return out;
}

function maskDeep<T>(value: T, secrets: readonly string[]): T {
  if (typeof value === 'string') return maskText(value, secrets) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, secrets)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskDeep(v, secrets);
    return out as T;
  }
  return value;
}

/** The run with any password named in its mission goal replaced by dots in every text field. */
export function maskRunSecrets(run: Run): Run {
  const secrets = secretsIn(run.mission.goal);
  if (secrets.length === 0) return run;
  return { ...run, mission: maskDeep(run.mission, secrets), steps: maskDeep(run.steps, secrets), findings: maskDeep(run.findings, secrets) };
}
