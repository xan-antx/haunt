import type { Heard, HeardNode } from '../../ghosts/listener/ax.ts';
import type { JumpDirection, JumpTarget, ListenerAction, ListenerKey } from '../../ghosts/listener/body.ts';

/*
 * The tool contract between the Kiro agent and the engine (design: "Tool contract").
 *
 * Pure definitions and validation, shared by the MCP server and the Bridge. Nothing here touches a
 * browser. The agent gets seven tools: it can read what The Listener hears, press keys, type, jump
 * by heading, landmark, field or button, say what it thinks, and stop. It has no tool that reads or
 * writes Findings: the detectors alone decide what is wrong.
 */

export const LISTENER_KEYS = [
  'Tab',
  'Shift+Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Space',
  'Escape',
] as const satisfies readonly ListenerKey[];

export const JUMP_TARGETS = ['heading', 'landmark', 'field', 'button'] as const satisfies readonly JumpTarget[];
export const JUMP_DIRS = ['next', 'previous'] as const satisfies readonly JumpDirection[];

/** The seven tool names, in the order the MCP server lists them. */
export const TOOL_NAMES = [
  'read_page',
  'read_announcements',
  'press_key',
  'type_text',
  'jump',
  'think',
  'finish',
] as const;

/** Longest `type_text` text, after trimming. */
export const MAX_TYPE_TEXT = 500;
/** Longest `think` text, after trimming. */
export const MAX_THINK_TEXT = 1000;

export type ToolCall =
  | { name: 'read_page' }
  | { name: 'read_announcements' }
  | { name: 'press_key'; key: ListenerKey }
  | { name: 'type_text'; text: string }
  | { name: 'jump'; to: JumpTarget; dir: JumpDirection }
  | { name: 'think'; text: string }
  | { name: 'finish' };

export type ToolResult = { ok: true; text: string } | { ok: false; error: string };

export type ParsedToolCall = { ok: true; call: ToolCall } | { ok: false; error: string };

/** Shows a bad value in an error message without letting it run on for pages. */
function show(value: unknown): string {
  let text: string;
  if (typeof value === 'string') text = JSON.stringify(value);
  else if (value === undefined) text = 'undefined';
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * Checks a tool name and its arguments. An unknown tool, key, target or direction gives an error that
 * names the bad value and lists the allowed ones. `type_text` and `think` texts are trimmed and limited.
 */
export function parseToolCall(name: string, args: unknown): ParsedToolCall {
  const input = isRecord(args) ? args : {};

  switch (name) {
    case 'read_page':
    case 'read_announcements':
    case 'finish':
      return { ok: true, call: { name } };

    case 'press_key': {
      const key = input.key;
      if (!oneOf(LISTENER_KEYS, key)) {
        return { ok: false, error: `The key ${show(key)} is not allowed. Allowed keys: ${LISTENER_KEYS.join(', ')}.` };
      }
      return { ok: true, call: { name, key } };
    }

    case 'type_text': {
      const text = input.text;
      if (typeof text !== 'string') return { ok: false, error: `The text ${show(text)} is not a string.` };
      const trimmed = text.trim();
      if (trimmed === '') return { ok: false, error: 'The text is empty.' };
      if (trimmed.length > MAX_TYPE_TEXT) {
        return { ok: false, error: `The text is ${trimmed.length} characters long. The limit is ${MAX_TYPE_TEXT}.` };
      }
      return { ok: true, call: { name, text: trimmed } };
    }

    case 'jump': {
      const to = input.to;
      const dir = input.dir;
      if (!oneOf(JUMP_TARGETS, to)) {
        return { ok: false, error: `The jump target ${show(to)} is not allowed. Allowed targets: ${JUMP_TARGETS.join(', ')}.` };
      }
      if (!oneOf(JUMP_DIRS, dir)) {
        return { ok: false, error: `The jump direction ${show(dir)} is not allowed. Allowed directions: ${JUMP_DIRS.join(', ')}.` };
      }
      return { ok: true, call: { name, to, dir } };
    }

    case 'think': {
      const text = input.text;
      if (typeof text !== 'string') return { ok: false, error: `The text ${show(text)} is not a string.` };
      const trimmed = text.trim();
      if (trimmed === '') return { ok: false, error: 'The text is empty.' };
      if (trimmed.length > MAX_THINK_TEXT) {
        return { ok: false, error: `The text is ${trimmed.length} characters long. The limit is ${MAX_THINK_TEXT}.` };
      }
      return { ok: true, call: { name, text: trimmed } };
    }

    default:
      return { ok: false, error: `The tool ${show(name)} does not exist. Tools: ${TOOL_NAMES.join(', ')}.` };
  }
}

/** The Body action for an action tool, or `null` for the tools that do not act on the page. */
export function toListenerAction(call: ToolCall): ListenerAction | null {
  switch (call.name) {
    case 'press_key':
      return { type: 'key', key: call.key };
    case 'type_text':
      return { type: 'type', text: call.text };
    case 'jump':
      return { type: 'jump', to: call.to, dir: call.dir };
    default:
      return null;
  }
}

function statesOf(node: HeardNode): string[] {
  const out: string[] = [];
  const { states } = node;
  if (states.focused) out.push('focused');
  if (states.checked !== undefined) out.push(states.checked === 'mixed' ? 'partly checked' : states.checked ? 'checked' : 'not checked');
  if (states.expanded !== undefined) out.push(states.expanded ? 'expanded' : 'collapsed');
  if (states.disabled) out.push('disabled');
  if (states.required) out.push('required');
  if (states.invalid) out.push('invalid');
  if (states.modal) out.push('modal');
  if (states.busy) out.push('busy');
  return out;
}

function describeNode(node: HeardNode): string {
  const parts = [node.ref, node.role];
  if (node.level !== undefined) parts.push(`level ${node.level}`);
  parts.push(`"${node.name}"`);
  if (node.value !== '') parts.push(`value "${node.value}"`);
  if (node.description !== '') parts.push(`description "${node.description}"`);
  const states = statesOf(node);
  if (states.length > 0) parts.push(`[${states.join(', ')}]`);
  return `${'  '.repeat(Math.max(0, node.depth))}- ${parts.join(' ')}`;
}

/**
 * Turns what The Listener hears into plain text for the agent: title, path, focus, dialog, region,
 * reading position, and every node with its ref, role, name and states. Announcements are not part
 * of this text; the agent gets them from `read_announcements`.
 */
export function formatHeard(heard: Heard): string {
  const focusNode = heard.focus === null ? undefined : heard.nodes.find((n) => n.ref === heard.focus);
  const lines = [
    `Page title: ${heard.title}`,
    `Page path: ${heard.path}`,
    `Focus: ${heard.focus === null ? 'nothing' : focusNode ? `${focusNode.ref} (${focusNode.role} "${focusNode.name}")` : heard.focus}`,
    `Dialog: ${heard.dialog ? `${heard.dialog.ref} "${heard.dialog.name}"` : 'none'}`,
    `Region: ${heard.region ? `${heard.region.ref} ${heard.region.role} "${heard.region.name}"` : 'none'}`,
    `Reading position: ${heard.readingPosition ?? 'none'}`,
    'Nodes:',
    ...heard.nodes.map(describeNode),
  ];
  return lines.join('\n');
}
