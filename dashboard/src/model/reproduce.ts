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
    // The engine's npm script, run in engine/. Never `npx haunt`: an unrelated npm package has that name.
    `cd engine && npm run haunt -- run --ghost ${q(run.ghost)} --mission ${q(run.mission.id)} --url ${q(run.site.url)}` +
    // An AI run is only reproduced by the AI mind (UI-13).
    (run.mind === 'ai' ? ' --mind ai' : '') +
    // A fixed-copy run is only paired with the original when its recorded site name ends in " (exorcised)",
    // so the command must pass that name on (DOC-15).
    (run.site.name.endsWith(' (exorcised)') ? ` --site-name ${q(run.site.name)}` : '')
  );
}
