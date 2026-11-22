import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const made: string[] = [];

/** A temporary repository root that is removed after each test. */
export async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haunt-patrol-'));
  made.push(dir);
  return dir;
}

afterEach(async () => {
  while (made.length > 0) {
    const dir = made.pop() as string;
    await rm(dir, { recursive: true, force: true });
  }
});
