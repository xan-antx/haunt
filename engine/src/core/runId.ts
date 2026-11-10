import { existsSync } from 'node:fs';
import path from 'node:path';

/** Tells whether a folder named `name` already exists under `<Out_Root>/<Site_Key>/`. */
export type RunFolderExists = (name: string) => boolean;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * The Run_Id without any uniqueness suffix: `YYYY-MM-DDTHHmmZ-<ghost>-<mission>`,
 * built from the UTC start time (seconds are dropped).
 */
export function formatRunId(startedAt: Date, ghost: string, mission: string): string {
  if (Number.isNaN(startedAt.getTime())) {
    throw new RangeError('Cannot build a Run_Id from an invalid start time.');
  }
  const date = `${pad(startedAt.getUTCFullYear(), 4)}-${pad(startedAt.getUTCMonth() + 1, 2)}-${pad(startedAt.getUTCDate(), 2)}`;
  const time = `${pad(startedAt.getUTCHours(), 2)}${pad(startedAt.getUTCMinutes(), 2)}`;
  return `${date}T${time}Z-${ghost}-${mission}`;
}

/**
 * Returns the Run_Id, adding the first free suffix `-2`, `-3`, ... when a folder
 * with that name already exists. `exists` is injectable so tests need no disk.
 */
export function makeRunId(
  startedAt: Date,
  ghost: string,
  mission: string,
  exists: RunFolderExists,
): string {
  const base = formatRunId(startedAt, ghost, mission);
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}

/** An existence check that looks in `<Out_Root>/<Site_Key>/` on disk. */
export function folderExistsIn(siteFolder: string): RunFolderExists {
  return (name) => existsSync(path.join(siteFolder, name));
}
