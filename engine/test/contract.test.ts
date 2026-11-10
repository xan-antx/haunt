import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_STEPS, validate, validateInvariants } from '../src/contract/invariants.ts';
import { validateSchema } from '../src/contract/schema.ts';
import type { Problem, Run, Step } from '../src/contract/types.ts';

/**
 * Unit tests for the Run_Schema (src/contract/schema.ts) and the Run_Invariants
 * (src/contract/invariants.ts).
 * Requirements 3.2, 3.3, 3.4.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sampleRunFiles(): string[] {
  const samplesDir = path.join(REPO_ROOT, 'runs', 'samples');
  return readdirSync(samplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(samplesDir, entry.name, 'run.json'))
    .filter((file) => existsSync(file));
}

/** A run shaped like the engine's own output: Run_Id with time, ghost and mission, 3 Steps, 1 Finding. */
function makeRun(): Run {
  const step = (n: number, extra: Partial<Step> = {}): Step => ({
    n,
    page: '/bill',
    action: 'Tab',
    spoken: 'Link, Lantern Bills home',
    thought: `I am on step ${n} and looking for the pay button.`,
    screenshot: `shots/${String(n).padStart(3, '0')}.png`,
    waitMs: 120,
    ...extra,
  });
  return {
    formatVersion: 1,
    runId: '2026-11-20T0000Z-listener-pay-bill',
    ghost: 'listener',
    mission: {
      id: 'pay-bill',
      goal: "Pay this month's electricity bill",
      requirement: 'WHEN the user submits a valid payment THE system SHALL show a confirmation',
      successCheck: "The page shows the text 'Payment received'",
    },
    site: { name: 'Lantern Bills demo', url: 'http://localhost:3000', commit: 'abc1234' },
    startedAt: '2026-11-20T00:00:05Z',
    result: 'gave_up',
    steps: [
      step(1, { focusBox: { x: 40, y: 18, w: 120, h: 32 } }),
      step(2),
      step(3, { focusBox: { x: 10, y: 20, w: 30, h: 40 } }),
    ],
    findings: [
      {
        type: 'unlabeled_button',
        step: 3,
        title: 'The pay button has no name',
        evidence: "The screen reader only says 'button'",
        screenshot: 'shots/003-seen.png',
      },
    ],
  };
}

const SHOTS = ['shots/001.png', 'shots/002.png', 'shots/003.png', 'shots/003-seen.png'];

/** Copy of the valid run with a change applied. */
function derive(change: (run: Run) => void): Run {
  const run = makeRun();
  change(run);
  return run;
}

function stepAt(run: Run, i: number): Step {
  const step = run.steps[i];
  if (!step) throw new Error(`test run has no step at index ${i}`);
  return step;
}

/** Writes a field the type does not allow, to build an invalid copy. */
function setField(target: object, key: string, value: unknown): void {
  (target as Record<string, unknown>)[key] = value;
}

function paths(problems: Problem[]): string[] {
  return problems.map((p) => p.path);
}

describe('Run_Schema', () => {
  describe('accepts the contract examples', () => {
    it('accepts contract/example-run.json', () => {
      const example = readJson(path.join(REPO_ROOT, 'contract', 'example-run.json'));
      expect(validateSchema(example)).toEqual([]);
    });

    it('finds at least one sample under runs/samples/', () => {
      expect(sampleRunFiles().length).toBeGreaterThan(0);
    });

    it('accepts every runs/samples/*/run.json', () => {
      for (const file of sampleRunFiles()) {
        const problems = validateSchema(readJson(file));
        expect(problems, `${file}: ${JSON.stringify(problems)}`).toEqual([]);
      }
    });

    it('accepts a valid engine-style run', () => {
      expect(validateSchema(makeRun())).toEqual([]);
    });
  });

  describe('rejects invalid copies with a problem at the right path', () => {
    it('rejects ghost "poltergeist"', () => {
      const run = derive((r) => setField(r, 'ghost', 'poltergeist'));
      expect(paths(validateSchema(run))).toContain('ghost');
    });

    it('rejects result "success"', () => {
      const run = derive((r) => setField(r, 'result', 'success'));
      expect(paths(validateSchema(run))).toContain('result');
    });

    it('rejects finding type "keyboard_trap"', () => {
      const run = derive((r) => setField(r.findings[0]!, 'type', 'keyboard_trap'));
      expect(paths(validateSchema(run))).toContain('findings[0].type');
    });

    it('rejects an extra top-level field', () => {
      const run = derive((r) => setField(r, 'mood', 'spooky'));
      expect(paths(validateSchema(run))).toContain('mood');
    });

    it('rejects an extra step field', () => {
      const run = derive((r) => setField(stepAt(r, 1), 'extra', true));
      expect(paths(validateSchema(run))).toContain('steps[1].extra');
    });

    it('rejects empty steps', () => {
      const run = derive((r) => {
        r.steps = [];
      });
      expect(paths(validateSchema(run))).toContain('steps');
    });

    it('rejects n: 0', () => {
      const run = derive((r) => {
        stepAt(r, 0).n = 0;
      });
      expect(paths(validateSchema(run))).toContain('steps[0].n');
    });

    it('rejects a negative waitMs', () => {
      const run = derive((r) => {
        stepAt(r, 2).waitMs = -1;
      });
      expect(paths(validateSchema(run))).toContain('steps[2].waitMs');
    });

    it('rejects a missing required field and names it', () => {
      const run = derive((r) => {
        delete (r as unknown as Record<string, unknown>)['site'];
      });
      expect(paths(validateSchema(run))).toContain('site');
    });

    it('rejects values that are not objects without throwing', () => {
      for (const value of [null, 42, 'run', [], undefined]) {
        expect(validateSchema(value).length).toBeGreaterThan(0);
      }
    });
  });
});

describe('Run_Invariants', () => {
  it('control: a valid engine-style run passes validate() with no problems', () => {
    expect(validate(makeRun(), SHOTS)).toEqual([]);
  });

  it('control: the same run passes with a screenshot size that contains every focusBox', () => {
    expect(validate(makeRun(), SHOTS, { screenshotSize: { width: 1280, height: 720 } })).toEqual([]);
  });

  describe('step numbers', () => {
    it('reports a gap in the step numbers', () => {
      const run = derive((r) => {
        stepAt(r, 1).n = 3; // numbers become 1, 3, 3
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[1].n');
    });

    it('reports steps that do not start at 1', () => {
      const run = derive((r) => {
        r.steps.forEach((s, i) => {
          s.n = i + 2;
        });
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[0].n');
    });

    it('reports more than 60 steps, and accepts exactly 60', () => {
      const withSteps = (count: number): { run: Run; shots: string[] } => {
        const base = makeRun();
        const first = stepAt(base, 0);
        base.steps = Array.from({ length: count }, (_, i) => ({
          ...first,
          n: i + 1,
          screenshot: `shots/${String(i + 1).padStart(3, '0')}.png`,
        }));
        base.steps.forEach((s) => {
          delete s.focusBox;
        });
        base.findings = [];
        return { run: base, shots: base.steps.map((s) => s.screenshot) };
      };
      expect(MAX_STEPS).toBe(60);

      const ok = withSteps(60);
      expect(validateInvariants(ok.run, ok.shots)).toEqual([]);

      const tooMany = withSteps(61);
      expect(paths(validateInvariants(tooMany.run, tooMany.shots))).toContain('steps');
    });
  });

  describe('findings', () => {
    it('reports a finding that refers to a missing step', () => {
      const run = derive((r) => {
        r.findings[0]!.step = 9;
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('findings[0].step');
    });

    it('reports step 0 as a missing step', () => {
      const run = derive((r) => {
        r.findings[0]!.step = 0;
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('findings[0].step');
    });
  });

  describe('screenshots', () => {
    it('reports a bad step screenshot name', () => {
      for (const bad of ['shots/1.png', 'shots/001.jpg', 'screens/001.png', '/shots/001.png', 'shots/001-seen.png.png']) {
        const run = derive((r) => {
          stepAt(r, 0).screenshot = bad;
        });
        expect(paths(validateInvariants(run, [...SHOTS, bad])), bad).toContain('steps[0].screenshot');
      }
    });

    it('reports a bad finding screenshot name', () => {
      const run = derive((r) => {
        r.findings[0]!.screenshot = 'shot-3.png';
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('findings[0].screenshot');
    });

    it('reports a step screenshot that is not in the set to be written', () => {
      const run = makeRun();
      const without = SHOTS.filter((name) => name !== 'shots/002.png');
      const problems = validateInvariants(run, without);
      expect(paths(problems)).toContain('steps[1].screenshot');
      expect(problems.find((p) => p.path === 'steps[1].screenshot')?.message).toContain('not among the screenshots');
    });

    it('reports a finding screenshot that is not in the set to be written', () => {
      const run = makeRun();
      const without = SHOTS.filter((name) => name !== 'shots/003-seen.png');
      expect(paths(validateInvariants(run, without))).toContain('findings[0].screenshot');
    });

    it('reports a step screenshot that does not match its n', () => {
      const run = derive((r) => {
        stepAt(r, 1).screenshot = 'shots/001.png'; // a listed, well-formed name, but for step 1
      });
      const problems = validateInvariants(run, SHOTS);
      expect(paths(problems)).toContain('steps[1].screenshot');
      expect(problems.find((p) => p.path === 'steps[1].screenshot')?.message).toContain('shots/002.png');
    });

    it('reports a step that uses a -seen screenshot', () => {
      const run = derive((r) => {
        stepAt(r, 2).screenshot = 'shots/003-seen.png';
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[2].screenshot');
    });

    it('accepts a finding that uses a plain step screenshot or a -seen one', () => {
      const plain = derive((r) => {
        r.findings[0]!.screenshot = 'shots/003.png';
      });
      expect(validateInvariants(plain, SHOTS)).toEqual([]);
      expect(validateInvariants(makeRun(), SHOTS)).toEqual([]);
    });
  });

  describe('Run_Id', () => {
    const runIdProblems = (run: Run): Problem[] => validateInvariants(run, SHOTS).filter((p) => p.path === 'runId');

    it('accepts the plain Run_Id', () => {
      expect(runIdProblems(makeRun())).toEqual([]);
    });

    it('reports a bad format', () => {
      for (const bad of [
        '2026-11-20-listener-pay-bill', // date-only, as in the hand-written example
        '2026-11-20T0000-listener-pay-bill', // no Z
        '2026-11-20T0000Z-ghost-pay-bill', // unknown ghost
        '2026-11-20T0000Z-listener-Pay-Bill', // upper case
        '2026-11-20T0000Z-listener-',
        'nonsense',
      ]) {
        const run = derive((r) => {
          r.runId = bad;
        });
        expect(runIdProblems(run).length, bad).toBeGreaterThan(0);
      }
    });

    it('reports a ghost that differs from the ghost field', () => {
      const run = derive((r) => {
        r.runId = '2026-11-20T0000Z-phantom-pay-bill';
      });
      const problems = runIdProblems(run);
      expect(problems).toHaveLength(1);
      expect(problems[0]!.message).toContain('ghost');
    });

    it('reports a time that differs from startedAt to the minute', () => {
      const run = derive((r) => {
        r.runId = '2026-11-20T0001Z-listener-pay-bill';
      });
      const problems = runIdProblems(run);
      expect(problems).toHaveLength(1);
      expect(problems[0]!.message).toContain('startedAt');
    });

    it('ignores the seconds of startedAt when comparing times', () => {
      const run = derive((r) => {
        r.startedAt = '2026-11-20T00:00:59Z';
      });
      expect(runIdProblems(run)).toEqual([]);
    });

    it('reports a mission that differs from mission.id', () => {
      const run = derive((r) => {
        r.runId = '2026-11-20T0000Z-listener-check-balance';
      });
      const problems = runIdProblems(run);
      expect(problems).toHaveLength(1);
      expect(problems[0]!.message).toContain('mission');
    });

    it('accepts a -2 suffix and larger numeric suffixes', () => {
      for (const suffix of ['-2', '-3', '-10']) {
        const run = derive((r) => {
          r.runId = `2026-11-20T0000Z-listener-pay-bill${suffix}`;
        });
        expect(runIdProblems(run), suffix).toEqual([]);
      }
    });

    it('reports a suffix that is not a number from 2 up', () => {
      for (const suffix of ['-1', '-0', '-x', '-02a']) {
        const run = derive((r) => {
          r.runId = `2026-11-20T0000Z-listener-pay-bill${suffix}`;
        });
        expect(runIdProblems(run).length, suffix).toBeGreaterThan(0);
      }
    });

    it('accepts a mission id that itself ends in digits', () => {
      const run = derive((r) => {
        r.mission.id = 'step-2';
        r.runId = '2026-11-20T0000Z-listener-step-2';
      });
      expect(runIdProblems(run)).toEqual([]);
    });
  });

  describe('startedAt', () => {
    const startedAtProblems = (value: string): Problem[] => {
      const run = derive((r) => {
        r.startedAt = value;
        r.runId = '2026-11-20T0000Z-listener-pay-bill';
      });
      return validateInvariants(run, SHOTS).filter((p) => p.path === 'startedAt');
    };

    it('accepts UTC seconds format', () => {
      expect(startedAtProblems('2026-11-20T00:00:05Z')).toEqual([]);
    });

    it('reports other formats the schema allows', () => {
      for (const bad of [
        '2026-11-20T00:00Z', // no seconds
        '2026-11-20T00:00:05.123Z', // milliseconds
        '2026-11-20T00:00:05+00:00', // offset instead of Z
        '2026-11-20T05:30:05+05:30', // not UTC
      ]) {
        expect(startedAtProblems(bad).length, bad).toBe(1);
      }
    });

    it('reports a date or time that does not exist', () => {
      for (const bad of ['2026-02-30T00:00:05Z', '2026-13-01T00:00:05Z', '2026-11-20T24:00:05Z', '2026-11-20T00:60:05Z']) {
        expect(startedAtProblems(bad).length, bad).toBe(1);
      }
    });

    it('passes the schema for a non-UTC startedAt, so only the invariant catches it', () => {
      const run = derive((r) => {
        r.startedAt = '2026-11-20T00:00:05+00:00';
      });
      expect(validateSchema(run)).toEqual([]);
      expect(paths(validate(run, SHOTS))).toContain('startedAt');
    });
  });

  describe('thoughts', () => {
    it('reports an empty thought', () => {
      const run = derive((r) => {
        stepAt(r, 1).thought = '';
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[1].thought');
    });

    it('reports a thought that is only whitespace', () => {
      const run = derive((r) => {
        stepAt(r, 0).thought = ' \t\n ';
      });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[0].thought');
    });
  });

  describe('focusBox', () => {
    const withBox = (box: { x: number; y: number; w: number; h: number }): Run =>
      derive((r) => {
        stepAt(r, 1).focusBox = box;
      });

    it('reports a zero width', () => {
      const run = withBox({ x: 10, y: 10, w: 0, h: 20 });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[1].focusBox.w');
    });

    it('reports a zero height', () => {
      const run = withBox({ x: 10, y: 10, w: 20, h: 0 });
      expect(paths(validateInvariants(run, SHOTS))).toContain('steps[1].focusBox.h');
    });

    it('reports a negative size', () => {
      const run = withBox({ x: 10, y: 10, w: -5, h: -5 });
      expect(paths(validateInvariants(run, SHOTS))).toEqual(
        expect.arrayContaining(['steps[1].focusBox.w', 'steps[1].focusBox.h']),
      );
    });

    it('reports a zero-sized focusBox when the screenshot size is given too', () => {
      const run = withBox({ x: 10, y: 10, w: 0, h: 0 });
      const problems = validateInvariants(run, SHOTS, { screenshotSize: { width: 100, height: 100 } });
      expect(paths(problems)).toEqual(expect.arrayContaining(['steps[1].focusBox.w', 'steps[1].focusBox.h']));
    });

    it('accepts a focusBox of any position when no screenshot size is given', () => {
      const run = withBox({ x: 5000, y: 5000, w: 10, h: 10 });
      expect(validateInvariants(run, SHOTS)).toEqual([]);
    });

    it('reports a focusBox outside the screenshot when the size is given', () => {
      const size = { screenshotSize: { width: 100, height: 100 } };
      const outside = [
        { x: 95, y: 10, w: 10, h: 10 }, // past the right edge
        { x: 10, y: 95, w: 10, h: 10 }, // past the bottom edge
        { x: -1, y: 10, w: 10, h: 10 }, // left of the screenshot
        { x: 10, y: -1, w: 10, h: 10 }, // above the screenshot
        { x: 500, y: 500, w: 10, h: 10 }, // far away
      ];
      for (const box of outside) {
        const problems = validateInvariants(withBox(box), SHOTS, size);
        expect(paths(problems), JSON.stringify(box)).toContain('steps[1].focusBox');
      }
    });

    it('accepts a focusBox that touches the edges of the screenshot', () => {
      // 200x200 also contains the boxes of Steps 1 and 3 in the base run.
      const run = withBox({ x: 0, y: 0, w: 200, h: 200 });
      expect(validateInvariants(run, SHOTS, { screenshotSize: { width: 200, height: 200 } })).toEqual([]);
    });

    it('accepts a step without a focusBox', () => {
      const run = derive((r) => {
        delete stepAt(r, 0).focusBox;
      });
      expect(validateInvariants(run, SHOTS, { screenshotSize: { width: 100, height: 100 } })).toEqual([]);
    });
  });

  describe('robustness', () => {
    it('does not throw on values of the wrong type', () => {
      const broken: unknown[] = [
        null,
        undefined,
        42,
        'run',
        [],
        {},
        { runId: 5, ghost: [], mission: 'x', startedAt: {}, steps: 'nope', findings: 7 },
        { steps: [null, 1, 'a', { n: 'x', thought: 5, screenshot: 9, focusBox: 'box' }], findings: [null, {}] },
      ];
      for (const value of broken) {
        expect(() => validate(value, SHOTS)).not.toThrow();
        expect(() => validateInvariants(value, SHOTS)).not.toThrow();
      }
    });

    it('validate() reports schema problems and invariant problems together', () => {
      const run = derive((r) => {
        setField(r, 'result', 'success');
        stepAt(r, 0).thought = '';
      });
      expect(paths(validate(run, SHOTS))).toEqual(expect.arrayContaining(['result', 'steps[0].thought']));
    });
  });
});
