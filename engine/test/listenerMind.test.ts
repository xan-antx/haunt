import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Decision } from '../src/core/types.ts';
import type { Heard } from '../src/ghosts/listener/ax.ts';
import type { ListenerAction } from '../src/ghosts/listener/body.ts';
import { createListenerMind } from '../src/ghosts/listener/mind.ts';
import { loadMission, type DoneWhen, type Intention, type Mission, type TargetKind } from '../src/missions/loadMission.ts';
import { heard, lanternBills, LB, type LanternScene, type NodeSpec } from './helpers/heard.ts';

/**
 * The Listener's Mind on scripted Heard sequences. The Lantern Bills scenes copy the tree described in the
 * design, and the main test follows the design's expected walk decision by decision.
 * **Validates: Requirements 9.1–9.10**
 */

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The pay-bill mission as the CLI hands it to the Mind: `{{futureExpiry}}` already expanded (November 2026 → 11/28). */
function payBill(): Mission {
  const mission = loadMission(path.join(ENGINE_ROOT, 'missions'), 'pay-bill');
  return JSON.parse(JSON.stringify(mission).replaceAll('{{futureExpiry}}', '11/28')) as Mission;
}

const NEVER_USED = { rng: () => 0.5 };

// -- Small mission builders ------------------------------------------------------------------------------

function activate(
  id: string,
  kind: TargetKind,
  en: string[],
  doneWhen: DoneWhen,
  extra: { lastResort?: 'unnamedButton'; pa?: string[] } = {},
): Intention {
  return {
    id,
    do: 'activate',
    thought: `Thought for ${id}.`,
    target: { kind, en, ...(extra.pa ? { pa: extra.pa } : {}) },
    doneWhen,
    ...(extra.lastResort ? { lastResort: extra.lastResort } : {}),
  };
}

function typeInto(id: string, en: string[], value: string, pa?: string[]): Intention {
  return {
    id,
    do: 'type',
    value,
    thought: `Thought for ${id}.`,
    target: { kind: 'field', en, ...(pa ? { pa } : {}) },
    doneWhen: { fieldValue: true },
  };
}

function missionOf(...intentions: Intention[]): Mission {
  return {
    id: 'test',
    site: 'lantern-bills',
    goal: "Pay this month's electricity bill",
    requirement: 'A requirement',
    successCheck: { text: 'Done', visible: '#done' },
    intentions,
  };
}

const presentAny = (en: string): DoneWhen => ({ present: { kind: 'any', en: [en] } });

/** Plain page with some nodes; `focus` is a ref. */
function page(nodes: NodeSpec[], focus: string | null = null, extra: { path?: string } = {}): Heard {
  return heard(nodes, { focus, ...(extra.path ? { path: extra.path } : {}) });
}

const ACTION = {
  heading: { type: 'jump', to: 'heading', dir: 'next' },
  button: { type: 'jump', to: 'button', dir: 'next' },
  field: { type: 'jump', to: 'field', dir: 'next' },
  enter: { type: 'key', key: 'Enter' },
  space: { type: 'key', key: 'Space' },
  tab: { type: 'key', key: 'Tab' },
  shiftTab: { type: 'key', key: 'Shift+Tab' },
  escape: { type: 'key', key: 'Escape' },
} as const satisfies Record<string, ListenerAction>;

function actionOf(decision: Decision<ListenerAction>): ListenerAction {
  if (decision.kind !== 'act') throw new Error(`Expected an action but the Mind gave up: ${decision.thought}`);
  return decision.action;
}

// -- The expected walk on Lantern Bills ---------------------------------------------------------------------

const V1 = { [LB.CARD]: '4111111111111111' };
const V2 = { ...V1, [LB.EXPIRY]: '11/28' };
const V3 = { ...V2, [LB.CVV]: '123' };
const V4 = { ...V3, [LB.NAME]: 'Asha Kaur' };

interface WalkStep {
  scene: LanternScene;
  /** Expected action, or `'give_up'`. */
  expect: ListenerAction | 'give_up';
  intention?: string;
}

const form = (focus: string | null, values: Record<string, string> = {}): LanternScene => ({ form: true, focus, values });
const modal = (focus: string): LanternScene => ({ form: true, modal: true, focus, values: V4 });

const WALK: WalkStep[] = [
  { scene: {}, expect: ACTION.heading }, // step 1 (open page) → step 2: orientation
  { scene: { readingPosition: LB.HEADING }, expect: ACTION.button, intention: 'open-form' }, // step 3
  { scene: { focus: LB.PAY }, expect: ACTION.enter, intention: 'open-form' }, // step 4
  { scene: form(LB.CARD), expect: { type: 'type', text: '4111111111111111' }, intention: 'card-number' }, // 5
  { scene: form(LB.CARD, V1), expect: ACTION.field, intention: 'expiry' }, // 6
  { scene: form(LB.EXPIRY, V1), expect: { type: 'type', text: '11/28' }, intention: 'expiry' },
  { scene: form(LB.EXPIRY, V2), expect: ACTION.field, intention: 'cvv' },
  { scene: form(LB.CVV, V2), expect: { type: 'type', text: '123' }, intention: 'cvv' },
  { scene: form(LB.CVV, V3), expect: ACTION.field, intention: 'name' },
  { scene: form(LB.NAME, V3), expect: { type: 'type', text: 'Asha Kaur' }, intention: 'name' }, // 11
  { scene: form(LB.NAME, V4), expect: ACTION.button, intention: 'submit' }, // 12
  { scene: form(LB.SUBMIT, V4), expect: ACTION.button, intention: 'submit' }, // unnamed button: not a match, keep jumping
  { scene: form(LB.PAY, V4), expect: ACTION.button, intention: 'submit' }, // Pay this bill: used, keep jumping
  { scene: form(LB.SUBMIT, V4), expect: ACTION.enter, intention: 'submit' }, // Full_Pass → last resort
  { scene: modal(LB.CHECK), expect: ACTION.tab, intention: 'confirm' }, // dialog opened: Tab round
  { scene: modal(LB.LEARN), expect: ACTION.tab, intention: 'confirm' },
  { scene: modal(LB.CHECK), expect: ACTION.shiftTab, intention: 'confirm' }, // Tab round complete
  { scene: modal(LB.LEARN), expect: ACTION.shiftTab, intention: 'confirm' },
  { scene: modal(LB.CHECK), expect: ACTION.escape, intention: 'confirm' }, // Shift+Tab round complete
  { scene: modal(LB.CHECK), expect: 'give_up' }, // the engine would have ended the Run as `trapped` before this
];

function runWalk(mission: Mission): Decision<ListenerAction>[] {
  const mind = createListenerMind(mission, NEVER_USED);
  return WALK.map((step) => mind.decide(lanternBills(step.scene)));
}

describe('Feature: haunt-engine, The Listener Mind on the Lantern Bills walk (Req 9.1–9.10)', () => {
  it('makes the decisions of the design\'s expected walk, in order', () => {
    const decisions = runWalk(payBill());
    decisions.forEach((decision, i) => {
      const step = WALK[i]!;
      if (step.expect === 'give_up') {
        expect(decision.kind, `decision ${i}`).toBe('give_up');
        return;
      }
      expect(decision.kind, `decision ${i}`).toBe('act');
      expect(actionOf(decision), `decision ${i}`).toEqual(step.expect);
      if (step.intention !== undefined && decision.kind === 'act') {
        expect(decision.intentionId, `decision ${i}`).toBe(step.intention);
      }
    });
    const last = decisions[decisions.length - 1]!;
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
  });

  it('gives a first-person thought for every decision, naming what it heard when it acts on a control', () => {
    const decisions = runWalk(payBill());
    for (const decision of decisions) {
      expect(decision.thought.trim()).not.toBe('');
      expect(decision.thought).toMatch(/\bI\b|\bI'/);
    }
    expect(actionOf(decisions[2]!)).toEqual(ACTION.enter);
    expect(decisions[2]!.thought).toContain("'Pay this bill, button'");
    expect(decisions[2]!.thought).toContain('press Enter');
    expect(decisions[3]!.thought).toContain("'Card Number, edit text, required'");
    // The unnamed submit button is heard as just "button".
    expect(decisions[13]!.thought).toContain("'button'");
    expect(decisions[13]!.thought).toContain('no name');
  });

  it('gives the same decisions for the same Perceptions (Req 9.9)', () => {
    const first = runWalk(payBill());
    const second = runWalk(payBill());
    expect(second).toEqual(first);
  });

  it('does not change the Heard values it is given', () => {
    const scenes = WALK.map((step) => lanternBills(step.scene));
    const before = JSON.stringify(scenes);
    const mind = createListenerMind(payBill(), NEVER_USED);
    for (const scene of scenes) mind.decide(scene);
    expect(JSON.stringify(scenes)).toBe(before);
  });

  it('writes the trapped Give_Up_Thought from what it heard, including the controls it cannot reach', () => {
    const mind = createListenerMind(payBill(), NEVER_USED);
    // Everything up to and including the Escape press (decision 18).
    WALK.slice(0, 19).forEach((step) => mind.decide(lanternBills(step.scene)));
    const thought = mind.giveUpThought('trapped');
    expect(thought).toContain("'Protect your payment'");
    expect(thought).toContain("'Payment protection for ₹99…'");
    expect(thought).toContain("'Learn more'");
    expect(thought).toContain('Escape does nothing');
    expect(thought).toContain("'Close dialog'");
    expect(thought).toContain("'Continue'");
    expect(thought).toMatch(/can't reach/);
  });

  it('writes the other Give_Up_Thoughts from its own memory', () => {
    const mind = createListenerMind(payBill(), NEVER_USED);
    WALK.slice(0, 19).forEach((step) => mind.decide(lanternBills(step.scene)));
    expect(mind.giveUpThought('step_limit')).toMatch(/^I've tried 20 times and still haven't managed to pay this month's electricity bill/);
    expect(mind.giveUpThought('no_match')).toMatch(/none of them sounded like what I was looking for/);
    expect(mind.giveUpThought('no_match').trim()).not.toBe('');
  });
});

// -- Orientation (Req 9.10) ----------------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind orientation (Req 9.10)', () => {
  const mission = missionOf(activate('go', 'button', ['^go$'], 'success'));
  const nodes: NodeSpec[] = [{ ref: 'a', role: 'button', name: 'Go' }];

  it('jumps to the next heading first, once, at the start of the Run', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    // Even when the focused node already matches, the Mind first hears where it is.
    expect(actionOf(mind.decide(page(nodes, 'a')))).toEqual(ACTION.heading);
    expect(actionOf(mind.decide(page(nodes, 'a')))).toEqual(ACTION.enter);
  });

  it('jumps to the next heading again whenever the page path changes, and not otherwise', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    const other: NodeSpec[] = [{ ref: 'o', role: 'button', name: 'Other' }];
    expect(actionOf(mind.decide(page(other, null)))).toEqual(ACTION.heading);
    expect(actionOf(mind.decide(page(other, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(other, 'o')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(other, null, { path: '/autopay' })))).toEqual(ACTION.heading);
    expect(actionOf(mind.decide(page(other, null, { path: '/autopay' })))).toEqual(ACTION.button);
  });
});

// -- Matching and acting (Req 9.2, 9.5) --------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind matching and acting (Req 9.2, 9.5)', () => {
  function afterOrientation(mission: Mission) {
    const mind = createListenerMind(mission, NEVER_USED);
    mind.decide(page([]));
    return mind;
  }

  it('presses Enter on a matching button and Space on a matching checkbox', () => {
    const button = afterOrientation(missionOf(activate('b', 'button', ['^save$'], 'success')));
    expect(actionOf(button.decide(page([{ ref: 'x', role: 'button', name: 'Save' }], 'x')))).toEqual(ACTION.enter);

    const link = afterOrientation(missionOf(activate('l', 'link', ['^help$'], 'success')));
    expect(actionOf(link.decide(page([{ ref: 'x', role: 'link', name: 'Help' }], 'x')))).toEqual(ACTION.enter);

    const checkbox = afterOrientation(missionOf(activate('c', 'checkbox', ['newsletter'], 'success')));
    const nodes: NodeSpec[] = [{ ref: 'x', role: 'checkbox', name: 'Subscribe to the newsletter', states: { checked: false } }];
    expect(actionOf(checkbox.decide(page(nodes, 'x')))).toEqual(ACTION.space);
  });

  it('does not match a node whose role does not fit the kind, or whose name does not match', () => {
    const mind = afterOrientation(missionOf(activate('b', 'button', ['^save$'], 'success')));
    // A link called "Save" is not a button; a button called "Cancel" is not "Save".
    const nodes: NodeSpec[] = [
      { ref: 'link', role: 'link', name: 'Save' },
      { ref: 'cancel', role: 'button', name: 'Cancel' },
    ];
    expect(actionOf(mind.decide(page(nodes, 'link')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'cancel')))).toEqual(ACTION.button);
  });

  it('types the value into a matching field, and moves on only when the field then has a value', () => {
    const mission = missionOf(typeInto('first', ['first name'], 'Asha'), typeInto('second', ['surname'], 'Kaur'));
    const mind = afterOrientation(mission);
    const empty: NodeSpec[] = [
      { ref: 'f1', role: 'textbox', name: 'First name' },
      { ref: 'f2', role: 'textbox', name: 'Surname' },
    ];
    const first = mind.decide(page(empty, 'f1'));
    expect(actionOf(first)).toEqual({ type: 'type', text: 'Asha' });
    // The AX value is still empty: the Intention is not done, and the field is not used again.
    const stillEmpty = mind.decide(page(empty, 'f1'));
    expect(actionOf(stillEmpty)).toEqual(ACTION.field);
    expect(stillEmpty.kind === 'act' && stillEmpty.intentionId).toBe('first');

    // With a value, the Mind moves on to the next Intention.
    const filled: NodeSpec[] = [{ ...empty[0]!, value: 'Asha' }, empty[1]!];
    const next = mind.decide(page(filled, 'f2'));
    expect(actionOf(next)).toEqual({ type: 'type', text: 'Kaur' });
    expect(next.kind === 'act' && next.intentionId).toBe('second');
  });

  it('never matches a control used for an earlier Intention, even when its name fits', () => {
    const mission = missionOf(
      activate('one', 'button', ['^pay'], presentAny('autopay')),
      activate('two', 'button', ['^pay'], 'success'),
    );
    const mind = afterOrientation(mission);
    const first = [{ ref: 'pay', role: 'button', name: 'Pay this bill' }];
    expect(actionOf(mind.decide(page(first, 'pay')))).toEqual(ACTION.enter);
    // Intention one is done (autopay is now present). The same button fits "two" by name, but it was used.
    const second = [...first, { ref: 'auto', role: 'link', name: 'Set up autopay' }];
    const decision = mind.decide(page(second, 'pay'));
    expect(actionOf(decision)).toEqual(ACTION.button);
    expect(decision.kind === 'act' && decision.intentionId).toBe('two');
    // A different button that fits is acted on.
    const third = [...second, { ref: 'pay2', role: 'button', name: 'Pay now' }];
    expect(actionOf(mind.decide(page(third, 'pay2')))).toEqual(ACTION.enter);
  });

  it('matches names in the order of the languages it was given, and English only by default', () => {
    const mission = missionOf(typeInto('card', ['card number'], '4111', ['ਕਾਰਡ ਨੰਬਰ']));
    const nodes: NodeSpec[] = [{ ref: 'f', role: 'textbox', name: 'ਕਾਰਡ ਨੰਬਰ' }];

    const english = createListenerMind(mission, NEVER_USED);
    english.decide(page([]));
    expect(actionOf(english.decide(page(nodes, 'f')))).toEqual(ACTION.field);

    const punjabi = createListenerMind(mission, { ...NEVER_USED, languages: ['pa', 'en'] });
    punjabi.decide(page([]));
    expect(actionOf(punjabi.decide(page(nodes, 'f')))).toEqual({ type: 'type', text: '4111' });
  });
});

// -- Jump search and the Full_Pass (Req 9.3, 9.7) ----------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind jump search (Req 9.3, 9.7)', () => {
  const mission = missionOf(activate('confirm', 'button', ['^confirm$'], 'success'));
  const nodes: NodeSpec[] = [
    { ref: 'a', role: 'button', name: 'Alpha' },
    { ref: 'b', role: 'button', name: 'Beta' },
  ];

  it('jumps by button until it lands on a control it already reached, then gives up with no_match', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    expect(actionOf(mind.decide(page(nodes)))).toEqual(ACTION.heading);
    expect(actionOf(mind.decide(page(nodes, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'a')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'b')))).toEqual(ACTION.button);
    const last = mind.decide(page(nodes, 'a'));
    expect(last.kind).toBe('give_up');
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
    expect(last.thought).toContain("'Alpha'");
    expect(last.thought).toContain("'Beta'");
    expect(mind.giveUpThought('no_match')).toBe(last.thought);
  });

  it('counts the control it starts on as reached', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    mind.decide(page(nodes));
    expect(actionOf(mind.decide(page(nodes, 'a')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'b')))).toEqual(ACTION.button);
    expect(mind.decide(page(nodes, 'a')).kind).toBe('give_up');
  });

  it('gives up when a jump finds no control of its kind at all', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    const text: NodeSpec[] = [{ ref: 't', role: 'StaticText', name: 'Nothing to press here' }];
    mind.decide(page(text));
    expect(actionOf(mind.decide(page(text, null)))).toEqual(ACTION.button);
    expect(mind.decide(page(text, null)).kind).toBe('give_up');
  });

  it('acts as soon as a jump lands on a match', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    const withConfirm: NodeSpec[] = [...nodes, { ref: 'c', role: 'button', name: 'Confirm' }];
    mind.decide(page(withConfirm));
    expect(actionOf(mind.decide(page(withConfirm, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(withConfirm, 'a')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(withConfirm, 'c')))).toEqual(ACTION.enter);
  });

  it('searches with Tab for a link, because the Body has no link jump', () => {
    const linkMission = missionOf(activate('help', 'link', ['^help$'], 'success'));
    const links: NodeSpec[] = [
      { ref: 'a', role: 'link', name: 'Home' },
      { ref: 'h', role: 'link', name: 'Help' },
    ];
    const mind = createListenerMind(linkMission, NEVER_USED);
    mind.decide(page(links));
    expect(actionOf(mind.decide(page(links, null)))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(page(links, 'a')))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(page(links, 'h')))).toEqual(ACTION.enter);
  });
});

// -- The dialog search (Req 9.4) -----------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind dialog search (Req 9.4)', () => {
  const inDialog = (focus: string): Heard => lanternBills({ form: true, modal: true, focus });

  function mindAfterOrientation(target: string) {
    const mind = createListenerMind(missionOf(activate('close', 'button', [target], 'success')), NEVER_USED);
    mind.decide(lanternBills({ form: true, modal: true }));
    return mind;
  }

  it('acts on a control that Tab lands on', () => {
    const mind = mindAfterOrientation('^continue$');
    expect(actionOf(mind.decide(inDialog(LB.CHECK)))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(inDialog(LB.LEARN)))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(inDialog(LB.CONTINUE)))).toEqual(ACTION.enter);
  });

  it('tries Shift+Tab after a Tab round that finds nothing, and acts on what it lands on', () => {
    const mind = mindAfterOrientation('^close dialog$');
    expect(actionOf(mind.decide(inDialog(LB.CHECK)))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(inDialog(LB.LEARN)))).toEqual(ACTION.tab);
    expect(actionOf(mind.decide(inDialog(LB.CHECK)))).toEqual(ACTION.shiftTab); // Tab round complete
    expect(actionOf(mind.decide(inDialog(LB.CLOSE)))).toEqual(ACTION.enter);
  });

  it('presses Escape once, then gives up with no_match when nothing else is left to try', () => {
    const mind = mindAfterOrientation('^nothing like this$');
    const decisions = [LB.CHECK, LB.LEARN, LB.CHECK, LB.LEARN, LB.CHECK, LB.CHECK, LB.CHECK].map((focus) =>
      mind.decide(inDialog(focus)),
    );
    expect(decisions.slice(0, 5).map(actionOf)).toEqual([
      ACTION.tab,
      ACTION.tab,
      ACTION.shiftTab,
      ACTION.shiftTab,
      ACTION.escape,
    ]);
    // Escape is pressed once. Focus is still in the dialog, so the next decision is to give up.
    expect(decisions[5]!.kind).toBe('give_up');
    expect(decisions[6]!.kind).toBe('give_up');
  });

  it('starts a new search when the dialog closes (a page search again)', () => {
    const mind = mindAfterOrientation('^nothing like this$');
    mind.decide(inDialog(LB.CHECK));
    mind.decide(inDialog(LB.LEARN));
    // The dialog is gone and focus is on the page: back to jumping by button.
    expect(actionOf(mind.decide(lanternBills({ form: true, focus: LB.SUBMIT })))).toEqual(ACTION.button);
  });
});

// -- Last resort (Req 9.6, 9.7) -------------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind last resort (Req 9.6, 9.7)', () => {
  const mission = missionOf(
    activate('submit', 'button', ['^submit$'], presentAny('all done'), { lastResort: 'unnamedButton' }),
    activate('finish', 'button', ['^finish$'], 'success'),
  );
  const nodes: NodeSpec[] = [
    { ref: 'u1', role: 'button', name: '' },
    { ref: 'n', role: 'button', name: 'Cancel' },
    { ref: 'u2', role: 'button', name: '' },
  ];

  it('tries the buttons with no name in the order it reached them, one at a time, until doneWhen holds', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    expect(actionOf(mind.decide(page(nodes)))).toEqual(ACTION.heading);
    expect(actionOf(mind.decide(page(nodes, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'u1')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'n')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'u2')))).toEqual(ACTION.button);
    // Back on a control it reached: a Full_Pass. It is on the first unnamed button, so it presses Enter.
    const first = mind.decide(page(nodes, 'u1'));
    expect(actionOf(first)).toEqual(ACTION.enter);
    expect(first.thought).toContain('no name');

    // Nothing changed: doneWhen does not hold. It goes on to the second unnamed button.
    expect(actionOf(mind.decide(page(nodes, 'u1')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'n')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(nodes, 'u2')))).toEqual(ACTION.enter);

    // Now the page says "All done": the Intention is done, and the Mind goes on to the next one.
    const done = [...nodes, { ref: 'd', role: 'StaticText', name: 'All done' }];
    const next = mind.decide(page(done, 'u2'));
    expect(actionOf(next)).toEqual(ACTION.button);
    expect(next.kind === 'act' && next.intentionId).toBe('finish');
  });

  it('gives up with no_match when no button without a name was reached', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    const named: NodeSpec[] = [
      { ref: 'n', role: 'button', name: 'Cancel' },
      { ref: 'm', role: 'button', name: 'Help' },
    ];
    mind.decide(page(named));
    expect(actionOf(mind.decide(page(named, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(named, 'n')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(named, 'm')))).toEqual(ACTION.button);
    const last = mind.decide(page(named, 'n'));
    expect(last.kind).toBe('give_up');
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
  });

  it('gives up with no_match after the last button without a name has been tried', () => {
    const mind = createListenerMind(mission, NEVER_USED);
    const one: NodeSpec[] = [{ ref: 'u', role: 'button', name: '' }];
    mind.decide(page(one));
    expect(actionOf(mind.decide(page(one, null)))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(one, 'u')))).toEqual(ACTION.button);
    expect(actionOf(mind.decide(page(one, 'u')))).toEqual(ACTION.enter);
    expect(mind.decide(page(one, 'u')).kind).toBe('give_up');
  });

  it('does not use the last resort for an Intention that does not allow it', () => {
    const plain = missionOf(activate('submit', 'button', ['^submit$'], 'success'));
    const mind = createListenerMind(plain, NEVER_USED);
    const one: NodeSpec[] = [{ ref: 'u', role: 'button', name: '' }];
    mind.decide(page(one));
    mind.decide(page(one, null));
    expect(actionOf(mind.decide(page(one, 'u')))).toEqual(ACTION.button);
    expect(mind.decide(page(one, 'u')).kind).toBe('give_up');
  });
});
