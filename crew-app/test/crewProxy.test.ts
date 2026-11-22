import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { signCrewProxy, verifyCrewProxy } from '../src/backend/crewProxy.ts';
import { CREW_PROXY } from '../src/backend/crewProxyConfig.ts';
import { handleRequest, type BackendFiles } from '../src/backend/handler.ts';
import { RUNS } from './helpers.ts';

const NOW = 1_800_000_000_000;
const ts = String(NOW / 1000);

function spyFiles(): BackendFiles & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read(name) {
      reads.push(name);
      return Promise.resolve(null);
    },
  };
}

const arbSecret = fc.string({ minLength: 1 });
const arbPath = fc.oneof(fc.constantFrom('/latest', '/summary', '/x'), fc.string());
const arbBody = fc.string();

describe('Feature: haunt-patrol, Property 16: Crew proxy verifier', () => {
  it('accepts a header signed over the same inputs within the tolerance', () => {
    fc.assert(
      fc.property(arbSecret, fc.constantFrom('GET', 'HEAD', 'get'), arbPath, arbBody, fc.integer({ min: -300, max: 300 }), (secret, method, path, body, skew) => {
        const stamp = String(NOW / 1000 + skew);
        const header = signCrewProxy(secret, stamp, method, path, body);
        expect(verifyCrewProxy({ header, secret, nowMs: NOW, method, path, body })).toEqual({ ok: true });
      }),
      RUNS,
    );
  });

  it('rejects a changed secret, method, path, body or signature, a stale timestamp, and bad headers', () => {
    fc.assert(
      fc.property(arbSecret, arbPath, arbBody, fc.integer({ min: 301, max: 100_000 }), (secret, path, body, skew) => {
        const header = signCrewProxy(secret, ts, 'GET', path, body);
        const base = { header, secret, nowMs: NOW, method: 'GET', path, body };
        expect(verifyCrewProxy(base).ok).toBe(true);
        expect(verifyCrewProxy({ ...base, secret: `${secret}x` }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, method: 'HEAD' }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, path: `${path}/` }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, body: `${body}x` }).ok).toBe(false);
        const [t, sig] = header.split(':') as [string, string];
        const flipped = `${t}:${sig.startsWith('0') ? '1' : '0'}${sig.slice(1)}`;
        expect(verifyCrewProxy({ ...base, header: flipped }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, nowMs: NOW + skew * 1000 })).toEqual({ ok: false, reason: 'stale' });
        expect(verifyCrewProxy({ ...base, nowMs: NOW - skew * 1000 })).toEqual({ ok: false, reason: 'stale' });
        expect(verifyCrewProxy({ ...base, header: undefined }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, header: '' }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, header: `${t}-${sig}` }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, secret: undefined }).ok).toBe(false);
        expect(verifyCrewProxy({ ...base, secret: '' }).ok).toBe(false);
      }),
      RUNS,
    );
  });

  it('returns 401 and reads no file for any rejected request on a path other than /health', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'HEAD'),
        arbPath.filter((p) => p !== '/health'),
        fc.oneof(fc.constant(undefined), fc.string(), fc.constantFrom('1:' + 'a'.repeat(64), `${ts}:${'0'.repeat(64)}`)),
        async (method, path, header) => {
          const files = spyFiles();
          const res = await handleRequest({ method, path, body: '', crewProxyHeader: header }, files, { dashboardBaseUrl: 'x', secret: 'secret', nowMs: NOW, log: () => undefined });
          expect(res.status).toBe(401);
          expect(files.reads).toEqual([]);
        },
      ),
      RUNS,
    );
  });

  it('documents the header name and secret variable in the one config file', () => {
    expect(CREW_PROXY.headerName).toBe('x-crew-proxy');
    expect(CREW_PROXY.secretEnvVar).toBe('HAUNT_CREW_PROXY_SECRET');
    expect(CREW_PROXY.toleranceSeconds).toBe(300);
    expect(CREW_PROXY.signedString('1', 'get', '/p?q=1', 'b')).toBe('1.GET./p?q=1.b');
  });

  // UNVERIFIED example (design risk 8). Re-check against the Crew docs or a real gateway request.
  it('verifies one fixed example', () => {
    const header = signCrewProxy('s3cret', '1800000000', 'GET', '/latest', '');
    expect(header).toMatch(/^1800000000:[0-9a-f]{64}$/);
    expect(verifyCrewProxy({ header, secret: 's3cret', nowMs: 1_800_000_100_000, method: 'GET', path: '/latest', body: '' })).toEqual({ ok: true });
  });
});
