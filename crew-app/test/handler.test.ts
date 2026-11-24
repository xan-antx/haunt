import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { signCrewProxy } from '../src/backend/crewProxy.ts';
import { handleRequest, latestBody, summaryBody, type BackendFiles } from '../src/backend/handler.ts';
import { serializeRecord } from '../src/record.ts';
import { createPatrolStore } from '../src/store.ts';
import { RUNS, arbRecord, record } from './helpers.ts';
import { tempRoot } from './tmp.ts';

const NOW = 1_800_000_000_000;
const SECRET = 'a-test-secret';
const noLog = (): void => undefined;

function files(contents: Partial<Record<'latest.json' | 'summary.md', string>>): BackendFiles & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read(name) {
      reads.push(name);
      return Promise.resolve(contents[name] ?? null);
    },
  };
}

function signed(method: string, pathName: string): { method: string; path: string; body: string; crewProxyHeader: string } {
  return { method, path: pathName, body: '', crewProxyHeader: signCrewProxy(SECRET, String(NOW / 1000), method, pathName, '') };
}

const options = (dashboardBaseUrl: string) => ({ dashboardBaseUrl, secret: SECRET, nowMs: NOW, log: noLog });

describe('Feature: haunt-patrol, Property 15: Backend serves only GET and HEAD, only fixed files', () => {
  it('gives 405 with Allow for every other method on every path, even with a valid header', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((m) => m !== 'GET' && m !== 'HEAD'),
        fc.oneof(fc.constantFrom('/health', '/api/latest', '/api/summary'), fc.string()),
        async (method, pathName) => {
          const f = files({});
          const res = await handleRequest(signed(method, pathName), f, options('x'));
          expect(res.status).toBe(405);
          expect(res.headers.Allow).toBe('GET, HEAD');
          expect(f.reads).toEqual([]);
        },
      ),
      RUNS,
    );
  });

  it('reads only the two fixed names, and returns 404 for any other path', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('GET', 'HEAD'), fc.oneof(fc.string(), fc.constantFrom('../latest.json', '/..%2f..%2fsecret', '/api/latest/', '//api/latest', '/latest', '/summary', '/api/latest?x=1', 'C:\\x', '/API/LATEST')), async (method, pathName) => {
        fc.pre(pathName !== '/api/latest' && pathName !== '/api/summary' && pathName !== '/health');
        const f = files({ 'latest.json': 'x', 'summary.md': 'y' });
        const res = await handleRequest(signed(method, pathName), f, options('x'));
        expect(res.status).toBe(404);
        expect(f.reads).toEqual([]);
      }),
      RUNS,
    );
  });

  it('/api/latest returns { record, dashboardBaseUrl } with the option value, and /api/summary returns { summary }', async () => {
    await fc.assert(
      fc.asyncProperty(arbRecord, fc.webUrl(), fc.string(), async (r, base, summary) => {
        const f = files({ 'latest.json': serializeRecord(r), 'summary.md': summary });
        const latest = await handleRequest(signed('GET', '/api/latest'), f, options(base));
        expect(latest.status).toBe(200);
        expect(JSON.parse(latest.body)).toEqual(latestBody(r, base));
        const sum = await handleRequest(signed('GET', '/api/summary'), f, options(base));
        expect(JSON.parse(sum.body)).toEqual(summaryBody(summary));
        expect(f.reads).toEqual(['latest.json', 'summary.md']);
      }),
      RUNS,
    );
  });

  it('HEAD returns the status and headers with an empty body', async () => {
    const f = files({ 'latest.json': serializeRecord(record('2026-11-03')) });
    const get = await handleRequest(signed('GET', '/api/latest'), f, options('x'));
    const head = await handleRequest(signed('HEAD', '/api/latest'), f, options('x'));
    expect(head.status).toBe(get.status);
    expect(head.headers).toEqual(get.headers);
    expect(head.body).toBe('');
  });

  it('answers 404 no_patrol when a file is missing, and 500 naming latest.json when it is not a valid record', async () => {
    const empty = await handleRequest(signed('GET', '/api/latest'), files({}), options('x'));
    expect(empty.status).toBe(404);
    expect(JSON.parse(empty.body)).toEqual({ error: 'no_patrol' });
    expect((await handleRequest(signed('GET', '/api/summary'), files({}), options('x'))).status).toBe(404);
    const bad = await handleRequest(signed('GET', '/api/latest'), files({ 'latest.json': '{"nope":1}' }), options('x'));
    expect(bad.status).toBe(500);
    expect(JSON.parse(bad.body)).toEqual({ error: 'unreadable', file: 'latest.json' });
  });

  it('the /api/latest body equals the static body written by exportStatic', async () => {
    const root = await tempRoot();
    const r = record('2026-11-03');
    const store = createPatrolStore(path.join(root, 'crew-app'));
    await store.writeRecord(r);
    await store.exportStatic(r, 'sum', 'http://localhost:3001');
    const stored = await readFile(path.join(root, 'crew-app', 'data', 'patrols', 'latest.json'), 'utf8');
    const res = await handleRequest(signed('GET', '/api/latest'), files({ 'latest.json': stored }), options('http://localhost:3001'));
    const staticBody = await readFile(path.join(root, 'crew-app', 'ui', 'dist', 'data', 'latest.json'), 'utf8');
    expect(JSON.parse(res.body)).toEqual(JSON.parse(staticBody));
  });
});
