import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Decision, MindOptions } from '../src/core/types.ts';
import type { Heard } from '../src/ghosts/listener/ax.ts';
import type { ListenerAction } from '../src/ghosts/listener/body.ts';
import { ListenerMind } from '../src/ghosts/listener/mind.ts';
import { loadMission, type Mission } from '../src/missions/loadMission.ts';
import { heard, type NodeSpec } from './helpers/heard.ts';

/**
 * The Listener's Mind on the Memos `write-note` mission: the last resort for a field with no name, and the
 * routine for being stuck in a field it typed into.
 * **Validates: Requirements 1.3, 3.2, 3.4, 4.2**
 */
const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOTE = 'Haunt was here 20261122-111605';

const THROWING: MindOptions = {
  rng: () => {
    throw new Error('The Mind used the random number generator');
  },
};

/** The note and save intentions of `write-note`, with the stamp filled in. */
function mission(options: { lastResort: boolean }): Mission {
  const full = loadMission(path.join(ENGINE_ROOT, 'missions'), 'write-note');
  const copy = JSON.parse(JSON.stringify(full).replaceAll('{{runStamp}}', '20261122-111605')) as Mission;
  const intentions = copy.intentions.slice(3);
  if (!options.lastResort) for (const i of intentions) delete (i as { lastResort?: string }).lastResort;
  return { ...copy, intentions };
}

const SEARCH = 'ax-30';
const EDITOR = 'ax-31';
const SAVE = 'ax-32';
const TEXT = 'ax-33';

/** The signed-in Memos page: a named search box, the editor with no name, and Save. */
function page(focus: string | null, options: { typed?: boolean; readingPosition?: string | null } = {}): Heard {
  const nodes: NodeSpec[] = [
    { ref: 'ax-1', role: 'RootWebArea', name: 'Memos', depth: 0 },
    { ref: 'ax-2', role: 'heading', name: 'Memos', level: 1 },
    { ref: SEARCH, role: 'textbox', name: 'Search memos' },
    { ref: EDITOR, role: 'textbox', name: '' },
    ...(options.typed ? [{ ref: TEXT, role: 'StaticText', name: NOTE, depth: 2 }] : []),
    { ref: SAVE, role: 'button', name: 'Save' },
  ];
  return heard(nodes, { path: '/', title: 'Memos', focus, readingPosition: options.readingPosition ?? null });
}

function actionOf(decision: Decision<ListenerAction>): ListenerAction {
  if (decision.kind !== 'act') throw new Error(`Expected an action but the Mind gave up: ${decision.thought}`);
  return decision.action;
}

/** Walks the Mind to the moment it has typed the note into the editor. */
function walkToTyped(mind: ListenerMind): Decision<ListenerAction> {
  expect(actionOf(mind.decide(page(null)))).toEqual({ type: 'jump', to: 'heading', dir: 'next' });
  expect(actionOf(mind.decide(page(null, { readingPosition: 'ax-2' })))).toEqual({ type: 'jump', to: 'field', dir: 'next' });
  expect(actionOf(mind.decide(page(SEARCH)))).toEqual({ type: 'jump', to: 'field', dir: 'next' });
  expect(actionOf(mind.decide(page(EDITOR)))).toEqual({ type: 'jump', to: 'field', dir: 'next' });
  // Back on the search box: a Full_Pass with no match. The last resort starts and jumps to the first unnamed field.
  const goToEditor = mind.decide(page(SEARCH));
  expect(actionOf(goToEditor)).toEqual({ type: 'jump', to: 'field', dir: 'next' });
  expect(goToEditor.thought).toContain('no name');
  return mind.decide(page(EDITOR));
}

describe('Listener Mind: the unnamedField last resort', () => {
  it('types the note into the field with no name when nothing else fits', () => {
    const mind = new ListenerMind(mission({ lastResort: true }), THROWING);
    const typing = walkToTyped(mind);
    expect(actionOf(typing)).toEqual({ type: 'type', text: NOTE });
    expect(typing.thought).toContain('no name');
    expect(typing.thought).toContain(`I'll type "${NOTE}"`);
  });

  it('does not try a field that has a name', () => {
    const mind = new ListenerMind(mission({ lastResort: true }), THROWING);
    walkToTyped(mind);
    // The named search box is never typed into: only the editor was.
    const next = mind.decide(page(SEARCH, { typed: true }));
    expect(actionOf(next)).not.toEqual({ type: 'type', text: NOTE });
  });

  it('gives up with no_match when the intention has no last resort', () => {
    const mind = new ListenerMind(mission({ lastResort: false }), THROWING);
    mind.decide(page(null));
    mind.decide(page(null, { readingPosition: 'ax-2' }));
    mind.decide(page(SEARCH));
    mind.decide(page(EDITOR));
    const decision = mind.decide(page(SEARCH));
    expect(decision.kind).toBe('give_up');
  });
});

describe('Listener Mind: stuck in a field it typed into', () => {
  /** After typing, the note is heard, so the Mind looks for Save. Focus stays on the editor. */
  function stuckAfterTyping(): ListenerMind {
    const mind = new ListenerMind(mission({ lastResort: true }), THROWING);
    walkToTyped(mind);
    return mind;
  }

  it('presses Shift+Tab, then Escape, then Escape when focus does not move, and records the trap in its memory', () => {
    const mind = stuckAfterTyping();
    // The note is typed; the Mind searches for Save with a jump, and focus is still on the editor.
    const search = mind.decide(page(EDITOR, { typed: true }));
    expect(actionOf(search)).toEqual({ type: 'jump', to: 'button', dir: 'next' });
    const shift = mind.decide(page(EDITOR, { typed: true }));
    expect(actionOf(shift)).toEqual({ type: 'key', key: 'Shift+Tab' });
    expect(shift.thought).toContain('no name');
    const escape1 = mind.decide(page(EDITOR, { typed: true }));
    expect(actionOf(escape1)).toEqual({ type: 'key', key: 'Escape' });
    const escape2 = mind.decide(page(EDITOR, { typed: true }));
    expect(actionOf(escape2)).toEqual({ type: 'key', key: 'Escape' });
    expect(mind.memory.elementTrap?.keys).toEqual(['Shift+Tab', 'Escape', 'Escape']);

    // After the second Escape the routine is over and the search starts again.
    const after = mind.decide(page(EDITOR, { typed: true }));
    expect(actionOf(after).type).not.toBe('type');
    expect(actionOf(after)).not.toEqual({ type: 'key', key: 'Shift+Tab' });

    const thought = mind.giveUpThought('trapped');
    expect(thought).toContain("I'm stuck in a text box with no name");
    expect(thought).toContain('Tab and Shift+Tab do not move me');
    expect(thought).not.toContain('dialog');
  });

  it('goes back to the normal search when focus moves after Shift+Tab', () => {
    const mind = stuckAfterTyping();
    mind.decide(page(EDITOR, { typed: true })); // jump to the next button
    expect(actionOf(mind.decide(page(EDITOR, { typed: true })))).toEqual({ type: 'key', key: 'Shift+Tab' });
    const resumed = mind.decide(page(SEARCH, { typed: true }));
    expect(actionOf(resumed)).toEqual({ type: 'jump', to: 'button', dir: 'next' });
    expect(mind.memory.elementTrap).toBeNull();
  });

  it('goes back to the normal search when focus moves after the first Escape', () => {
    const mind = stuckAfterTyping();
    mind.decide(page(EDITOR, { typed: true }));
    mind.decide(page(EDITOR, { typed: true })); // Shift+Tab
    expect(actionOf(mind.decide(page(EDITOR, { typed: true })))).toEqual({ type: 'key', key: 'Escape' });
    const resumed = mind.decide(page(SAVE, { typed: true }));
    expect(actionOf(resumed)).toEqual({ type: 'key', key: 'Enter' });
  });

  it('does not run the routine for a field it did not type into as a last resort', () => {
    const mind = new ListenerMind(mission({ lastResort: true }), THROWING);
    mind.decide(page(null));
    mind.decide(page(null, { readingPosition: 'ax-2' }));
    // Focus stays on the search box after a jump. The Mind has not typed into it, so it just goes on jumping.
    const first = mind.decide(page(SEARCH));
    const second = mind.decide(page(SEARCH));
    expect(actionOf(first).type).toBe('jump');
    // The jump found nothing new: the search ends as before, and no Shift+Tab or Escape is pressed.
    expect(second.kind).toBe('give_up');
    expect(mind.memory.elementTrap ?? null).toBeNull();
  });
});
