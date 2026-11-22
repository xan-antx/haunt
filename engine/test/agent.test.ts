import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the Listener agent file.
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const raw = readFileSync(path.join(REPO_ROOT, '.kiro', 'agents', 'listener.json'), 'utf8');
const agent = JSON.parse(raw) as {
  name: string;
  prompt: string;
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  tools: string[];
  allowedTools: string[];
  permissions?: { rules: { capability: string; match: string[]; effect: string }[] };
  includeMcpJson: boolean;
};

describe('.kiro/agents/listener.json', () => {
  it('is named listener, the name the launcher passes to --agent', () => {
    expect(agent.name).toBe('listener');
  });

  it('registers haunt-mcp and nothing else', () => {
    expect(Object.keys(agent.mcpServers)).toEqual(['haunt-mcp']);
    const server = agent.mcpServers['haunt-mcp'];
    expect(server?.args).toEqual(['engine/bin/haunt-mcp.mjs']);
    expect(Object.keys(server?.env ?? {}).sort()).toEqual(['HAUNT_BRIDGE_TOKEN', 'HAUNT_BRIDGE_URL']);
  });

  it('lets the agent use only haunt-mcp tools', () => {
    for (const entry of [...agent.tools, ...agent.allowedTools]) expect(entry).toMatch(/^@haunt-mcp(\/|$)/);
    expect(agent.allowedTools).toEqual(['@haunt-mcp/*']);
    for (const rule of agent.permissions?.rules ?? []) {
      expect(rule.capability).toBe('mcp');
      for (const match of rule.match) expect(match).toMatch(/^haunt-mcp\//);
    }
  });

  it('names no built-in tool anywhere in the file', () => {
    for (const builtin of ['fs_read', 'fs_write', 'execute_bash', 'execute_pwsh', 'use_aws', 'web_fetch']) {
      expect(raw).not.toContain(builtin);
    }
    expect(agent.includeMcpJson).toBe(false);
  });

  it('keeps the token out of the file: it only refers to the variables', () => {
    const env = agent.mcpServers['haunt-mcp']?.env ?? {};
    expect(env.HAUNT_BRIDGE_URL).toBe('${HAUNT_BRIDGE_URL}');
    expect(env.HAUNT_BRIDGE_TOKEN).toBe('${HAUNT_BRIDGE_TOKEN}');
  });

  it('tells the agent to read the page, to think on every step and not to give up early', () => {
    expect(agent.prompt).toMatch(/read_page/);
    expect(agent.prompt).toMatch(/call think before every action/i);
    expect(agent.prompt).toMatch(/do not give up early/i);
    expect(agent.prompt).toMatch(/not here to judge|not here to .*report problems/i);
  });

  it('tells the agent that a thought goes with the next action, and to make one call at a time', () => {
    expect(agent.prompt).toMatch(/kept with the very next action/i);
    expect(agent.prompt).toMatch(/not the one you just did/i);
    expect(agent.prompt).toMatch(/one tool call at a time/i);
  });

  it('describes The Listener as a person who uses a screen reader and the keyboard', () => {
    expect(agent.prompt).toMatch(/person who uses a screen reader/i);
    expect(agent.prompt).toMatch(/keyboard/i);
  });
});
