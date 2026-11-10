import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Decision, MindOptions } from '../src/core/types.ts';
import type { Heard } from '../src/ghosts/listener/ax.ts';
import type { ListenerAction } from '../src/ghosts/listener/body.ts';
import { ListenerMind } from '../src/ghosts/listener/mind.ts';
import { loadMission, type Mission } from '../src/missions/loadMission.ts';
import { heard, lanternBills, LB, type LanternScene } from './helpers/heard.ts';

/**
 * The Listener's Mind on Lantern Bills, on top of `listenerMind.test.ts`: the walk compared with the design's
 * expected-walk table itself, determinism with no clock and no random numbers, the give-up with no unnamed
 * button, a reachable Continue button, the Punjabi site, the boundary between Mind and Probe, and a second page.
 * **Validates: Requirements 9.1–9.10**
 */

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DESIGN = path.join(ENGINE_ROOT, '..', '.kiro', 'specs', 'haunt-engine', 'design.md');

/** The pay-bill mission as the CLI hands it to the Mind: `{{futureExpiry}}` already expanded. */
function payBill(): Mission {
  const mission = loadMission(path.join(ENGINE_ROOT, 'missions'), 'pay-bill');
  return JSON.parse(JSON.stringify(mission).replaceAll('{{futureExpiry}}', '11/28')) as Mission;
}

/** Options whose random numbers throw: the Mind must never ask for one. */
const THROWING: MindOptions = {
  rng: () => {
    throw new Error('The Mind used the random number generator');
  },
};
const PUNJABI: MindOptions = { ...THROWING, languages: ['pa', 'hi', 'en'] };

// -- Scripted Lantern Bills sequences ---------------------------------------------------------------------------

const V1 = { [LB.CARD]: '4111111111111111' };
const V2 = { ...V1, [LB.EXPIRY]: '11/28' };
const V3 = { ...V2, [LB.CVV]: '123' };
const V4 = { ...V3, [LB.NAME]: 'Asha Kaur' };

const form = (focus: string | null, values: Record<string, string> = {}): LanternScene => ({ form: true, focus, values });
const modal = (focus: string): LanternScene => ({ form: true, modal: true, focus, values: V4 });

type Overlay = Pick<LanternScene, 'autopay' | 'submitName' | 'names'>;

/**
 * What the Mind hears before each of its decisions on the design's expected walk. Decision `i` is Step `i + 2`
 * (Step 1 opens the page and needs no decision). The last scene is the one before the Escape press.
 */
function walkScenes(overlay: Overlay = {}): LanternScene[] {
  const base: LanternScene[] = [
    {}, // step 2: orientation
    { readingPosition: LB.HEADING }, // step 3: Next button
    { focus: LB.PAY }, // step 4: Enter
    form(LB.CARD), // step 5: Type card number
    form(LB.CARD, V1), // step 6: Next form field
    form(LB.EXPIRY, V1), // step 7: Type
    form(LB.EXPIRY, V2), // step 8
    form(LB.CVV, V2), // step 9
    form(LB.CVV, V3), // step 10
    form(LB.NAME, V3), // step 11
    form(LB.NAME, V4), // step 12: Next button
    form(LB.SUBMIT, V4), // step 13: Next button (unnamed button heard, not a match)
    form(LB.PAY, V4), // step 14: Next button (already used)
    form(LB.SUBMIT, V4), // step 15: Enter (Full_Pass, last resort)
    modal(LB.CHECK), // step 16: Tab
    modal(LB.LEARN), // step 17: Tab
    modal(LB.CHECK), // step 18: Shift+Tab (Tab round complete)
    modal(LB.LEARN), // step 19: Shift+Tab
    modal(LB.CHECK), // step 20: Escape (Shift+Tab round complete)
  ];
  return base.map((scene) => ({ ...scene, ...overlay }));
}

/** Index of the first scene inside the modal. */
const FIRST_MODAL = 14;

function run(mission: Mission, scenes: readonly LanternScene[], opts: MindOptions = THROWING) {
  const mind = new ListenerMind(mission, opts);
  const decisions = scenes.map((scene) => mind.decide(lanternBills(scene)));
  return { mind, decisions };
}

function actionOf(decision: Decision<ListenerAction>): ListenerAction {
  if (decision.kind !== 'act') throw new Error(`Expected an action but the Mind gave up: ${decision.thought}`);
  return decision.action;
}

const ENTER: ListenerAction = { type: 'key', key: 'Enter' };
const BUTTON_JUMP: ListenerAction = { type: 'jump', to: 'button', dir: 'next' };

/** The action as the dashboard's step text starts, without the Body's key counts: `Next button`, `Type "x"`. */
function actionLabel(action: ListenerAction): string {
  switch (action.type) {
    case 'key':
      return action.key;
    case 'type':
      return `Type "${action.text}"`;
    case 'jump':
      return action.to === 'heading'
        ? 'Next heading'
        : action.to === 'button'
          ? 'Next button'
          : action.to === 'field'
            ? 'Next form field'
            : `Next ${action.to}`;
  }
}

// -- The design's expected walk, read from design.md -------------------------------------------------------------

interface DesignRow {
  from: number;
  to: number;
  action: string;
  spoken: string;
}

function designWalk(): DesignRow[] {
  const text = readFileSync(DESIGN, 'utf8').replace(/\r\n/gu, '\n');
  const start = text.indexOf('### Expected walk on Lantern Bills');
  if (start < 0) throw new Error('design.md has no "Expected walk on Lantern Bills" section');
  const end = text.indexOf('\n## ', start);
  const section = text.slice(start, end < 0 ? undefined : end);
  const rows: DesignRow[] = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*(\d+)(?:[–-](\d+))?\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/u.exec(line);
    if (m === null) continue;
    const from = Number(m[1]);
    rows.push({ from, to: m[2] === undefined ? from : Number(m[2]), action: m[3]!, spoken: m[4]! });
  }
  return rows;
}

/** `Next button (Tab ×1 or ×2)` → `Next button`; `Shift+Tab ×2` → `Shift+Tab`; `Enter (last resort)` → `Enter`. */
function baseAction(cell: string): string {
  return cell.replace(/\s*\([^)]*\)\s*$/u, '').replace(/\s*×\d+$/u, '');
}

describe('Feature: haunt-engine, The Listener Mind against the design\'s expected walk (Req 9.1–9.10)', () => {
  const rows = designWalk();

  it('reads the design\'s walk table: Steps 1 to 20, in order, with no gaps', () => {
    expect(rows[0]).toMatchObject({ from: 1, to: 1 });
    expect(rows[0]!.action).toMatch(/^Open /u);
    let expected = 1;
    for (const row of rows) {
      expect(row.from).toBe(expected);
      expected = row.to + 1;
    }
    expect(expected).toBe(21);
  });

  it('makes, Step by Step, the action the design lists', () => {
    const { decisions } = run(payBill(), walkScenes());
    expect(decisions).toHaveLength(19); // Steps 2 to 20
    for (const row of rows.filter((r) => r.from >= 2)) {
      for (let step = row.from; step <= row.to; step++) {
        const label = actionLabel(actionOf(decisions[step - 2]!));
        const cell = baseAction(row.action);
        if (cell.includes(' / ')) {
          // "Next form field / Type, …": the two alternate, starting with the first.
          const parts = cell.split(' / ');
          const part = parts[(step - row.from) % parts.length]!;
          if (part.startsWith('Type')) expect(label, `Step ${step}`).toMatch(/^Type "/u);
          else expect(label, `Step ${step}`).toBe(part);
        } else {
          expect(label, `Step ${step}`).toBe(cell);
        }
      }
    }
  });

  it('types the values the design lists for the card and the later fields', () => {
    const { decisions } = run(payBill(), walkScenes());
    expect(actionOf(decisions[3]!)).toEqual({ type: 'type', text: '4111111111111111' }); // Step 5
    expect(actionOf(decisions[5]!)).toEqual({ type: 'type', text: '11/28' }); // Step 7: expiry two years on
    expect(actionOf(decisions[7]!)).toEqual({ type: 'type', text: '123' }); // Step 9
    expect(actionOf(decisions[9]!)).toEqual({ type: 'type', text: 'Asha Kaur' }); // Step 11
  });

  it('hears what the design says was spoken before it acts on it', () => {
    const { decisions } = run(payBill(), walkScenes());
    const spoken = (step: number) => rows.find((r) => r.from <= step && step <= r.to)!.spoken;
    // Step 4 (Enter) answers what Step 3 spoke; Step 15 (Enter, last resort) answers what Step 14 spoke.
    expect(decisions[2]!.thought).toContain(`'${spoken(3)}'`);
    expect(decisions[13]!.thought).toContain(`'${spoken(14)}'`);
  });

  it('keeps the same intentions in order: open-form, the four fields, submit, confirm', () => {
    const { decisions } = run(payBill(), walkScenes());
    const ids = decisions.map((d) => (d.kind === 'act' ? d.intentionId : '(give up)'));
    expect(ids).toEqual([
      'open-form', 'open-form', 'open-form',
      'card-number',
      'expiry', 'expiry', 'cvv', 'cvv', 'name', 'name',
      'submit', 'submit', 'submit', 'submit',
      'confirm', 'confirm', 'confirm', 'confirm', 'confirm',
    ]);
  });

  it('makes the same walk when the late "Set up autopay" link is in the tree (the Tab ×1 or ×2 case)', () => {
    const plain = run(payBill(), walkScenes()).decisions;
    const withLink = run(payBill(), walkScenes({ autopay: true })).decisions;
    const summary = (ds: Decision<ListenerAction>[]) =>
      ds.map((d) => (d.kind === 'act' ? { action: d.action, id: d.intentionId } : d.kind));
    expect(summary(withLink)).toEqual(summary(plain));
  });

  it('writes the trapped Give_Up_Thought after Escape from what it heard in the dialog', () => {
    const { mind } = run(payBill(), walkScenes());
    const thought = mind.giveUpThought('trapped');
    expect(thought).toContain("'Protect your payment'");
    expect(thought).toContain("'Close dialog'");
    expect(thought).toContain("'Continue'");
    expect(thought).toContain('Escape does nothing');
  });
});

// -- Determinism (Req 9.9) ----------------------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind is deterministic (Req 9.9)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives identical Decisions, thoughts included, from two Mind instances', () => {
    const a = run(payBill(), walkScenes()).decisions;
    const b = run(payBill(), walkScenes()).decisions;
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('gives the same Decisions when two Minds take their turns one after the other', () => {
    const one = new ListenerMind(payBill(), THROWING);
    const two = new ListenerMind(payBill(), THROWING);
    const scenes = walkScenes();
    const first: Decision<ListenerAction>[] = [];
    const second: Decision<ListenerAction>[] = [];
    for (const scene of scenes) {
      first.push(one.decide(lanternBills(scene)));
      second.push(two.decide(lanternBills(scene)));
    }
    expect(second).toEqual(first);
    expect(two.giveUpThought('trapped')).toBe(one.giveUpThought('trapped'));
  });

  it('gives the same Decisions for a Mind created at a different time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-02-03T04:05:06Z'));
    const early = run(payBill(), walkScenes()).decisions;
    vi.setSystemTime(new Date('2031-11-30T23:59:59Z'));
    const late = run(payBill(), walkScenes()).decisions;
    expect(late).toEqual(early);
  });

  it('reads no clock and no random number: nothing is called while it decides', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random was called');
    });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now was called');
    });
    // The options' rng throws as well (see THROWING).
    const { decisions } = run(payBill(), walkScenes());
    expect(decisions).toHaveLength(19);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('gives the same Decisions with the Punjabi language order, run twice', () => {
    const a = run(payBill(), walkScenes(), PUNJABI).decisions;
    const b = run(payBill(), walkScenes(), PUNJABI).decisions;
    expect(b).toEqual(a);
  });
});

// -- No unnamed button: give up with no_match (Req 9.6, 9.7) -----------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind without an unnamed button (Req 9.6, 9.7)', () => {
  /** The walk up to the first button jump after the last field (Step 12), with the given submit button. */
  const upToSubmitSearch = (overlay: Overlay) => walkScenes(overlay).slice(0, 11);

  it('gives up with no_match after a Full_Pass when the submit button has a name that does not match', () => {
    const scenes = [
      ...upToSubmitSearch({ submitName: 'Go' }),
      form(LB.SUBMIT, V4), // "Go, button": not a submit pattern
      form(LB.PAY, V4), // "Pay this bill": used
      form(LB.SUBMIT, V4), // back on a button it reached: Full_Pass
    ].map((scene, i) => (i < 11 ? scene : { ...scene, submitName: 'Go' }));
    const { mind, decisions } = run(payBill(), scenes);

    expect(decisions.slice(10, 13).map(actionOf)).toEqual([BUTTON_JUMP, BUTTON_JUMP, BUTTON_JUMP]);
    const last = decisions[13]!;
    expect(last.kind).toBe('give_up');
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
    // It never pressed Enter on the button called "Go" or on the one it had used.
    expect(decisions.slice(10).some((d) => d.kind === 'act' && d.action.type === 'key')).toBe(false);

    // The Give_Up_Thought is the Mind's own memory of the pass: the buttons it went through, by name.
    expect(last.thought).toBe(mind.giveUpThought('no_match'));
    expect(last.thought).toContain('every button I could reach on this page');
    expect(last.thought).toContain("'Go'");
    expect(last.thought).toContain("'Pay this bill'");
    expect(last.thought).not.toContain('with no name');
    expect(last.thought).toContain("I'm giving up");
  });

  it('writes the Give_Up_Thought from memory: another button name gives another sentence, and no memory gives a different one', () => {
    const giveUpWith = (name: string): string => {
      const scenes = [
        ...upToSubmitSearch({ submitName: name }),
        form(LB.SUBMIT, V4),
        form(LB.PAY, V4),
        form(LB.SUBMIT, V4),
      ].map((scene, i) => (i < 11 ? scene : { ...scene, submitName: name }));
      const { mind, decisions } = run(payBill(), scenes);
      expect(decisions[13]!.kind).toBe('give_up');
      return mind.giveUpThought('no_match');
    };
    const go = giveUpWith('Go');
    const proceed = giveUpWith('Proceed');
    expect(proceed).toContain("'Proceed'");
    expect(proceed).not.toContain("'Go'");
    expect(go).not.toBe(proceed);

    const fresh = new ListenerMind(payBill(), THROWING).giveUpThought('no_match');
    expect(fresh).not.toContain("'Pay this bill'");
    expect(fresh).not.toBe(go);
  });

  it('gives up with no_match when the form has no button at all, after the button jumps come back to Pay this bill', () => {
    const none = { submitName: null } as const;
    const scenes = [
      ...upToSubmitSearch(none),
      form(LB.PAY, V4), // the only button on the page
      form(LB.PAY, V4), // again: Full_Pass
    ].map((scene, i) => (i < 11 ? scene : { ...scene, ...none }));
    const { mind, decisions } = run(payBill(), scenes);

    expect(actionOf(decisions[10]!)).toEqual(BUTTON_JUMP);
    expect(actionOf(decisions[11]!)).toEqual(BUTTON_JUMP);
    const last = decisions[12]!;
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
    expect(last.thought).toBe(mind.giveUpThought('no_match'));
    expect(last.thought).toContain("'Pay this bill'");
    expect(last.thought).toContain('none of them sounded like what I was looking for');
    expect(last.thought).not.toContain('with no name');
  });

  it('gives up with no_match when the button jump finds no button at all', () => {
    const none = { submitName: null } as const;
    // Focus stays on the last field: the jump found nothing of its kind.
    const scenes = [...upToSubmitSearch(none), { ...form(LB.NAME, V4), ...none }];
    const { mind, decisions } = run(payBill(), scenes);
    expect(actionOf(decisions[10]!)).toEqual(BUTTON_JUMP);
    const last = decisions[11]!;
    expect(last.kind === 'give_up' && last.reason).toBe('no_match');
    expect(last.thought).toBe(mind.giveUpThought('no_match'));
  });

  it('control: with the unnamed button in the tree, the same sequence reaches the last-resort Enter (Step 15)', () => {
    const { decisions } = run(payBill(), walkScenes());
    expect(actionOf(decisions[13]!)).toEqual(ENTER);
  });
});

// -- A Continue button that Tab reaches ---------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind when Tab reaches Continue (Req 9.4, 9.1)', () => {
  const reachable = (): LanternScene[] => [
    ...walkScenes().slice(0, FIRST_MODAL),
    modal(LB.CHECK), // dialog opens on the checkbox
    modal(LB.LEARN),
    modal(LB.CONTINUE), // Tab reaches Continue
  ];

  it('presses Enter on Continue for the "confirm" Intention, in the first Tab round', () => {
    const { decisions } = run(payBill(), reachable());
    expect(decisions.slice(FIRST_MODAL).map(actionOf)).toEqual([{ type: 'key', key: 'Tab' }, { type: 'key', key: 'Tab' }, ENTER]);
    const last = decisions[decisions.length - 1]!;
    expect(last.kind === 'act' && last.intentionId).toBe('confirm');
    expect(last.thought).toContain("'Continue, button'");
    expect(last.thought).toContain('press Enter');
  });

  it('never decides the Run is a success by itself: the confirm Intention stays current (doneWhen "success")', () => {
    const { mind, decisions } = run(payBill(), reachable());
    expect(decisions.every((d) => d.kind === 'act')).toBe(true);

    // The same modal is heard again: Continue was used, so it is not pressed twice.
    const again = mind.decide(lanternBills(modal(LB.CONTINUE)));
    expect(again.kind === 'act' && again.action).not.toEqual(ENTER);

    // The confirmation page arrives: the Mind orients on the new page and still works on "confirm".
    const confirmation = heard(
      [
        { ref: 'ax-1', role: 'RootWebArea', name: 'Lantern Bills - Payment received', depth: 0 },
        { ref: 'ax-3', role: 'heading', name: 'Payment received', level: 1 },
      ],
      { path: '/confirmation' },
    );
    expect(actionOf(mind.decide(confirmation))).toEqual({ type: 'jump', to: 'heading', dir: 'next' });
    mind.decide(confirmation);
    expect(mind.memory.seeking?.id).toBe('confirm');
  });
});

// -- The Punjabi site ---------------------------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind on the Punjabi site (Req 9.5)', () => {
  // The names of demo-site/public/locales/pa/translation.json. "Pay this bill" stays English on the real site.
  const PA_NAMES: Record<string, string> = {
    [LB.ROOT]: 'ਲੈਂਟਰਨ ਬਿੱਲ - ਆਪਣਾ ਬਿਜਲੀ ਬਿੱਲ ਭਰੋ',
    [LB.HEADING]: 'ਤੁਹਾਡਾ ਬਿਜਲੀ ਬਿੱਲ',
    [LB.AUTOPAY]: 'ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ',
    [LB.REGION]: 'ਭੁਗਤਾਨ ਜਾਣਕਾਰੀ',
    [LB.CARD]: 'ਕਾਰਡ ਨੰਬਰ',
    [LB.EXPIRY]: 'ਮਿਆਦ ਪੁੱਗਣ ਦੀ ਤਾਰੀਖ',
    [LB.CVV]: 'CVV',
    [LB.NAME]: 'ਕਾਰਡਧਾਰਕ ਦਾ ਨਾਮ',
    [LB.DIALOG]: 'ਆਪਣੇ ਭੁਗਤਾਨ ਦੀ ਰੱਖਿਆ ਕਰੋ',
    [LB.CLOSE]: 'ਡਾਇਲਾਗ ਬੰਦ ਕਰੋ',
    [LB.CHECK]: '₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ',
    [LB.LEARN]: 'ਹੋਰ ਜਾਣੋ',
    [LB.CONTINUE]: 'ਜਾਰੀ ਰੱਖੋ',
  };
  const paScenes = (): LanternScene[] => walkScenes({ names: PA_NAMES });
  const summary = (ds: Decision<ListenerAction>[]) =>
    ds.map((d) => (d.kind === 'act' ? { action: d.action, id: d.intentionId } : d.kind));

  it('makes the same walk as in English, with Pay this bill found through the English fallback', () => {
    const english = run(payBill(), walkScenes(), PUNJABI).decisions;
    const punjabi = run(payBill(), paScenes(), PUNJABI).decisions;
    expect(summary(punjabi)).toEqual(summary(english));
    expect(actionOf(punjabi[2]!)).toEqual(ENTER);
    expect(punjabi[2]!.thought).toContain("'Pay this bill, button'");
    expect(actionOf(punjabi[3]!)).toEqual({ type: 'type', text: '4111111111111111' });
    expect(punjabi[3]!.thought).toContain("'ਕਾਰਡ ਨੰਬਰ, edit text, required'");
  });

  it('also finds the English names when it is given the Punjabi language order', () => {
    const english = run(payBill(), walkScenes(), { ...THROWING, languages: ['en'] }).decisions;
    const fallback = run(payBill(), walkScenes(), PUNJABI).decisions;
    expect(summary(fallback)).toEqual(summary(english));
  });

  it('does not find the Punjabi field labels with English patterns only', () => {
    const { decisions } = run(payBill(), paScenes(), { ...THROWING, languages: ['en'] });
    // "ਕਾਰਡ ਨੰਬਰ" is not "card number" to an English pattern, so the form never counts as open and the Mind
    // keeps looking for the button that starts paying instead of typing (Step 5).
    const step5 = decisions[3]!;
    expect(actionOf(step5)).toEqual(BUTTON_JUMP);
    expect(step5.kind === 'act' && step5.intentionId).toBe('open-form');
  });

  it('writes the trapped Give_Up_Thought with the Punjabi names it heard', () => {
    const { mind, decisions } = run(payBill(), paScenes(), PUNJABI);
    expect(actionOf(decisions[18]!)).toEqual({ type: 'key', key: 'Escape' });
    const thought = mind.giveUpThought('trapped');
    expect(thought).toContain("'ਆਪਣੇ ਭੁਗਤਾਨ ਦੀ ਰੱਖਿਆ ਕਰੋ'");
    expect(thought).toContain("'ਹੋਰ ਜਾਣੋ'");
    expect(thought).toContain("'ਡਾਇਲਾਗ ਬੰਦ ਕਰੋ'");
    expect(thought).toContain("'ਜਾਰੀ ਰੱਖੋ'");
  });

  it('presses Enter on the Punjabi Continue button when Tab reaches it', () => {
    const scenes = [
      ...paScenes().slice(0, FIRST_MODAL),
      { ...modal(LB.CHECK), names: PA_NAMES },
      { ...modal(LB.LEARN), names: PA_NAMES },
      { ...modal(LB.CONTINUE), names: PA_NAMES },
    ];
    const { decisions } = run(payBill(), scenes, PUNJABI);
    const last = decisions[decisions.length - 1]!;
    expect(actionOf(last)).toEqual(ENTER);
    expect(last.kind === 'act' && last.intentionId).toBe('confirm');
  });
});

// -- The Mind sees only a Heard (design principle 1) ----------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind takes a Heard and nothing else (Req 9.9)', () => {
  it('has a decide function that takes one argument, a Heard', () => {
    const mind = new ListenerMind(payBill(), THROWING);
    expect(mind.decide.length).toBe(1);
    expectTypeOf<Parameters<ListenerMind['decide']>>().toEqualTypeOf<[Heard]>();
    expectTypeOf<ReturnType<ListenerMind['decide']>>().toEqualTypeOf<Decision<ListenerAction>>();
  });

  it('is not given anything else: a second argument is a type error and changes nothing', () => {
    const plain = new ListenerMind(payBill(), THROWING);
    const probed = new ListenerMind(payBill(), THROWING);
    const probe = { trace: { keys: [] }, findings: [] };
    const scenes = walkScenes();
    for (const scene of scenes) {
      const a = plain.decide(lanternBills(scene));
      // @ts-expect-error decide takes a Heard and nothing else
      const b = probed.decide(lanternBills(scene), probe);
      expect(b).toEqual(a);
    }
  });

  it('does not import or name a Probe, a StepTrace, a DetectorContext or a Finding in its code', () => {
    for (const file of ['mind.ts', 'thoughts.ts']) {
      const source = readFileSync(path.join(ENGINE_ROOT, 'src', 'ghosts', 'listener', file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
      expect(code, file).not.toMatch(/\b(Probe|StepTrace|DetectorContext|Finding|Recorder)\b/u);
      const modules = [...code.matchAll(/from\s+'([^']+)'/gu)].map((m) => m[1]!);
      for (const module of modules) {
        expect(module, `${file} imports ${module}`).not.toMatch(/detectors|recorder|runLoop|finalize|writer|playwright/u);
      }
    }
  });
});

// -- Intentions are the Mission's, and are not changed ---------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind leaves the Mission alone (Req 9.1)', () => {
  function deepFreeze<T>(value: T): T {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) deepFreeze(inner);
    }
    return value;
  }

  it('runs the whole walk on a frozen Mission without changing it', () => {
    const mission = deepFreeze(payBill());
    const before = JSON.stringify(mission);
    const { decisions } = run(mission, walkScenes());
    expect(decisions).toHaveLength(19);
    expect(JSON.stringify(mission)).toBe(before);
  });

  it('does not change the Mission when it gives up', () => {
    const mission = deepFreeze(payBill());
    const before = JSON.stringify(mission);
    const scenes = [...walkScenes({ submitName: 'Go' }).slice(0, 11), { ...form(LB.SUBMIT, V4), submitName: 'Go' }];
    const { mind } = run(mission, scenes);
    mind.giveUpThought('no_match');
    mind.giveUpThought('trapped');
    mind.giveUpThought('step_limit');
    expect(JSON.stringify(mission)).toBe(before);
  });
});

// -- A second page (Req 9.10) ----------------------------------------------------------------------------------------

describe('Feature: haunt-engine, The Listener Mind on a second page (Req 9.10)', () => {
  /** The autopay page: the Mind only has to hear where it is. */
  const autopayPage = (focus: string | null): Heard =>
    heard(
      [
        { ref: 'ax-1', role: 'RootWebArea', name: 'Lantern Bills - Set up autopay', depth: 0 },
        { ref: 'ax-3', role: 'heading', name: 'Set up autopay', level: 1 },
        { ref: 'ax-8', role: 'link', name: 'Back to bill' },
      ],
      { path: '/autopay', focus },
    );
  const HEADING_JUMP: ListenerAction = { type: 'jump', to: 'heading', dir: 'next' };

  it('jumps to the next heading when the path changes to /autopay, and again when it changes back', () => {
    const mind = new ListenerMind(payBill(), THROWING);
    const scenes = walkScenes();
    mind.decide(lanternBills(scenes[0]!)); // Step 2: orientation on '/'
    mind.decide(lanternBills(scenes[1]!)); // Step 3
    mind.decide(lanternBills(scenes[2]!)); // Step 4: Enter on Pay this bill

    const arrived = mind.decide(autopayPage(null));
    expect(actionOf(arrived)).toEqual(HEADING_JUMP);
    expect(arrived.thought).toContain('page has changed');

    // Still on /autopay: no second orientation, the Mind goes back to searching for its target.
    expect(actionOf(mind.decide(autopayPage(null)))).toEqual(BUTTON_JUMP);

    // Back on '/': another orientation. The Mind does not press anything on the way.
    const back = mind.decide(lanternBills({ focus: LB.PAY }));
    expect(actionOf(back)).toEqual(HEADING_JUMP);
    // Pay this bill was used for "open-form", so it is not pressed again.
    expect(actionOf(mind.decide(lanternBills({ focus: LB.PAY })))).toEqual(BUTTON_JUMP);
  });

  it('does not try to get back to the bill: the "Back to bill" link is never pressed or looked for', () => {
    const mind = new ListenerMind(payBill(), THROWING);
    const scenes = walkScenes();
    for (const scene of scenes.slice(0, 3)) mind.decide(lanternBills(scene));
    const onAutopay = [mind.decide(autopayPage(null)), mind.decide(autopayPage(null)), mind.decide(autopayPage('ax-8'))];
    for (const decision of onAutopay) {
      if (decision.kind === 'act') {
        // Only the orientation jump and the search for its own target; no Enter, Space, Escape or Shift+Tab.
        expect([HEADING_JUMP, BUTTON_JUMP]).toContainEqual(decision.action);
      }
      expect(decision.thought).not.toMatch(/back to (the )?bill/iu);
    }
  });
});
