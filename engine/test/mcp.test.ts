import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createHauntMcpServer, main, readBridgeEndpoint } from '../src/mcp/server.ts';
import { startBridge } from '../src/mind/ai/bridge.ts';
import type { Bridge } from '../src/mind/ai/bridge.ts';
import type { ToolCall, ToolResult } from '../src/mind/ai/tools.ts';

/**
 * Unit tests for haunt-mcp, with a fake Bridge behind a real loopback server and an in-memory MCP transport.
 * **Validates: Requirements 1.2, 1.11, 4.3**
 */

const TOKEN = 'mcp-test-token';
const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
});

async function connect(token = TOKEN, reply: (call: ToolCall) => ToolResult = (call) => ({ ok: true, text: `did ${call.name}` })) {
  const calls: ToolCall[] = [];
  const bridge: Bridge = await startBridge(
    {
      handle: async (call) => {
        calls.push(call);
        return reply(call);
      },
    },
    { token: TOKEN },
  );
  const server = createHauntMcpServer({ url: bridge.url, token });
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  cleanups.push(async () => {
    await client.close();
    await bridge.close();
  });
  return { client, calls };
}

describe('haunt-mcp tools', () => {
  it('lists exactly the seven tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['finish', 'jump', 'press_key', 'read_announcements', 'read_page', 'think', 'type_text'],
    );
  });

  it('has no tool that mentions findings', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(`${tool.name} ${tool.description ?? ''}`).not.toMatch(/finding/i);
    }
  });

  it('shows the allowed keys, targets and directions in the input schemas', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, JSON.stringify(t.inputSchema)]));
    expect(byName.get('press_key')).toContain('Shift+Tab');
    expect(byName.get('jump')).toContain('landmark');
    expect(byName.get('jump')).toContain('previous');
  });

  it('forwards a call to the Bridge with the token and returns the result as content', async () => {
    const { client, calls } = await connect();
    const result = await client.callTool({ name: 'press_key', arguments: { key: 'Tab' } });
    expect(calls).toEqual([{ name: 'press_key', key: 'Tab' }]);
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: 'did press_key' }]);
  });

  it('forwards the calls that take no arguments', async () => {
    const { client, calls } = await connect();
    await client.callTool({ name: 'read_page', arguments: {} });
    await client.callTool({ name: 'finish', arguments: {} });
    expect(calls).toEqual([{ name: 'read_page' }, { name: 'finish' }]);
  });

  it('returns a Bridge error as a tool error', async () => {
    const { client } = await connect(TOKEN, () => ({ ok: false, error: 'The run has ended. Stop now.' }));
    const result = await client.callTool({ name: 'read_page', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'The run has ended. Stop now.' }]);
  });

  it('returns a tool error when the token is wrong', async () => {
    const { client, calls } = await connect('wrong-token');
    const result = await client.callTool({ name: 'read_page', arguments: {} });
    expect(result.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it('returns a tool error when the Bridge is not reachable', async () => {
    const server = createHauntMcpServer({ url: 'http://127.0.0.1:1', token: TOKEN });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    cleanups.push(() => client.close());
    const result = await client.callTool({ name: 'read_page', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

describe('haunt-mcp environment', () => {
  it('names each missing variable', () => {
    const none = readBridgeEndpoint({});
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.message).toContain('HAUNT_BRIDGE_URL');
      expect(none.message).toContain('HAUNT_BRIDGE_TOKEN');
    }
    const noToken = readBridgeEndpoint({ HAUNT_BRIDGE_URL: 'http://127.0.0.1:1' });
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) {
      expect(noToken.message).toContain('HAUNT_BRIDGE_TOKEN');
      expect(noToken.message).not.toContain('HAUNT_BRIDGE_URL');
    }
    expect(readBridgeEndpoint({ HAUNT_BRIDGE_URL: 'http://127.0.0.1:1', HAUNT_BRIDGE_TOKEN: 't' }).ok).toBe(true);
  });

  it('main writes the message to stderr and returns 1 without starting', async () => {
    const written: string[] = [];
    const code = await main({}, (text) => written.push(text));
    expect(code).toBe(1);
    expect(written.join('')).toContain('HAUNT_BRIDGE_URL');
  });

  it('the launcher exits non-zero with the message on stderr when the variables are missing', () => {
    const env = { ...process.env };
    delete env.HAUNT_BRIDGE_URL;
    delete env.HAUNT_BRIDGE_TOKEN;
    const run = spawnSync(process.execPath, [path.join(ENGINE_ROOT, 'bin', 'haunt-mcp.mjs')], {
      env,
      encoding: 'utf8',
      timeout: 30_000,
      input: '',
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('HAUNT_BRIDGE_URL');
  });
});
