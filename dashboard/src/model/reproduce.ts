// The only place the Reproduce_Command template lives.
// Change it here when the engine's command line is final.

import type { Run } from '../data/types';

const SAFE = /^[A-Za-z0-9._:/-]+$/;

/** Single-quotes a value for a POSIX shell when it contains anything outside [A-Za-z0-9._:/-]. */
export function shellQuote(value: string): string {
  if (SAFE.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function reproduceCommand(run: Run): string {
  const q = shellQuote;
  return (
    `git checkout ${q(run.site.commit)} && ` +
    `npx haunt run --ghost ${q(run.ghost)} --mission ${q(run.mission.id)} --url ${q(run.site.url)}`
  );
}
