import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, startBridge } from '../src/mind/ai/bridge.ts';
import type { Bridge } from '../src/mind/ai/bridge.ts';
import type { ToolCall, ToolResult } from '../src/mind/ai/tools.ts';

/**
 * Unit tests for the Bridge, with a fake driver.
 * **Validates: Requirements 1.10**
 */

const TOKEN = 'unit-test-token';
const open: Bridge[] = [];

async function start() {
  const calls: ToolCall[] = [];
  const bridge = await startBridge(
    {
      handle: async (call): Promise<ToolResult> => {
        calls.push(call);
        return { ok: true, text: `did ${call.name}` };
      },
    },
    { token: TOKEN },
  );
  open.push(bridge);
  return { bridge, calls };
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((b) => b.close()));
});

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

describe('Bridge', () => {
  it('passes a call with the right token to the driver and returns its result', async () => {
    const { bridge, calls } = await start();
    const response = await fetch(`${bridge.url}/tool`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'press_key', args: { key: 'Tab' } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, text: 'did press_key' });
    expect(calls).toEqual([{ name: 'press_key', key: 'Tab' }]);
  });

  it('makes a random token when none is given, 32 bytes as hex', async () => {
    const bridge = await startBridge({ handle: async () => ({ ok: true, text: '' }) });
    open.push(bridge);
    expect(bridge.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a missing header and a wrong token with 401 and does not call the driver', async () => {
    const { bridge, calls } = await start();
    const body = JSON.stringify({ name: 'read_page' });
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', body })).status).toBe(401);
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', body, headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', body, headers: { authorization: `Bearer ${TOKEN}x` } })).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('answers 404 to other paths and methods and does not call the driver', async () => {
    const { bridge, calls } = await start();
    const body = JSON.stringify({ name: 'read_page' });
    expect((await fetch(`${bridge.url}/other`, { method: 'POST', headers: auth, body })).status).toBe(404);
    expect((await fetch(`${bridge.url}/tool`, { method: 'GET', headers: auth })).status).toBe(404);
    expect((await fetch(`${bridge.url}/tool`, { method: 'PUT', headers: auth, body })).status).toBe(404);
    expect((await fetch(`${bridge.url}/`, { headers: auth })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('refuses a tool call that does not validate, with the bad value in the error', async () => {
    const { bridge, calls } = await start();
    const response = await fetch(`${bridge.url}/tool`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'press_key', args: { key: 'F13' } }),
    });
    expect(response.status).toBe(400);
    const result = (await response.json()) as ToolResult;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('F13');
    expect(calls).toEqual([]);
  });

  it('refuses a body that is not JSON or has no tool name', async () => {
    const { bridge, calls } = await start();
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', headers: auth, body: 'not json' })).status).toBe(400);
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', headers: auth, body: '[]' })).status).toBe(400);
    expect((await fetch(`${bridge.url}/tool`, { method: 'POST', headers: auth, body: '{"args":{}}' })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('refuses a body larger than 64 KB', async () => {
    const { bridge, calls } = await start();
    const body = JSON.stringify({ name: 'think', args: { text: 'x'.repeat(MAX_BODY_BYTES + 10) } });
    const response = await fetch(`${bridge.url}/tool`, { method: 'POST', headers: auth, body });
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it('frees the port on close()', async () => {
    const bridge = await startBridge({ handle: async () => ({ ok: true, text: '' }) }, { token: TOKEN });
    const port = Number(new URL(bridge.url).port);
    await bridge.close();
    await new Promise<void>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
    });
    await expect(fetch(`${bridge.url}/tool`, { method: 'POST', headers: auth, body: '{}' })).rejects.toThrow();
  });
});
