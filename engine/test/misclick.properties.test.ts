import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import { runLoop, type RunLoopOutcome } from '../src/core/runLoop.ts';
import type { ActionResult, Decision, Probe, StepTrace } from '../src/core/types.ts';
import { createMisclickDetector } from '../src/detectors/misclick.ts';
import { MISCLICK_STREAK_LIMIT, misclickStreak, phantomStopRule } from '../src/ghosts/phantom/stopRule.ts';
import type { Mission } from '../src/missions/loadMission.ts';

/**
 * Feature: haunt-engine, Property 7: Two misclicks in a row end the Run exactly then
 * **Validates: Requirements 16.2, 20.2**
 *
 * Generated sequences of Steps (correct clicks, misclicks, recovery clicks that hit or miss, clicks
 * that could not be measured, and Steps that are not clicks) across one or more Intentions are played
 * through the real `runLoop` with The Phantom's stop rule, a real Recorder and the real `misclick`
 * Detector. An independent oracle, written from the glossary's Misclick_Streak and Requirement 16.2,
 * gives the streak after every Step. The Run must end with `gave_up` / `misclicks` exactly at the first
 * Step where the oracle's streak reaches 2, and otherwise go on until the script runs out. No browser
 * is started.
 */

const RUNS = { numRuns: 200 };

/** What one scripted Step is. */
type Kind =
  | 'correct' //         click on the Intention's target that landed on it
  | 'misclick' //        click on the Intention's target that landed elsewhere
  | 'recovery-hit' //    recovery click that landed where it aimed
  | 'recovery-miss' //   recovery click that landed elsewhere
  | 'unmeasured-hit' //  click whose hit element is unknown (click log lost)
  | 'unmeasured-aim' //  click whose aimed element is unknown (no element key under the Seen_Item)
  | 'wait'
  | 'type'
  | 'scroll'
  | 'back';

interface Entry {
  kind: Kind;
  intentionId: string;
}

const KINDS: readonly Kind[] = [
  'correct',
  'misclick',
  'recovery-hit',
  'recovery-miss',
  'unmeasured-hit',
  'unmeasured-aim',
  'wait',
  'type',
  'scroll',
  'back',
];

const INTENTIONS = ['find-bill', 'pay', 'confirm'] as const;

/** Misclicks are drawn more often so that many Runs reach the limit and many do not. */
const kindArb: fc.Arbitrary<Kind> = fc.oneof(
  { arbitrary: fc.constant<Kind>('misclick'), weight: 4 },
  { arbitrary: fc.constant<Kind>('correct'), weight: 2 },
  { arbitrary: fc.constantFrom<Kind>('recovery-hit', 'recovery-miss'), weight: 2 },
  { arbitrary: fc.constantFrom<Kind>('unmeasured-hit', 'unmeasured-aim'), weight: 1 },
  { arbitrary: fc.constantFrom<Kind>('wait', 'type', 'scroll', 'back'), weight: 2 },
);

/** One to three Intentions per Run; consecutive Steps tend to stay on the same Intention. */
const scriptArb: fc.Arbitrary<Entry[]> = fc
  .integer({ min: 1, max: INTENTIONS.length })
  .chain((count) =>
    fc.array(
      fc.record({
        kind: kindArb,
        intentionId: fc.constantFrom(...INTENTIONS.slice(0, count)),
        stay: fc.boolean(),
      }),
      { minLength: 0, maxLength: 40 },
    ),
  )
  .map((raw) => {
    const out: Entry[] = [];
    for (const r of raw) {
      const prev = out[out.length - 1];
      out.push({ kind: r.kind, intentionId: r.stay && prev ? prev.intentionId : r.intentionId });
    }
    return out;
  });

// ---------------------------------------------------------------------------------------------------
// The oracle, written from the requirements and not from `stopRule.ts`.
//
// Misclick_Streak: misclicks in a row while trying the same Intention, without a correct click on
// that Intention in between. Recovery clicks do not reset it; a correct click resets it to 0.
// Unmeasured clicks are neither a misclick nor a correct click; Steps that are not clicks do not count.
// ---------------------------------------------------------------------------------------------------

/** The oracle's streak after Step 1 (the opening) and after each scripted Step, in Step order. */
function oracleStreaks(script: readonly Entry[]): number[] {
  const streaks = [0];
  let streak = 0;
  let intention: string | undefined;
  for (const entry of script) {
    if (entry.intentionId !== intention) {
      intention = entry.intentionId;
      streak = 0;
    }
    if (entry.kind === 'misclick') streak += 1;
    else if (entry.kind === 'correct') streak = 0;
    streaks.push(streak);
  }
  return streaks;
}

/** The Step number (1-based) at which the Run must end with `misclicks`, or `null`. */
function oracleStopStep(script: readonly Entry[]): number | null {
  const index = oracleStreaks(script).findIndex((s) => s >= 2);
  return index === -1 ? null : index + 1;
}

// ---------------------------------------------------------------------------------------------------
// The harness: a scripted Body and Mind around the real run loop.
// ---------------------------------------------------------------------------------------------------

const mission: Mission = {
  id: 'pay-bill',
  site: 'lantern-bills',
  goal: 'Pay this month’s electricity bill',
  requirement: 'a requirement',
  successCheck: { text: 'The confirmation is visible', visible: '[data-haunt="payment-success"]' },
  intentions: [],
};

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: [] } },
};

/** The Probe of every Perception: the Seen_Item `s1` covers the element `k1`. */
const PROBE: Probe = { at: 1000, itemKeys: { s1: 'k1' } };

function clickFor(kind: Kind): { aimedItem: string; hitKey: string | null } | undefined {
  switch (kind) {
    case 'correct':
    case 'recovery-hit':
      return { aimedItem: 's1', hitKey: 'k1' };
    case 'misclick':
    case 'recovery-miss':
      return { aimedItem: 's1', hitKey: 'k2' };
    case 'unmeasured-hit':
      return { aimedItem: 's1', hitKey: null };
    case 'unmeasured-aim':
      return { aimedItem: 's9', hitKey: 'k1' };
    default:
      return undefined;
  }
}

function traceFor(kind?: Kind): StepTrace {
  const t: StepTrace = {
    pathBefore: '/',
    pathAfter: '/',
    keys: kind === 'type' ? [{ key: 'a', focusKey: 'k3', dialogKey: null }] : [],
    touchedKeys: [],
    actionEndedAt: 0,
    readyAt: 0,
    waits: [],
    announcements: [],
  };
  const click = kind ? clickFor(kind) : undefined;
  if (click) {
    t.click = {
      aimed: { x: 16, y: 170, w: 132, h: 48 },
      point: { x: 82, y: 194 },
      hitKey: click.hitKey,
      at: 2000,
      aimedItem: click.aimedItem,
    };
  }
  return t;
}

function resultFor(kind?: Kind): ActionResult {
  return {
    actionText: kind ?? 'open',
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: traceFor(kind),
  };
}

/** Plays the script through the real run loop; the Mind gives up with `no_match` when it runs out. */
async function play(script: readonly Entry[]): Promise<{ outcome: RunLoopOutcome; recorder: Recorder }> {
  const recorder = new Recorder({ width: 360, height: 640, deviceScaleFactor: 2 });
  const detectors = new DetectorRunner({
    detectors: [createMisclickDetector()],
    page: { evaluate: async () => undefined } as never,
    cdp: { send: async () => ({}) } as never,
    config,
    site: config.sites['lantern-bills']!,
    recorder,
  });
  let next = 0;
  const outcome = await runLoop<number, Entry>({
    body: {
      open: async () => resultFor(),
      perceive: async () => ({ perception: next, probe: PROBE }),
      act: async (entry) => resultFor(entry.kind),
    },
    mind: {
      decide: (i): Decision<Entry> => {
        const entry = script[i];
        next = i + 1;
        if (entry === undefined) return { kind: 'give_up', reason: 'no_match', thought: 'Nothing left to try.' };
        return {
          kind: 'act',
          action: entry,
          thought: entry.kind,
          intentionId: entry.intentionId,
          recovery: entry.kind.startsWith('recovery'),
        };
      },
      giveUpThought: (reason) => `I gave up (${reason}).`,
    },
    stopRule: phantomStopRule,
    detectors,
    recorder,
    mission,
    url: 'http://127.0.0.1:3000/',
    checkSuccess: async () => false,
  });
  return { outcome, recorder };
}

describe('Feature: haunt-engine, Property 7: Two misclicks in a row end the Run exactly then', () => {
  it('ends the Run at the limit of 2', () => {
    expect(MISCLICK_STREAK_LIMIT).toBe(2);
  });

  it('the Run ends with misclicks exactly at the first Step where the streak reaches 2, and not before', async () => {
    await fc.assert(
      fc.asyncProperty(scriptArb, async (script) => {
        const { outcome, recorder } = await play(script);
        const stopAt = oracleStopStep(script);
        const expectedStreaks = oracleStreaks(script);
        const steps = recorder.steps;

        if (stopAt !== null) {
          expect(outcome).toEqual({ result: 'gave_up', reason: 'misclicks' });
          expect(steps).toHaveLength(stopAt);
        } else {
          expect(outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
          expect(steps).toHaveLength(script.length + 1);
        }

        // The recorded Steps are the script's, with their Intentions, in order.
        steps.forEach((s, k) => {
          expect(s.step.n).toBe(k + 1);
          if (k === 0) {
            expect(s.intention).toBeUndefined();
          } else {
            const entry = script[k - 1]!;
            expect(s.intention).toEqual({
              intentionId: entry.intentionId,
              recovery: entry.kind.startsWith('recovery'),
            });
          }
        });

        // After every recorded Step, misclickStreak agrees with the oracle; it is below 2 before the last.
        for (let k = 1; k <= steps.length; k++) {
          expect(misclickStreak(steps.slice(0, k))).toBe(expectedStreaks[k - 1]);
        }
        for (let k = 1; k < steps.length; k++) {
          expect(misclickStreak(steps.slice(0, k))).toBeLessThan(MISCLICK_STREAK_LIMIT);
        }

        // The Give_Up_Thought names the reason on the last Step.
        expect(recorder.last!.step.thought.endsWith(`I gave up (${outcome.reason}).`)).toBe(true);
      }),
      {
        ...RUNS,
        examples: [
          [[]],
          [[{ kind: 'misclick', intentionId: 'pay' }, { kind: 'misclick', intentionId: 'pay' }]],
          [[{ kind: 'misclick', intentionId: 'pay' }, { kind: 'recovery-hit', intentionId: 'pay' }, { kind: 'misclick', intentionId: 'pay' }]],
          [[{ kind: 'misclick', intentionId: 'pay' }, { kind: 'correct', intentionId: 'pay' }, { kind: 'misclick', intentionId: 'pay' }]],
          [[{ kind: 'misclick', intentionId: 'find-bill' }, { kind: 'misclick', intentionId: 'pay' }]],
          [[{ kind: 'misclick', intentionId: 'pay' }, { kind: 'wait', intentionId: 'pay' }, { kind: 'unmeasured-aim', intentionId: 'pay' }, { kind: 'recovery-miss', intentionId: 'pay' }, { kind: 'misclick', intentionId: 'pay' }]],
        ],
      },
    );
  });
});
