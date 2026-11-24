import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFocusTrapDetector, listenerStopRule } from '../src/detectors/focusTrap.ts';
import { playHistory, type FakeStep } from './helpers/fakeTrapContext.ts';
import {
  describeElementTrap,
  findElementTraps,
  type TrapCandidate,
  type TrapElementInfo,
  type TrapEvent,
  type TrapResolution,
} from '../src/detectors/elementTrap.ts';

/** Builds events one Step at a time. */
class History {
  readonly events: TrapEvent[] = [];
  private step = 0;
  focus(focusKey: string | null): this {
    this.step += 1;
    this.events.push({ step: this.step, kind: 'focus', key: '', focusKey, dialogKey: null });
    return this;
  }
  press(key: string, focusKey: string | null): this {
    this.step += 1;
    this.events.push({ step: this.step, kind: 'key', key, focusKey, dialogKey: null });
    return this;
  }
}

type Ending = 'none' | 'escape_stay' | 'escape_free' | 'escape_free_second';

/** One element's streak: focus read, Tab stay, Shift+Tab stay, then an ending. Focus ends on `filler`. */
function segment(h: History, el: string, filler: string, ending: Ending, extraTabs: number): void {
  h.focus(el);
  for (let i = 0; i < extraTabs; i += 1) h.press('Tab', el);
  h.press('Tab', el).press('Shift+Tab', el);
  switch (ending) {
    case 'none':
      h.press('Enter', filler);
      break;
    case 'escape_stay':
      h.press('Escape', el).press('Escape', el).press('Enter', filler);
      break;
    case 'escape_free':
      h.press('Escape', el).press('Escape', filler);
      break;
    case 'escape_free_second':
      h.press('Escape', filler).press('Escape', filler);
      break;
  }
}

const endings = fc.constantFrom<Ending>('none', 'escape_stay', 'escape_free', 'escape_free_second');

describe('Feature: memos-real-world-haunt, Property 4: One qualified trap per stuck element', () => {
  it('returns exactly one candidate for each stuck element and none for the others', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ ending: endings, extraTabs: fc.integer({ min: 0, max: 3 }), stuck: fc.boolean() }), { minLength: 1, maxLength: 6 }),
        (specs) => {
          const h = new History();
          const expected: string[] = [];
          specs.forEach((spec, i) => {
            const el = `el-${i}`;
            const filler = `link-${i}`;
            if (spec.stuck) {
              segment(h, el, filler, spec.ending, spec.extraTabs);
              expected.push(el);
            } else {
              // Only Tab leaves focus on the element: it never qualifies.
              h.focus(el).press('Tab', el).press('Tab', el).press('Enter', filler);
            }
          });
          const found = findElementTraps(h.events);
          expect(found.map((c) => c.elementKey)).toEqual(expected);
          expect(new Set(found.map((c) => c.elementKey)).size).toBe(found.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('gives the resolution that matches the way Escape pressed twice ended', () => {
    const cases: [Ending, TrapResolution][] = [
      ['none', 'open'],
      ['escape_stay', 'not_freed_by_double_escape'],
      ['escape_free', 'freed_by_double_escape'],
      ['escape_free_second', 'freed_by_double_escape'],
    ];
    for (const [ending, resolution] of cases) {
      const h = new History();
      segment(h, 'box', 'link', ending, 0);
      const [candidate] = findElementTraps(h.events);
      expect(candidate?.resolution).toBe(resolution);
    }
  });

  it('ignores events inside a dialog', () => {
    const events: TrapEvent[] = [
      { step: 1, kind: 'focus', key: '', focusKey: 'a', dialogKey: 'd' },
      { step: 2, kind: 'key', key: 'Tab', focusKey: 'a', dialogKey: 'd' },
      { step: 3, kind: 'key', key: 'Shift+Tab', focusKey: 'a', dialogKey: 'd' },
    ];
    expect(findElementTraps(events)).toEqual([]);
  });
});

describe('Feature: memos-real-world-haunt, Property 5: Only a Tab or Shift+Tab that moves focus away clears the element', () => {
  const tails = fc.array(
    fc.constantFrom<'esc_stay' | 'esc_move' | 'enter_stay' | 'esc_pair_move' | 'esc_pair_stay'>(
      'esc_stay',
      'esc_move',
      'enter_stay',
      'esc_pair_move',
      'esc_pair_stay',
    ),
    { maxLength: 4 },
  );

  it('keeps the candidate whatever Escape does, once or twice, and whatever else is pressed', () => {
    fc.assert(
      fc.property(tails, (tail) => {
        const h = new History();
        h.focus('box').press('Tab', 'box').press('Shift+Tab', 'box');
        // Every tail item keeps focus on the box at its end, or moves it away for good with the last item.
        tail.forEach((item, i) => {
          const last = i === tail.length - 1;
          if (item === 'esc_stay') h.press('Escape', 'box');
          else if (item === 'enter_stay') h.press('Enter', 'box');
          else if (item === 'esc_pair_stay') h.press('Escape', 'box').press('Escape', 'box');
          else if (item === 'esc_move') h.press('Escape', last ? 'other' : 'box');
          else h.press('Escape', 'box').press('Escape', last ? 'other' : 'box');
        });
        const found = findElementTraps(h.events);
        expect(found.map((c) => c.elementKey)).toEqual(['box']);
      }),
      { numRuns: 100 },
    );
  });

  it('removes the candidate when a Tab or Shift+Tab made on the element lands on another element', () => {
    fc.assert(
      fc.property(fc.constantFrom('Tab', 'Shift+Tab'), fc.boolean(), tails, (key, before, tail) => {
        const h = new History();
        if (before) h.focus('box').press(key, 'other').focus('box');
        else h.focus('box');
        h.press('Tab', 'box').press('Shift+Tab', 'box');
        if (!before) h.press(key, 'other');
        for (const item of tail) {
          if (item.startsWith('esc')) h.press('Escape', 'other');
        }
        expect(findElementTraps(h.events)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

const safeWord = fc
  .string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABC123'.split('')) })
  .filter((s) => s.trim() !== '' && !/dialog|modal|pop-?up/i.test(s));

describe('Feature: memos-real-world-haunt, Property 6: Element trap evidence states what was tried and what happened', () => {
  const candidate = fc
    .record({
      tabs: fc.integer({ min: 1, max: 5 }),
      shifts: fc.integer({ min: 1, max: 5 }),
      escapes: fc.integer({ min: 0, max: 3 }),
      resolution: fc.constantFrom<TrapResolution>('freed_by_double_escape', 'not_freed_by_double_escape', 'open'),
    })
    .map(({ tabs, shifts, escapes, resolution }): TrapCandidate => {
      const stayKeys: Record<string, number> = { Tab: tabs, 'Shift+Tab': shifts };
      if (escapes > 0) stayKeys['Escape'] = escapes;
      return { elementKey: 'e', firstStayStep: 2, qualifiedStep: 3, stayKeys, resolution, resolutionStep: 5 };
    });

  const info = fc.record({
    present: fc.boolean(),
    textbox: fc.constant(true),
    role: fc.constantFrom('textbox', 'searchbox', 'combobox'),
    name: fc.oneof(fc.constant(null), fc.constant(''), safeWord),
    escapeDocumented: fc.boolean(),
  }) as fc.Arbitrary<TrapElementInfo>;

  it('names the element, the keys with counts, and what moved focus', () => {
    fc.assert(
      fc.property(candidate, info, fc.array(safeWord, { maxLength: 3 }), (c, i, announcements) => {
        const { title, evidence } = describeElementTrap(c, i, announcements);
        expect(`${title} ${evidence}`).not.toMatch(/dialog|modal|pop-?up/i);
        expect(evidence).toContain(`role ${i.role}`);
        if (i.name === null) expect(evidence).toContain('accessible name could not be read');
        else if (i.name === '') expect(evidence).toContain('a text box with no name');
        else expect(evidence).toContain(`the text box "${i.name}"`);

        const n = (k: string): number => c.stayKeys[k] ?? 0;
        expect(evidence).toContain(`Tab (${n('Tab')} ${n('Tab') === 1 ? 'press' : 'presses'})`);
        expect(evidence).toContain(`Shift+Tab (${n('Shift+Tab')} ${n('Shift+Tab') === 1 ? 'press' : 'presses'})`);
        if (n('Escape') > 0) expect(evidence).toContain(`Escape (${n('Escape')} ${n('Escape') === 1 ? 'press' : 'presses'})`);

        if (c.resolution === 'freed_by_double_escape') {
          expect(evidence).toContain('Escape pressed twice did free focus');
          if (i.escapeDocumented) expect(evidence).toContain('The page does mention that Escape works');
          else expect(evidence).toContain('This exit is undocumented');
        } else if (c.resolution === 'not_freed_by_double_escape') {
          expect(evidence).toContain('Escape pressed twice did not move focus either');
        } else {
          expect(evidence).toContain('No key moved focus before the run ended');
        }

        if (announcements.length === 0) expect(evidence).toContain('Nothing was announced while focus was stuck.');
        else expect(evidence).toContain(`The screen reader announced "${announcements[0]}".`);
      }),
      { numRuns: 100 },
    );
  });

  it('puts the parts in order', () => {
    const c: TrapCandidate = {
      elementKey: 'e',
      firstStayStep: 2,
      qualifiedStep: 3,
      stayKeys: { Tab: 1, 'Shift+Tab': 1 },
      resolution: 'freed_by_double_escape',
      resolutionStep: 5,
    };
    const { evidence } = describeElementTrap(c, { present: true, textbox: true, role: 'textbox', name: '', escapeDocumented: false }, []);
    const order = ['Keyboard focus could not leave', 'left focus on it', 'did free focus', 'undocumented', 'Nothing was announced'].map((s) => evidence.indexOf(s));
    expect(order.every((p) => p >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('Feature: memos-real-world-haunt, Property 16: A double Escape exit still gives the finding and the stop', () => {
  /** A key press and where focus is after it. */
  type Press = { key: string; focusKey: string };

  const scenario = fc.record({
    extraTabs: fc.integer({ min: 0, max: 3 }),
    noise: fc.integer({ min: 0, max: 2 }),
    exit: fc.constantFrom<'first' | 'second'>('first', 'second'),
    pairInOneStep: fc.boolean(),
    cuts: fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
  });

  it('records one focus_trap at the Step of the second Escape and the stop rule ends the run as trapped', async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ extraTabs, noise, exit, pairInOneStep, cuts }) => {
        const presses: Press[] = [];
        for (let i = 0; i < extraTabs + 1; i += 1) presses.push({ key: 'Tab', focusKey: 'box' });
        presses.push({ key: 'Shift+Tab', focusKey: 'box' });
        for (let i = 0; i < noise; i += 1) presses.push({ key: 'Enter', focusKey: 'box' });
        const lead = presses.length;
        presses.push({ key: 'Escape', focusKey: exit === 'first' ? 'other' : 'box' });
        presses.push({ key: 'Escape', focusKey: 'other' });

        // Split the presses into Steps. The two Escape presses share a Step, or have one each.
        const steps: FakeStep[] = [{ keys: [], focus: { focusKey: 'box', dialogKey: null } }];
        let currentKeys: FakeStep['keys'] = [];
        const flush = (): void => {
          if (currentKeys.length === 0) return;
          const last = currentKeys[currentKeys.length - 1]!;
          steps.push({ keys: currentKeys, focus: { focusKey: last.focusKey, dialogKey: null } });
          currentKeys = [];
        };
        presses.forEach((p, i) => {
          currentKeys.push({ key: p.key, focusKey: p.focusKey, dialogKey: null });
          const isFirstEscape = i === lead;
          const cut = i < lead ? (cuts[i] ?? false) : isFirstEscape ? !pairInOneStep : true;
          if (i === lead && pairInOneStep) {
            // keep the pair together
          } else if (cut) flush();
        });
        flush();
        const secondEscapeStep = steps.length;

        const detector = createFocusTrapDetector();
        const { observed } = await playHistory(detector, steps, { textbox: { role: 'textbox', name: '' } });
        const all = observed.flat();
        expect(all).toHaveLength(1);
        expect(all[0]!.stepN).toBe(secondEscapeStep);
        expect(observed[secondEscapeStep - 1]).toHaveLength(1);
        expect(all[0]!.evidence).toContain('Escape pressed twice did free focus');
        expect(all[0]!.evidence).toContain('This exit is undocumented');
        expect(all[0]!.title).toBe('Keyboard focus is trapped in a text box');
        const reason = listenerStopRule({ steps: [], findingCounts: { focus_trap: all.length }, mission: undefined as never });
        expect(reason).toBe('trapped');
      }),
      { numRuns: 100 },
    );
  });
});
