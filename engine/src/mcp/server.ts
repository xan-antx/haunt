import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { JUMP_DIRS, JUMP_TARGETS, LISTENER_KEYS, MAX_THINK_TEXT, MAX_TYPE_TEXT, TOOL_NAMES } from '../mind/ai/tools.ts';
import type { ToolResult } from '../mind/ai/tools.ts';

/*
 * haunt-mcp (design: "haunt-mcp").
 *
 * A stdio MCP server that Kiro starts. It has the seven tools of `tools.ts` and nothing else: no tool
 * reads or writes Findings. Every call is forwarded to the Bridge over HTTP on 127.0.0.1 with the
 * bearer token, and the Bridge's answer goes back to the agent as MCP content.
 */

export const BRIDGE_URL_VAR = 'HAUNT_BRIDGE_URL';
export const BRIDGE_TOKEN_VAR = 'HAUNT_BRIDGE_TOKEN';

export interface BridgeEndpoint {
  url: string;
  token: string;
}

/** Reads the Bridge address and token from the environment, or says which variables are missing. */
export function readBridgeEndpoint(env: NodeJS.ProcessEnv): { ok: true; endpoint: BridgeEndpoint } | { ok: false; message: string } {
  const url = env[BRIDGE_URL_VAR]?.trim() ?? '';
  const token = env[BRIDGE_TOKEN_VAR]?.trim() ?? '';
  const missing = [url === '' ? BRIDGE_URL_VAR : null, token === '' ? BRIDGE_TOKEN_VAR : null].filter((name) => name !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `haunt-mcp cannot start: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set. The haunt command sets them when it runs "--mind ai".`,
    };
  }
  return { ok: true, endpoint: { url, token } };
}

type Fetch = typeof fetch;

/** Sends one call to the Bridge. Every failure becomes a tool error with a plain message. */
export async function callBridge(endpoint: BridgeEndpoint, name: string, args: unknown, fetchImpl: Fetch = fetch): Promise<ToolResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${endpoint.url}/tool`, {
      method: 'POST',
      headers: { authorization: `Bearer ${endpoint.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, args }),
    });
  } catch (error) {
    return { ok: false, error: `The Haunt engine could not be reached: ${error instanceof Error ? error.message : String(error)}` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: `The Haunt engine sent an answer that could not be read (HTTP ${response.status}).` };
  }
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { ok?: unknown; text?: unknown; error?: unknown };
    if (body.ok === true && typeof body.text === 'string') return { ok: true, text: body.text };
    if (typeof body.error === 'string') return { ok: false, error: body.error };
  }
  return { ok: false, error: `The Haunt engine sent an unexpected answer (HTTP ${response.status}).` };
}

function asContent(result: ToolResult): { content: { type: 'text'; text: string }[]; isError?: true } {
  return result.ok
    ? { content: [{ type: 'text', text: result.text }] }
    : { content: [{ type: 'text', text: result.error }], isError: true };
}

/** Builds the server with its seven tools. `fetchImpl` is injectable for tests. */
export function createHauntMcpServer(endpoint: BridgeEndpoint, fetchImpl: Fetch = fetch): McpServer {
  const server = new McpServer({ name: 'haunt-mcp', version: '1.0.0' });
  // Calls go to the Bridge one at a time, in the order they reached this server. An agent may send a
  // `think` and the action that follows it together; concurrent requests could reach the Bridge in the
  // other order and put the thought on the wrong step.
  let queue: Promise<unknown> = Promise.resolve();
  const forward = (name: string) => (args: unknown) => {
    const result = queue.then(() => callBridge(endpoint, name, args, fetchImpl));
    queue = result.catch(() => undefined);
    return result.then(asContent);
  };

  server.registerTool(
    'read_page',
    { description: 'Read the page the way a screen reader presents it: title, path, focus, dialog, region and every node with its ref, role, name and state. Call it before you act.' },
    forward('read_page'),
  );
  server.registerTool(
    'read_announcements',
    { description: 'Hear what the page announced since you last asked, such as live-region messages and alerts. Each announcement is given once.' },
    forward('read_announcements'),
  );
  server.registerTool(
    'press_key',
    {
      description: 'Press one key on the keyboard and hear the result.',
      inputSchema: { key: z.enum(LISTENER_KEYS).describe('The key to press.') },
    },
    forward('press_key'),
  );
  server.registerTool(
    'type_text',
    {
      description: 'Type text into the focused field and hear the result.',
      inputSchema: { text: z.string().max(MAX_TYPE_TEXT * 2).describe(`The text to type, at most ${MAX_TYPE_TEXT} characters.`) },
    },
    forward('type_text'),
  );
  server.registerTool(
    'jump',
    {
      description: 'Jump to the next or previous heading, landmark, field or button, as a screen reader does, and hear the result.',
      inputSchema: {
        to: z.enum(JUMP_TARGETS).describe('What to jump to.'),
        dir: z.enum(JUMP_DIRS).describe('The direction.'),
      },
    },
    forward('jump'),
  );
  server.registerTool(
    'think',
    {
      description:
        'Call this right before each action (press_key, type_text or jump) and say in one plain sentence what that action is and why. It is kept with the action that comes next, so describe the action you are about to take, not the one you just took.',
      inputSchema: { text: z.string().max(MAX_THINK_TEXT * 2).describe(`One plain sentence, at most ${MAX_THINK_TEXT} characters.`) },
    },
    forward('think'),
  );
  server.registerTool(
    'finish',
    { description: 'Stop the run. Use it only when you cannot go on.' },
    forward('finish'),
  );

  return server;
}

/** The tool names this server registers, for tests. */
export const SERVER_TOOL_NAMES: readonly string[] = TOOL_NAMES;

/**
 * Starts haunt-mcp on stdio. When a variable is missing it writes the reason to stderr and returns
 * the exit code 1 without starting.
 */
export async function main(env: NodeJS.ProcessEnv = process.env, stderr: (text: string) => void = (t) => void process.stderr.write(t)): Promise<number> {
  const read = readBridgeEndpoint(env);
  if (!read.ok) {
    stderr(`${read.message}\n`);
    return 1;
  }
  const server = createHauntMcpServer(read.endpoint);
  await server.connect(new StdioServerTransport());
  return 0;
}
