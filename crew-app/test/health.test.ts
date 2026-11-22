import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { signCrewProxy } from '../src/backend/crewProxy.ts';
import { handleRequest, type BackendFiles } from '../src/backend/handler.ts';
import { RUNS } from './helpers.ts';

const NOW = 1_800_000_000_000;

function spy(): BackendFiles & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read(name) {
      reads.push(name);
      return Promise.resolve('{}');
    },
  };
}

const opts = (secret: string | undefined) => ({ dashboardBaseUrl: 'x', secret, nowMs: NOW, log: () => undefined });
const arbHeader = fc.oneof(fc.constant(undefined), fc.string(), fc.constant(signCrewProxy('s', String(NOW / 1000), 'GET', '/health', '')));
const arbSecret = fc.oneof(fc.constant(undefined), fc.string(), fc.constant('s'));

describe('Feature: haunt-patrol, Property 19: Health is exempt and exact, everything else stays protected', () => {
  it('answers exactly {"ok":true} on GET and HEAD /health with any header and secret, and reads no file', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('GET', 'HEAD'), arbHeader, arbSecret, async (method, header, secret) => {
        const f = spy();
        const res = await handleRequest({ method, path: '/health', body: '', crewProxyHeader: header }, f, opts(secret));
        expect(res.status).toBe(200);
        expect(res.body).toBe(method === 'HEAD' ? '' : '{"ok":true}');
        expect(f.reads).toEqual([]);
      }),
      RUNS,
    );
  });

  it('gives 405 with Allow: GET, HEAD for any other method on /health', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.constantFrom('POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'), fc.string({ minLength: 1 })), arbHeader, arbSecret, async (method, header, secret) => {
        fc.pre(method !== 'GET' && method !== 'HEAD');
        const f = spy();
        const res = await handleRequest({ method, path: '/health', body: '', crewProxyHeader: header }, f, opts(secret));
        expect(res.status).toBe(405);
        expect(res.headers.Allow).toBe('GET, HEAD');
        expect(f.reads).toEqual([]);
      }),
      RUNS,
    );
  });

  it('gives 401 for every path other than exactly /health when the header is missing or invalid', async () => {
    const paths = fc.oneof(fc.constantFrom('/health/x', '/healthz', '/health/', '/health?x', '/latest', '/summary', '/nothing'), fc.string());
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('GET', 'HEAD'), paths, fc.oneof(fc.constant(undefined), fc.string()), async (method, pathName, header) => {
        fc.pre(pathName !== '/health');
        const f = spy();
        const res = await handleRequest({ method, path: pathName, body: '', crewProxyHeader: header }, f, opts('s'));
        expect(res.status).toBe(401);
        expect(f.reads).toEqual([]);
      }),
      RUNS,
    );
  });

  it('examples: no header, invalid header, POST, and a body with no data in it', async () => {
    const get = await handleRequest({ method: 'GET', path: '/health', body: '', crewProxyHeader: undefined }, spy(), opts('s'));
    expect(get).toMatchObject({ status: 200, body: '{"ok":true}' });
    const invalid = await handleRequest({ method: 'GET', path: '/health', body: '', crewProxyHeader: 'nonsense' }, spy(), opts('s'));
    expect(invalid.body).toBe('{"ok":true}');
    const post = await handleRequest({ method: 'POST', path: '/health', body: '', crewProxyHeader: undefined }, spy(), opts('s'));
    expect(post.status).toBe(405);
    for (const word of ['record', 'summary', 'version', 'path']) expect(get.body).not.toContain(word);
    const head = await handleRequest({ method: 'HEAD', path: '/health', body: '', crewProxyHeader: undefined }, spy(), opts('s'));
    expect(head.headers).toEqual(get.headers);
  });
});
