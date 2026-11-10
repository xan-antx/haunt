// Failure paths of the Lantern_Bills_Harness (haunt-engine spec, Requirements 12.5, 12.6, 12.10).
// Port 3000 is shared with the smoke test and the end-to-end tests. vitest.e2e.config.ts runs test files one after
// the other (fileParallelism: false), so the tests in this file can use it without clashing.

import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  LANTERN_BILLS_BUILD_DIR,
  LANTERN_BILLS_PORT,
  LanternBillsError,
  checkDemoSiteInstalled,
  startLanternBills,
} from './lanternBills.ts';

const PORT = LANTERN_BILLS_PORT;

function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value: boolean): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function expectPortFree(): Promise<void> {
  expect(await isListening('127.0.0.1', PORT), '127.0.0.1 is free').toBe(false);
  expect(await isListening('::1', PORT), '::1 is free').toBe(false);
}

/** Starts a dummy HTTP server. Resolves undefined when the address cannot be bound (for example no IPv6). */
function listenDummy(host: string): Promise<Server | undefined> {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`dummy server on ${host}`);
    });
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT') resolve(undefined);
      else reject(error);
    });
    server.listen(PORT, host, () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Modification times of the build folder and its index.html, or null for what does not exist. */
async function buildSnapshot(): Promise<{ dir: number | null; index: number | null }> {
  const mtime = async (target: string): Promise<number | null> => {
    try {
      return (await stat(target)).mtimeMs;
    } catch {
      return null;
    }
  };
  return {
    dir: await mtime(LANTERN_BILLS_BUILD_DIR),
    index: await mtime(path.join(LANTERN_BILLS_BUILD_DIR, 'index.html')),
  };
}

beforeAll(async () => {
  // These tests need port 3000 to themselves. Fail clearly when something else is running.
  const busy = (await isListening('127.0.0.1', PORT)) || (await isListening('::1', PORT));
  if (busy) throw new Error(`Port ${PORT} is already in use before the harness tests start. Stop the other server.`);
});

describe('Lantern_Bills_Harness: port 3000 is already in use (12.5)', () => {
  const dummies: Server[] = [];

  afterEach(async () => {
    await Promise.all(dummies.splice(0).map(closeServer));
  });

  for (const [label, host, urlHost] of [
    ['IPv4 (127.0.0.1)', '127.0.0.1', '127.0.0.1'],
    ['IPv6 (::1)', '::1', '[::1]'],
  ] as const) {
    it(`fails with the port message and leaves the other server alone: dummy server on ${label}`, async (ctx) => {
      const dummy = await listenDummy(host);
      if (!dummy) return ctx.skip();
      dummies.push(dummy);
      const before = await buildSnapshot();

      const error = await startLanternBills({ startTimeoutMs: 1_000 }).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(LanternBillsError);
      const message = (error as LanternBillsError).message;
      expect(message).toContain('Port 3000');
      expect(message).toMatch(/stop the other server/i);

      // The dummy server still serves, and it is still the only thing on the port.
      const response = await fetch(`http://${urlHost}:${PORT}/`);
      expect(await response.text()).toBe(`dummy server on ${host}`);

      // Failing early: no build was made (the build folder is exactly as before) and nothing else listens.
      expect(await buildSnapshot()).toEqual(before);
      const otherHost = host === '::1' ? '127.0.0.1' : '::1';
      const otherAnswers = await isListening(otherHost, PORT);
      // On Windows and Linux a v4-only or v6-only dummy leaves the other loopback free; Vite would have taken it.
      expect(otherAnswers).toBe(false);
    });
  }
});

describe('Lantern_Bills_Harness: the server is stopped (12.6)', () => {
  it('stops the server after a failing test, and stop() twice is fine', async () => {
    const bills = await startLanternBills();
    let failure: unknown;
    try {
      expect(await isListening('127.0.0.1', PORT) || (await isListening('::1', PORT)), 'server is up').toBe(true);
      // A failing assertion in the middle of a test, as the end-to-end tests may have.
      expect('the page works').toBe('the page is broken');
    } catch (error) {
      failure = error;
    } finally {
      await bills.stop();
    }
    expect(failure, 'the simulated test failure happened').toBeDefined();

    await bills.stop();
    await expectPortFree();
    await expect(fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
    await bills.assertDemoSiteUnchanged();
  });

  it('leaves nothing behind when the server does not answer 200 in time', async () => {
    const error = await startLanternBills({ startTimeoutMs: 1 }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LanternBillsError);
    expect((error as LanternBillsError).message).toMatch(/did not answer with HTTP 200/);
    await expectPortFree();
  });

  it('leaves nothing behind when the build takes too long', async () => {
    const error = await startLanternBills({ buildTimeoutMs: 1 }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LanternBillsError);
    expect((error as LanternBillsError).message).toMatch(/took longer than/);
    await expectPortFree();
  });
});

describe('Lantern_Bills_Harness: dependencies are not installed (12.10)', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('asks for npm install in demo-site/ and installs nothing when node_modules is missing', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'haunt-no-node-modules-'));

    expect(() => checkDemoSiteInstalled(tempDir!)).toThrow(LanternBillsError);
    expect(() => checkDemoSiteInstalled(tempDir!)).toThrow(/npm install/);
    expect(() => checkDemoSiteInstalled(tempDir!)).toThrow(/demo-site\//);

    const error = await startLanternBills({ demoSiteDir: tempDir }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LanternBillsError);
    expect((error as LanternBillsError).message).toMatch(/npm install in demo-site\//);

    expect(await readdir(tempDir), 'nothing was created or installed').toEqual([]);
    await expectPortFree();
  });

  it('also fails when node_modules exists but Vite is not in it, and accepts a folder where Vite is installed', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'haunt-no-vite-'));
    await mkdir(path.join(tempDir, 'node_modules'));
    expect(() => checkDemoSiteInstalled(tempDir!)).toThrow(/npm install/);
    expect(await readdir(path.join(tempDir, 'node_modules'))).toEqual([]);

    await mkdir(path.join(tempDir, 'node_modules', 'vite', 'bin'), { recursive: true });
    await writeFile(path.join(tempDir, 'node_modules', 'vite', 'bin', 'vite.js'), '');
    expect(() => checkDemoSiteInstalled(tempDir!)).not.toThrow();
  });
});
