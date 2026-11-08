import { describe, expect, it, vi } from 'vitest';
import { createStaticRunSource } from '../data/staticSource';
import { resolveScreenshotUrl } from '../data/screenshots';
import type { RunIndex } from '../data/types';
import { listenerRun, listenerSample } from './fixtures/samples';

const index: RunIndex = {
  formatVersion: 1,
  generatedAt: '2026-11-08T00:00:00Z',
  entries: [
    { key: '2026-11-03-listener-pay-bill', folder: 'samples/listener-gave-up', origin: 'samples', errors: [] },
    { key: 'missing', folder: 'samples/missing', origin: 'samples', errors: [] },
    { key: 'garbled', folder: 'samples/garbled', origin: 'samples', errors: [] },
    {
      key: 'dup',
      folder: 'dup',
      origin: 'runs',
      errors: [{ path: 'runId', message: 'duplicate runId' }],
    },
  ],
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function makeFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (overrides[u]) return overrides[u]!();
    if (u === './runs/index.json') return json(index);
    if (u === './runs/samples/listener-gave-up/run.json') return json(listenerSample());
    if (u === './runs/samples/garbled/run.json') return new Response('{ nope', { status: 200 });
    return new Response('not found', { status: 404 });
  });
}

describe('StaticRunSource', () => {
  it('fetches the index relative to BASE_URL and caches it', async () => {
    const fetchImpl = makeFetch();
    const source = createStaticRunSource({ base: './', fetchImpl });
    const [a, b] = await Promise.all([source.listRuns(), source.listRuns()]);
    expect(a).toBe(b);
    expect(a.entries).toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('./runs/index.json');
  });

  it('loads and validates a run once per page load', async () => {
    const fetchImpl = makeFetch();
    const source = createStaticRunSource({ base: './', fetchImpl });
    const entry = index.entries[0]!;
    const first = await source.loadRun(entry);
    const second = await source.loadRun(entry);
    expect(first).toBe(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.run.steps).toHaveLength(9);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('turns a 404 into an Invalid_Run', async () => {
    const source = createStaticRunSource({ base: './', fetchImpl: makeFetch() });
    const loaded = await source.loadRun(index.entries[1]!);
    expect(loaded).toEqual({
      ok: false,
      key: 'missing',
      folder: 'samples/missing',
      errors: [{ path: '(file)', message: 'Could not read run.json (HTTP 404)' }],
    });
  });

  it('turns bad JSON into an Invalid_Run', async () => {
    const source = createStaticRunSource({ base: './', fetchImpl: makeFetch() });
    const loaded = await source.loadRun(index.entries[2]!);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.errors[0]!.message).toBe('run.json is not valid JSON');
  });

  it('turns a network failure into an Invalid_Run', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const source = createStaticRunSource({ base: './', fetchImpl });
    const loaded = await source.loadRun(index.entries[0]!);
    expect(loaded.ok).toBe(false);
  });

  it('returns collect-time errors without fetching', async () => {
    const fetchImpl = makeFetch();
    const source = createStaticRunSource({ base: './', fetchImpl });
    const loaded = await source.loadRun(index.entries[3]!);
    expect(loaded).toEqual({ ok: false, key: 'dup', folder: 'dup', errors: [{ path: 'runId', message: 'duplicate runId' }] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects when the index is missing', async () => {
    const source = createStaticRunSource({
      base: '/',
      fetchImpl: makeFetch({ '/runs/index.json': () => new Response('', { status: 404 }) }),
    });
    await expect(source.listRuns()).rejects.toThrow('Could not read runs/index.json (HTTP 404)');
  });

  it('rejects when the index is not valid JSON or the wrong shape', async () => {
    const bad = createStaticRunSource({
      base: './',
      fetchImpl: makeFetch({ './runs/index.json': () => new Response('<html>', { status: 200 }) }),
    });
    await expect(bad.listRuns()).rejects.toThrow('runs/index.json is not valid JSON');
    const shape = createStaticRunSource({
      base: './',
      fetchImpl: makeFetch({ './runs/index.json': () => json({ entries: 'nope' }) }),
    });
    await expect(shape.listRuns()).rejects.toThrow('runs/index.json is not in the expected shape');
  });

  it('resolves screenshot URLs inside the run folder only', () => {
    const source = createStaticRunSource({ base: './', fetchImpl: makeFetch() });
    const run = listenerRun();
    expect(source.screenshotUrl(run, 'shots/009.png')).toBe('./runs/samples/listener-gave-up/shots/009.png');
    expect(source.screenshotUrl(run, '../x.png')).toBeNull();
    expect(source.screenshotUrl(run, 'https://evil.example/x.png')).toBeNull();
    expect(resolveScreenshotUrl('/', 'a b', 'shots/1 2.png')).toBe('/runs/a%20b/shots/1%202.png');
  });
});
