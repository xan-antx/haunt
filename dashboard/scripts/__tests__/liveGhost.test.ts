import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  LiveGhost,
  SUMMON_HEADER,
  SUMMON_PATH,
  createSummonMiddleware,
  isLocalRequest,
  parseStep,
  type LiveGhostDeps,
  type LiveStatus,
} from '../liveGhost';

describe('isLocalRequest', () => {
  const ok = { remoteAddress: '127.0.0.1', host: 'localhost:3001', origin: undefined };

  it('accepts loopback addresses with a local host name', () => {
    expect(isLocalRequest(ok)).toBe(true);
    expect(isLocalRequest({ ...ok, remoteAddress: '::1', host: '[::1]:3001' })).toBe(true);
    expect(isLocalRequest({ ...ok, remoteAddress: '::ffff:127.0.0.1', host: '127.0.0.1:3001' })).toBe(true);
  });

  it('refuses other computers', () => {
    expect(isLocalRequest({ ...ok, remoteAddress: '192.168.1.20' })).toBe(false);
    expect(isLocalRequest({ ...ok, remoteAddress: undefined })).toBe(false);
  });

  it('refuses a host name that is not local, such as a rebound DNS name', () => {
    expect(isLocalRequest({ ...ok, host: 'evil.example:3001' })).toBe(false);
    expect(isLocalRequest({ ...ok, host: undefined })).toBe(false);
  });

  it('accepts this page as the origin and refuses any other page', () => {
    expect(isLocalRequest({ ...ok, origin: 'http://localhost:3001' })).toBe(true);
    expect(isLocalRequest({ ...ok, origin: 'https://evil.example' })).toBe(false);
    expect(isLocalRequest({ ...ok, origin: 'http://localhost:9999' })).toBe(false);
    expect(isLocalRequest({ ...ok, origin: 'not a url' })).toBe(false);
  });
});

describe('parseStep', () => {
  it('reads the engine progress line', () => {
    expect(parseStep('Step 4: Press Tab')).toBe(4);
    expect(parseStep('  Step 12: Click "Pay"')).toBe(12);
    expect(parseStep('Run id: 2026-11-10T1822Z-listener-pay-bill')).toBeNull();
  });
});

function fakeDeps(overrides: Partial<LiveGhostDeps> = {}) {
  const stop = vi.fn(async () => undefined);
  const deps: LiveGhostDeps = {
    probeSite: vi.fn(async () => 'none' as const),
    startSite: vi.fn(async () => ({ stop })),
    runGhost: vi.fn(async (onLine: (line: string) => void) => {
      onLine('Step 2: Press Tab');
      return { code: 0, runJsonPath: '/repo/runs/lantern-bills/x/run.json', tail: '' };
    }),
    collect: vi.fn(() => 'x'),
    ...overrides,
  };
  return { deps, stop };
}

async function finished(ghost: LiveGhost): Promise<LiveStatus> {
  await vi.waitFor(() => expect(ghost.getStatus().state).not.toBe('running'));
  return ghost.getStatus();
}

describe('LiveGhost', () => {
  it('starts the site, runs the ghost, collects the run and stops the site it started', async () => {
    const { deps, stop } = fakeDeps();
    const ghost = new LiveGhost(deps);
    expect(ghost.start()).toBe(true);
    expect(ghost.getStatus().state).toBe('running');
    const status = await finished(ghost);
    expect(status).toMatchObject({ state: 'done', runKey: 'x' });
    expect(deps.startSite).toHaveBeenCalledTimes(1);
    expect(deps.collect).toHaveBeenCalledWith('/repo/runs/lantern-bills/x/run.json');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('uses Lantern Bills when it is already running and leaves it running', async () => {
    const { deps, stop } = fakeDeps({ probeSite: vi.fn(async () => 'lantern' as const) });
    const ghost = new LiveGhost(deps);
    ghost.start();
    expect((await finished(ghost)).state).toBe('done');
    expect(deps.startSite).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('refuses to run when something else is on port 3000', async () => {
    const { deps } = fakeDeps({ probeSite: vi.fn(async () => 'other' as const) });
    const ghost = new LiveGhost(deps);
    ghost.start();
    const status = await finished(ghost);
    expect(status.state).toBe('failed');
    expect(status.message).toMatch(/other than Lantern Bills/);
    expect(deps.startSite).not.toHaveBeenCalled();
    expect(deps.runGhost).not.toHaveBeenCalled();
  });

  it('reports the step while the ghost walks', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { deps } = fakeDeps({
      runGhost: vi.fn(async (onLine: (line: string) => void) => {
        onLine('Step 5: Press Enter');
        await gate;
        return { code: 0, runJsonPath: '/repo/runs/a/run.json', tail: '' };
      }),
    });
    const ghost = new LiveGhost(deps);
    ghost.start();
    await vi.waitFor(() => expect(ghost.getStatus().step).toBe(5));
    expect(ghost.getStatus().message).toBe('The Listener is at step 5.');
    expect(ghost.start()).toBe(false);
    release();
    await finished(ghost);
  });

  it('stops the site it started even when the ghost fails', async () => {
    const { deps, stop } = fakeDeps({
      runGhost: vi.fn(async () => ({ code: 1, runJsonPath: null, tail: 'The page did not open.' })),
    });
    const ghost = new LiveGhost(deps);
    ghost.start();
    const status = await finished(ghost);
    expect(status.state).toBe('failed');
    expect(status.message).toContain('The page did not open.');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(deps.collect).not.toHaveBeenCalled();
  });

  it('stops the site when the ghost throws, and can run again afterwards', async () => {
    const { deps, stop } = fakeDeps({
      runGhost: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const ghost = new LiveGhost(deps);
    ghost.start();
    expect((await finished(ghost)).message).toBe('boom');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(ghost.start()).toBe(true);
    await finished(ghost);
  });

  it('keeps a run that ended with an error result (exit code 3)', async () => {
    const { deps } = fakeDeps({
      runGhost: vi.fn(async () => ({ code: 3, runJsonPath: '/repo/runs/a/run.json', tail: '' })),
    });
    const ghost = new LiveGhost(deps);
    ghost.start();
    expect((await finished(ghost)).state).toBe('done');
  });
});

function fakeRequest(options: { method: string; remote?: string; host?: string; origin?: string; header?: boolean; url?: string }) {
  const headers: Record<string, string> = { host: options.host ?? 'localhost:3001' };
  if (options.origin) headers.origin = options.origin;
  if (options.header) headers[SUMMON_HEADER] = '1';
  return {
    method: options.method,
    url: options.url ?? SUMMON_PATH,
    headers,
    socket: { remoteAddress: options.remote ?? '127.0.0.1' },
  } as unknown as IncomingMessage;
}

function fakeResponse() {
  const out = { code: 0, body: '' };
  const res = {
    statusCode: 0,
    setHeader: () => undefined,
    end(this: { statusCode: number }, text: string) {
      out.code = this.statusCode;
      out.body = text;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

describe('summon middleware', () => {
  function setup() {
    const { deps } = fakeDeps();
    const ghost = new LiveGhost(deps);
    return { ghost, middleware: createSummonMiddleware(ghost), deps };
  }

  it('passes other paths on', () => {
    const { middleware } = setup();
    const next = vi.fn();
    middleware(fakeRequest({ method: 'GET', url: '/index.html' }), fakeResponse().res, next);
    expect(next).toHaveBeenCalled();
  });

  it('refuses a request from another computer, even with the header', () => {
    const { middleware, deps } = setup();
    const { res, out } = fakeResponse();
    middleware(fakeRequest({ method: 'POST', remote: '10.0.0.5', header: true }), res, vi.fn());
    expect(out.code).toBe(403);
    expect(deps.probeSite).not.toHaveBeenCalled();
  });

  it('refuses a request from another site', () => {
    const { middleware, deps } = setup();
    const { res, out } = fakeResponse();
    middleware(fakeRequest({ method: 'POST', origin: 'https://evil.example', header: true }), res, vi.fn());
    expect(out.code).toBe(403);
    expect(deps.probeSite).not.toHaveBeenCalled();
  });

  it('refuses a POST without the summon header', () => {
    const { middleware, deps } = setup();
    const { res, out } = fakeResponse();
    middleware(fakeRequest({ method: 'POST' }), res, vi.fn());
    expect(out.code).toBe(400);
    expect(deps.probeSite).not.toHaveBeenCalled();
  });

  it('starts a job on POST, answers 409 while it runs, and reports status on GET', async () => {
    const { middleware, ghost } = setup();
    const first = fakeResponse();
    middleware(fakeRequest({ method: 'POST', header: true, origin: 'http://localhost:3001' }), first.res, vi.fn());
    expect(first.out.code).toBe(202);
    const second = fakeResponse();
    middleware(fakeRequest({ method: 'POST', header: true }), second.res, vi.fn());
    expect(second.out.code).toBe(409);
    const status = fakeResponse();
    middleware(fakeRequest({ method: 'GET' }), status.res, vi.fn());
    expect(status.out.code).toBe(200);
    expect(JSON.parse(status.out.body)).toHaveProperty('state');
    await finished(ghost);
  });

  it('refuses other methods', () => {
    const { middleware } = setup();
    const { res, out } = fakeResponse();
    middleware(fakeRequest({ method: 'DELETE' }), res, vi.fn());
    expect(out.code).toBe(405);
  });
});
