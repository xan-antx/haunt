import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  JUMP_DIRS,
  JUMP_TARGETS,
  LISTENER_KEYS,
  MAX_THINK_TEXT,
  MAX_TYPE_TEXT,
  TOOL_NAMES,
  parseToolCall,
  toListenerAction,
} from '../src/mind/ai/tools.ts';

/**
 * Feature: listener-ai-mind, Property 1: Tool input validation
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 */
const RUNS = { numRuns: 100 };

/** A fake Body that only counts `act` calls. */
function fakeBody() {
  const state = { acts: 0 };
  return {
    state,
    act(_action: unknown): void {
      state.acts += 1;
    },
  };
}

/** What the driver does with a call: act only when the call is accepted and maps to an action. */
function dispatch(name: string, args: unknown, body: ReturnType<typeof fakeBody>) {
  const parsed = parseToolCall(name, args);
  if (parsed.ok) {
    const action = toListenerAction(parsed.call);
    if (action) body.act(action);
  }
  return parsed;
}

const anyValue = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.array(fc.string()));
const anyArgs = fc.oneof(
  anyValue,
  fc.record({ key: anyValue, text: anyValue, to: anyValue, dir: anyValue }, { requiredKeys: [] }),
);

function isValid(name: string, args: unknown): boolean {
  if (!(TOOL_NAMES as readonly string[]).includes(name)) return false;
  const a = (typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  switch (name) {
    case 'press_key':
      return typeof a.key === 'string' && (LISTENER_KEYS as readonly string[]).includes(a.key);
    case 'type_text':
      return typeof a.text === 'string' && a.text.trim() !== '' && a.text.trim().length <= MAX_TYPE_TEXT;
    case 'think':
      return typeof a.text === 'string' && a.text.trim() !== '' && a.text.trim().length <= MAX_THINK_TEXT;
    case 'jump':
      return (
        typeof a.to === 'string' &&
        (JUMP_TARGETS as readonly string[]).includes(a.to) &&
        typeof a.dir === 'string' &&
        (JUMP_DIRS as readonly string[]).includes(a.dir)
      );
    default:
      return true;
  }
}

describe('Feature: listener-ai-mind, Property 1: Tool input validation', () => {
  it('accepts a call exactly when the name and every argument are allowed', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...TOOL_NAMES), fc.string()), anyArgs, (name, args) => {
        const body = fakeBody();
        const parsed = dispatch(name, args, body);
        expect(parsed.ok).toBe(isValid(name, args));
      }),
      RUNS,
    );
  });

  it('names the bad key, target, direction or tool in the error and causes no act call', () => {
    const bad = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !(LISTENER_KEYS as readonly string[]).includes(s));
    fc.assert(
      fc.property(bad, (value) => {
        const body = fakeBody();
        const key = dispatch('press_key', { key: value }, body);
        expect(key.ok).toBe(false);
        if (!key.ok) expect(key.error).toContain(JSON.stringify(value));

        const to = dispatch('jump', { to: value, dir: 'next' }, body);
        if (!(JUMP_TARGETS as readonly string[]).includes(value)) {
          expect(to.ok).toBe(false);
          if (!to.ok) expect(to.error).toContain(JSON.stringify(value));
        }

        const dir = dispatch('jump', { to: 'heading', dir: value }, body);
        if (!(JUMP_DIRS as readonly string[]).includes(value)) {
          expect(dir.ok).toBe(false);
          if (!dir.ok) expect(dir.error).toContain(JSON.stringify(value));
        }

        if (!(TOOL_NAMES as readonly string[]).includes(value)) {
          const tool = dispatch(value, {}, body);
          expect(tool.ok).toBe(false);
          if (!tool.ok) expect(tool.error).toContain(JSON.stringify(value));
        }
        expect(body.state.acts).toBe(0);
      }),
      RUNS,
    );
  });

  it('trims text, and rejects text over the limit without an act call', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 700 }), fc.string({ maxLength: 4 }).filter((s) => s.trim() === ''), (text, pad) => {
        const body = fakeBody();
        const typed = dispatch('type_text', { text: `${pad}${text}${pad}` }, body);
        const trimmed = text.trim();
        if (trimmed === '' || trimmed.length > MAX_TYPE_TEXT) {
          expect(typed.ok).toBe(false);
          expect(body.state.acts).toBe(0);
        } else {
          expect(typed.ok).toBe(true);
          if (typed.ok && typed.call.name === 'type_text') expect(typed.call.text).toBe(trimmed);
          expect(body.state.acts).toBe(1);
        }

        const thought = parseToolCall('think', { text: `${pad}${text}${pad}` });
        const tooLong = trimmed.length > MAX_THINK_TEXT;
        expect(thought.ok).toBe(trimmed !== '' && !tooLong);
        if (thought.ok && thought.call.name === 'think') expect(thought.call.text).toBe(trimmed);
      }),
      RUNS,
    );
  });
});
