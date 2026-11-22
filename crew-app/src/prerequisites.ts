import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Probe {
  nodeVersion(): string; // e.g. "v24.1.0"
  dirExists(p: string): boolean; // for node_modules folders
  chromiumInstalled(): Promise<boolean>;
}
export interface Missing {
  item: string;
  fix: string;
}

/** Reports every missing prerequisite, in a fixed order. Installs nothing. */
export async function checkPrerequisites(repoRoot: string, probe: Probe): Promise<Missing[]> {
  const missing: Missing[] = [];
  const major = Number(/^v?(\d+)/.exec(probe.nodeVersion())?.[1] ?? '0');
  if (major < 24) {
    missing.push({ item: 'Node.js 24 or later', fix: 'Install Node.js 24 or later from https://nodejs.org' });
  }
  for (const folder of ['engine', 'demo-site', 'crew-app']) {
    if (!probe.dirExists(path.join(repoRoot, folder, 'node_modules'))) {
      missing.push({ item: `${folder}/node_modules`, fix: `npm install in ${folder}/` });
    }
  }
  if (!(await probe.chromiumInstalled())) {
    missing.push({ item: 'Playwright Chromium', fix: 'npx playwright install chromium in engine/' });
  }
  return missing;
}

const CHROMIUM_SCRIPT =
  "import { chromium } from 'playwright'; import { existsSync } from 'node:fs'; process.exit(existsSync(chromium.executablePath()) ? 0 : 1);";

/** The real probe. The Chromium check runs in engine/, so it matches the engine's own check. */
export function createRealProbe(repoRoot: string): Probe {
  return {
    nodeVersion: () => process.version,
    dirExists: (p) => existsSync(p),
    chromiumInstalled: () =>
      new Promise<boolean>((resolve) => {
        execFile(
          process.execPath,
          ['--input-type=module', '-e', CHROMIUM_SCRIPT],
          { cwd: path.join(repoRoot, 'engine'), windowsHide: true, timeout: 30_000 },
          (error) => resolve(error === null),
        );
      }),
  };
}
