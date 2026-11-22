import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBridge } from '../src/mind/ai/bridge.ts';
import type { Bridge } from '../src/mind/ai/bridge.ts';
import type { ToolCall, ToolResult } from '../src/mind/ai/tools.ts';

/**
 * Feature: listener-ai-mind, Property 5: The Bridge accepts only the right token
 * **Validates: Requirements 1.10**
 */
const RUNS = { numRuns: 100 };
const TOKEN = 'the-right-token-0123456789abcdef';

const calls: ToolCall[] = [];
let bridge: Bridge;

beforeAll(async () => {
  bridge = await startBridge(
    {
      handle: async (call): Promise<ToolResult> => {
        calls.push(call);
        return { ok: true, text: 'fine' };
      },
    },
    { token: TOKEN },
  );
});

afterAll(async () => {
  await bridge.close();
});

async function post(headers: Record<string, string>): Promise<number> {
  const response = await fetch(`${bridge.url}/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'read_page', args: {} }),
  });
  await response.arrayBuffer();
  return response.status;
}

describe('Feature: listener-ai-mind, Property 5: The Bridge accepts only the right token', () => {
  it('listens on 127.0.0.1', () => {
    expect(bridge.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('rejects any other token with 401 and never calls the driver', async () => {
    // Header values must be visible ASCII for fetch to send them.
    const wrong = fc.stringMatching(/^[A-Za-z0-9._~+/=-]{0,40}$/).filter((s) => s !== TOKEN);
    await fc.assert(
      fc.asyncProperty(wrong, async (token) => {
        const before = calls.length;
        expect(await post({ authorization: `Bearer ${token}` })).toBe(401);
        expect(calls.length).toBe(before);
      }),
      RUNS,
    );
  });

  it('rejects a missing header and a non-Bearer header with 401', async () => {
    const before = calls.length;
    expect(await post({})).toBe(401);
    expect(await post({ authorization: TOKEN })).toBe(401);
    expect(await post({ authorization: `Basic ${TOKEN}` })).toBe(401);
    expect(calls.length).toBe(before);
  });

  it('accepts the right token', async () => {
    const before = calls.length;
    expect(await post({ authorization: `Bearer ${TOKEN}` })).toBe(200);
    expect(calls.length).toBe(before + 1);
  });
});
