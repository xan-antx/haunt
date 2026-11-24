import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDialogTrapDetector, createFocusTrapDetector } from '../src/detectors/focusTrap.ts';
import { playHistory, type FakeStep } from './helpers/fakeTrapContext.ts';

/**
 * The combined `focus_trap` Detector gives the same Findings as the dialog part alone on histories
 * that are about dialogs, including histories where focus stays on one element inside the dialog.
 */

const KEYS = ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'ArrowDown'];

const pressArb = fc.record({
  key: fc.constantFrom(...KEYS),
  /** Inside the dialog: one of three controls. Otherwise: outside it. */
  where: fc.constantFrom('a', 'b', 'c', 'a', 'a', 'out'),
});

const historyArb = fc.record({
  steps: fc.array(fc.array(pressArb, { maxLength: 4 }), { minLength: 1, maxLength: 10 }),
  open: fc.boolean(),
  focusInside: fc.boolean(),
  unreached: fc.array(fc.constantFrom('x', 'y', 'z'), { maxLength: 3 }),
});

describe('Feature: memos-real-world-haunt, Property 7: Dialog histories give the same findings as before', () => {
  it('gives the same problems at every Step and at the end', async () => {
    await fc.assert(
      fc.asyncProperty(historyArb, async ({ steps, open, focusInside, unreached }) => {
        let outside = 0;
        const fakeSteps: FakeStep[] = steps.map((presses) => {
          const keys = presses.map((p) => {
            // Outside the dialog every press lands on a new element, so no text box is ever stuck.
            if (p.where === 'out') {
              outside += 1;
              return { key: p.key, focusKey: `out-${outside}`, dialogKey: null };
            }
            return { key: p.key, focusKey: p.where, dialogKey: 'dlg' };
          });
          const last = keys[keys.length - 1];
          return { keys, focus: last ? { focusKey: last.focusKey, dialogKey: last.dialogKey } : { focusKey: 'a', dialogKey: 'dlg' } };
        });
        // The first Step has no key press: focus starts inside the dialog.
        fakeSteps.unshift({ keys: [], focus: { focusKey: 'a', dialogKey: 'dlg' } });

        const dialog = (arg: { dialogKey: string; reached: string[]; describe: string[] }): unknown => ({
          open,
          focusInside,
          dialogName: 'Protect your payment',
          described: arg.describe.map((key) => ({ key, name: `Control ${key}`, role: 'button' })),
          unreached: unreached.map((key) => ({ key, name: `Hidden ${key}`, role: 'button', reason: 'tabindex="-1"' })),
        });

        const before = await playHistory(createDialogTrapDetector(), fakeSteps, { dialog });
        const after = await playHistory(createFocusTrapDetector(), fakeSteps, { dialog });
        expect(after.observed).toEqual(before.observed);
        expect(after.finished).toEqual(before.finished);
      }),
      { numRuns: 100 },
    );
  });

  it('is not vacuous: some generated history gives a dialog finding', async () => {
    const steps: FakeStep[] = [
      { keys: [], focus: { focusKey: 'a', dialogKey: 'dlg' } },
      { keys: [{ key: 'Tab', focusKey: 'b', dialogKey: 'dlg' }, { key: 'Tab', focusKey: 'a', dialogKey: 'dlg' }], focus: { focusKey: 'a', dialogKey: 'dlg' } },
      { keys: [{ key: 'Shift+Tab', focusKey: 'b', dialogKey: 'dlg' }, { key: 'Shift+Tab', focusKey: 'a', dialogKey: 'dlg' }], focus: { focusKey: 'a', dialogKey: 'dlg' } },
      { keys: [{ key: 'Escape', focusKey: 'a', dialogKey: 'dlg' }], focus: { focusKey: 'a', dialogKey: 'dlg' } },
    ];
    const dialog = (arg: { describe: string[] }): unknown => ({
      open: true,
      focusInside: true,
      dialogName: 'D',
      described: arg.describe.map((key) => ({ key, name: key, role: 'button' })),
      unreached: [{ key: 'x', name: 'X', role: 'button', reason: 'tabindex="-1"' }],
    });
    const result = await playHistory(createFocusTrapDetector(), steps, { dialog });
    expect(result.observed.flat()).toHaveLength(1);
    expect(result.observed.flat()[0]!.title).toBe('Keyboard focus is trapped in a dialog');
  });
});
