// Collect_Step library: copies every run folder from runs/ into public/runs/ and writes index.json.
// It only reads from runs/. It never writes there.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { validateRun } from '../src/data/validate';
import type { RunIndex, RunIndexEntry, RunOrigin, ValidationIssue } from '../src/data/types';

export interface CollectOptions {
  /** The repository's runs/ folder (source, read only). */
  runsDir: string;
  /** dashboard/public/runs (output, deleted and re-created). */
  outDir: string;
  log?: (line: string) => void;
  now?: () => Date;
}

/** Finds every run.json under `dir`, as folder paths relative to `dir` using "/". Sorted. */
export function findRunFolders(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'run.json') {
        found.push(relative(dir, current).split(sep).join('/'));
      }
    }
  };
  walk(dir);
  return found.sort();
}

/** Folder path with "/" replaced by "--". Used when a file has no usable runId. */
export function folderKey(folder: string): string {
  return folder === '' ? 'runs-root' : folder.split('/').join('--');
}

function originOf(folder: string): RunOrigin {
  return folder === 'samples' || folder.startsWith('samples/') ? 'samples' : 'runs';
}

export function collectRuns(options: CollectOptions): RunIndex {
  const { runsDir, outDir } = options;
  const log = options.log ?? ((line: string) => console.warn(line));
  const now = options.now ?? (() => new Date());

  // Throws when runs/ itself is unreadable; the CLI turns that into a non-zero exit.
  const folders = findRunFolders(runsDir);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const entries: RunIndexEntry[] = [];
  const firstByRunId = new Map<string, string>();
  const usedKeys = new Set<string>();

  for (const folder of folders) {
    const source = join(runsDir, ...folder.split('/').filter(Boolean));
    const target = join(outDir, ...folder.split('/').filter(Boolean));
    cpSync(source, target, { recursive: true });

    const origin = originOf(folder);
    let errors: ValidationIssue[] = [];
    let parsed: unknown;
    let parsedOk = false;
    try {
      parsed = JSON.parse(readFileSync(join(source, 'run.json'), 'utf8'));
      parsedOk = true;
    } catch (err) {
      errors = [{ path: '(file)', message: `is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }];
    }

    const runId =
      parsedOk && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).runId
        : undefined;
    let key = typeof runId === 'string' && runId.trim() !== '' ? runId : folderKey(folder);

    if (parsedOk) {
      const loaded = validateRun(parsed, { key, folder, origin });
      if (!loaded.ok) errors = loaded.errors;
    }

    if (typeof runId === 'string' && runId.trim() !== '') {
      const first = firstByRunId.get(runId);
      if (first !== undefined) {
        errors = [...errors, { path: 'runId', message: `duplicate runId: "${runId}" is already used by ${first}/run.json` }];
        key = folderKey(folder);
      } else {
        firstByRunId.set(runId, folder);
      }
    }
    // Keep keys unique even in odd cases, such as a runId that equals another folder key.
    let unique = key;
    for (let i = 2; usedKeys.has(unique); i++) unique = `${key}-${i}`;
    usedKeys.add(unique);

    entries.push({ key: unique, folder, origin, errors });
    if (errors.length > 0) {
      log(`Haunt: restless file runs/${folder}/run.json`);
      for (const e of errors) log(`  ${e.path}: ${e.message}`);
    }
  }

  const index: RunIndex = { formatVersion: 1, generatedAt: now().toISOString(), entries };
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}
