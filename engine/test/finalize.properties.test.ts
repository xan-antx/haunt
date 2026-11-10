import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatProblem, validate } from '../src/contract/invariants.ts';
import type { FindingType, GhostId, RunResult } from '../src/contract/types.ts';
import { finalizeRun, formatStartedAt } from '../src/core/finalize.ts';
import type { FindingInput } from '../src/core/finalize.ts';
import { Recorder } from '../src/core/recorder.ts';
import { folderExistsIn, formatRunId, makeRunId } from '../src/core/runId.ts';
import type { Box, RecorderViewport, StepTrace } from '../src/core/types.ts';
import { InvalidRunError, writeRunFolder } from '../src/core/writer.ts';

/**
 * Feature: haunt-engine, Property 1: Saved runs always pass the schema and the invariants
 * **Validates: Requirements 3.4, 3.5, 3.6, 12.1, 20.1**
 *
 * Every case builds a Run with the real Recorder, finalizeRun and writeRunFolder, in a fresh
 * temporary folder. Some cases are built to be invalid (a Finding that points at a Step that
 * does not exist, a `seen` screenshot that was never taken, Step 0, an empty thought, a Run_Id
 * that does not match the run, more than 60 Steps).
 *
 * - When a Run_Folder is written, its run.json read back from disk passes validate() against the
 *   files that are really on disk, and those files are exactly the referenced screenshots.
 * - When finalizeRun reports problems, writeRunFolder refuses, the out folder is unchanged and no
 *   temporary folder is left.
 */

const RUNS = { numRuns: 150 };

const PROFILES: Record<GhostId, RecorderViewport> = {
  listener: { width: 1280, height: 800, deviceScaleFactor: 1 },
  phantom: { width: 360, height: 640, deviceScaleFactor: 2 },
  bebe: { width: 640, height: 400, deviceScaleFactor: 2 },
};

const FINDING_TYPES: FindingType[] = [
  'unlabeled_button',
  'focus_trap',
  'unannounced_error',
  'slow_wait',
  'misclick',
  'cut_off_text',
  'untranslated',
  'dark_pattern',
];

type FindingKind = 'valid_step' | 'valid_seen' | 'missing_step' | 'seen_without_shot' | 'step_zero';
type RunIdMode = 'ok' | 'wrong_ghost' | 'wrong_mission' | 'wrong_time' | 'garbage';

interface StepSpec {
  focusBox: Box | null;
  actionEndedAt: number;
  readyAt: number;
  hasSeen: boolean;
  thought: string;
  page: string;
  action: string;
  spoken: string;
}

interface FindingSpec {
  kind: FindingKind;
  pick: number;
  type: FindingType;
  title: string;
  evidence: string;
}

interface Case {
  ghost: GhostId;
  steps: StepSpec[];
  findings: FindingSpec[];
  badThoughtAt: number | null;
  runIdMode: RunIdMode;
  collide: boolean;
  priorNames: string[];
  priorBase: boolean;
  result: RunResult;
  siteKey: string;
  siteName: string;
  siteUrl: string;
  startedAtMs: number;
  commit: string;
  missionId: string;
  goal: string;
  requirement: string;
  successText: string;
}

// ---------------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------------

const ghostArb = fc.constantFrom<GhostId>('listener', 'phantom', 'bebe');
const text = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.constantFrom('ਬਿੱਲ ਭਰੋ', 'Pay ₹2,490.00', 'बिल भरें', 'Pay this bill, button'),
);
const nonBlankText = text.map((t) => (t.trim() === '' ? 'I look around the page.' : t));
const blankText = fc.constantFrom('', '   ', '\n\t ');

const num = (min: number, max: number) => fc.integer({ min, max });
const dbl = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

/** Boxes in CSS px: none, zero-area, negative, NaN, outside, partly outside, inside, fractional. */
function boxArb(vp: RecorderViewport): fc.Arbitrary<Box | null> {
  const { width: vw, height: vh } = vp;
  return fc.oneof(
    { weight: 2, arbitrary: fc.constant(null) },
    {
      weight: 2,
      arbitrary: fc.record({ x: num(0, vw), y: num(0, vh), w: fc.constant(0), h: num(0, 50) }),
    },
    {
      weight: 1,
      arbitrary: fc.record({ x: num(0, vw), y: num(0, vh), w: num(1, 50), h: fc.constant(0) }),
    },
    { weight: 1, arbitrary: fc.constant<Box>({ x: 10, y: 10, w: -5, h: 20 }) },
    { weight: 1, arbitrary: fc.constant<Box>({ x: Number.NaN, y: 10, w: 5, h: 20 }) },
    {
      // Entirely to the right of, or below, the viewport.
      weight: 2,
      arbitrary: fc.record({ x: num(vw, vw + 200), y: num(0, vh), w: num(1, 100), h: num(1, 100) }),
    },
    {
      // Entirely above or to the left of the viewport.
      weight: 2,
      arbitrary: fc
        .record({ w: num(1, 100), h: num(1, 100), gx: num(0, 50), gy: num(0, 50) })
        .map(({ w, h, gx, gy }) => ({ x: -w - gx, y: -h - gy, w, h })),
    },
    {
      // Partly outside, with fractional values.
      weight: 4,
      arbitrary: fc.record({
        x: dbl(-100, vw + 100),
        y: dbl(-100, vh + 100),
        w: dbl(0.5, vw + 100),
        h: dbl(0.5, vh + 100),
      }),
    },
    {
      weight: 4,
      arbitrary: fc
        .record({ x: num(0, vw - 1), y: num(0, vh - 1), fw: dbl(0, 1), fh: dbl(0, 1) })
        .map(({ x, y, fw, fh }) => ({
          x,
          y,
          w: Math.max(1, Math.floor((vw - x) * fw)),
          h: Math.max(1, Math.floor((vh - y) * fh)),
        })),
    },
  );
}

function stepArb(vp: RecorderViewport): fc.Arbitrary<StepSpec> {
  return fc.record({
    focusBox: boxArb(vp),
    actionEndedAt: fc.oneof(dbl(0, 100_000), fc.constant(Number.NaN)),
    readyAt: fc.oneof(dbl(-100, 100_000), fc.constant(Number.NaN)),
    hasSeen: fc.boolean(),
    thought: nonBlankText,
    page: fc.constantFrom('/', '/autopay', '/confirmation'),
    action: text,
    spoken: text,
  });
}

const findingArb: fc.Arbitrary<FindingSpec> = fc.record({
  kind: fc.oneof(
    { weight: 6, arbitrary: fc.constant<FindingKind>('valid_step') },
    { weight: 4, arbitrary: fc.constant<FindingKind>('valid_seen') },
    { weight: 1, arbitrary: fc.constant<FindingKind>('missing_step') },
    { weight: 1, arbitrary: fc.constant<FindingKind>('seen_without_shot') },
    { weight: 1, arbitrary: fc.constant<FindingKind>('step_zero') },
  ),
  pick: fc.nat({ max: 5000 }),
  type: fc.constantFrom(...FINDING_TYPES),
  title: text,
  evidence: text,
});

const siteUrlArb = fc
  .record({
    scheme: fc.constantFrom('http', 'https', 'HTTP'),
    host: fc.constantFrom('localhost', '127.0.0.1', 'LOCALHOST', 'Example.test'),
    port: fc.constantFrom('', ':3000', ':8080', ':80'),
    path: fc.constantFrom('', '/', '/app', '/app/', '/a/b'),
    query: fc.constantFrom('', '?x=1', '?lang=pa'),
  })
  .map(({ scheme, host, port, path: p, query }) => `${scheme}://${host}${port}${p}${query}`);

const missionIdArb = fc.stringMatching(/^[a-z0-9]{1,8}(-[a-z0-9]{1,8}){0,2}$/);
const siteKeyArb = fc.stringMatching(/^[a-z][a-z0-9]{0,8}(-[a-z0-9]{1,6}){0,2}$/);

const startedAtArb = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31, 23, 59, 59) });

const stepCountArb = fc.oneof(
  { weight: 30, arbitrary: fc.integer({ min: 1, max: 60 }) },
  { weight: 1, arbitrary: fc.constant(61) },
);

const caseArb: fc.Arbitrary<Case> = fc.tuple(ghostArb, stepCountArb).chain(([ghost, count]) =>
  fc.record({
    ghost: fc.constant(ghost),
    steps: fc.array(stepArb(PROFILES[ghost]), { minLength: count, maxLength: count }),
    findings: fc.array(findingArb, { maxLength: 6 }),
    badThoughtAt: fc.oneof(
      { weight: 12, arbitrary: fc.constant<number | null>(null) },
      { weight: 1, arbitrary: fc.nat({ max: 1000 }) },
    ),
    runIdMode: fc.oneof(
      { weight: 12, arbitrary: fc.constant<RunIdMode>('ok') },
      { weight: 1, arbitrary: fc.constant<RunIdMode>('wrong_ghost') },
      { weight: 1, arbitrary: fc.constant<RunIdMode>('wrong_mission') },
      { weight: 1, arbitrary: fc.constant<RunIdMode>('wrong_time') },
      { weight: 1, arbitrary: fc.constant<RunIdMode>('garbage') },
    ),
    collide: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
    priorNames: fc.uniqueArray(
      fc.constantFrom('2020-01-01T0000Z-listener-old', '2020-01-02T0000Z-phantom-old', '2020-01-03T0000Z-bebe-old'),
      { maxLength: 3 },
    ),
    priorBase: fc.boolean(),
    result: fc.constantFrom<RunResult>('succeeded', 'gave_up', 'error'),
    siteKey: siteKeyArb,
    siteName: fc.string({ minLength: 1, maxLength: 20 }),
    siteUrl: siteUrlArb,
    startedAtMs: startedAtArb,
    commit: fc.oneof(fc.constant('unknown'), fc.stringMatching(/^[0-9a-f]{7}$/)),
    missionId: missionIdArb,
    goal: text,
    requirement: text,
    successText: text,
  }),
);

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A tiny buffer that starts like a PNG and records which Step and kind it belongs to. */
function tinyPng(n: number, kind: 0 | 1): Buffer {
  return Buffer.from([...PNG_SIGNATURE, n & 0xff, kind]);
}

function traceFor(spec: StepSpec): StepTrace {
  return {
    pathBefore: spec.page,
    pathAfter: spec.page,
    keys: [],
    touchedKeys: [],
    actionEndedAt: spec.actionEndedAt,
    readyAt: spec.readyAt,
    waits: [],
    announcements: [],
  };
}

interface ResolvedFinding {
  input: FindingInput;
  bad: boolean;
}

function resolveFindings(specs: FindingSpec[], steps: StepSpec[]): ResolvedFinding[] {
  const count = steps.length;
  const withSeen: number[] = [];
  const withoutSeen: number[] = [];
  steps.forEach((s, i) => (s.hasSeen ? withSeen : withoutSeen).push(i + 1));

  return specs.map((spec): ResolvedFinding => {
    const base = { type: spec.type, title: spec.title, evidence: spec.evidence };
    const missing = (): ResolvedFinding => ({
      input: {
        ...base,
        stepN: spec.pick % 3 === 0 ? 1000 + spec.pick : count + 1 + (spec.pick % 50),
        screenshot: spec.pick % 2 === 0 ? 'step' : 'seen',
      },
      bad: true,
    });
    const validStep = (): ResolvedFinding => ({
      input: { ...base, stepN: 1 + (spec.pick % count), screenshot: 'step' },
      bad: false,
    });

    switch (spec.kind) {
      case 'valid_step':
        return validStep();
      case 'valid_seen':
        if (withSeen.length === 0) return validStep();
        return { input: { ...base, stepN: withSeen[spec.pick % withSeen.length]!, screenshot: 'seen' }, bad: false };
      case 'missing_step':
        return missing();
      case 'seen_without_shot':
        if (withoutSeen.length === 0) return missing();
        return { input: { ...base, stepN: withoutSeen[spec.pick % withoutSeen.length]!, screenshot: 'seen' }, bad: true };
      case 'step_zero':
        return { input: { ...base, stepN: 0, screenshot: 'step' }, bad: true };
    }
  });
}

/** Every file under `root` with a hash of its content, plus every folder. Sorted. */
async function snapshot(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries) {
    const full = path.join(entry.parentPath, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      lines.push(`dir  ${rel}`);
    } else {
      const hash = createHash('sha1').update(await readFile(full)).digest('hex');
      lines.push(`file ${rel} ${(await stat(full)).size} ${hash}`);
    }
  }
  return lines.sort();
}

async function childNames(folder: string): Promise<string[]> {
  return existsSync(folder) ? (await readdir(folder)).sort() : [];
}

// ---------------------------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------------------------

describe('Feature: haunt-engine, Property 1: Saved runs always pass the schema and the invariants', () => {
  it(
    'a written Run_Folder passes validate() against the files on disk; a rejected run leaves the out folder unchanged',
    async () => {
      let written = 0;
      let rejectedInvalid = 0;
      let rejectedCollision = 0;

      await fc.assert(
        fc.asyncProperty(caseArb, async (c) => {
          const outRoot = await mkdtemp(path.join(tmpdir(), 'haunt-finalize-'));
          try {
            const vp = PROFILES[c.ghost];
            const screenshotSize = { width: vp.width * vp.deviceScaleFactor, height: vp.height * vp.deviceScaleFactor };
            const siteFolder = path.join(outRoot, c.siteKey);
            const startedAt = new Date(c.startedAtMs);

            // Record the Steps with the real Recorder.
            const recorder = new Recorder(vp);
            c.steps.forEach((spec, i) => {
              const n = i + 1;
              const thought = c.badThoughtAt !== null && c.badThoughtAt % c.steps.length === i ? '   ' : spec.thought;
              recorder.add(
                {
                  actionText: spec.action,
                  spoken: spec.spoken,
                  focusBox: spec.focusBox,
                  trace: traceFor(spec),
                  screenshot: tinyPng(n, 0),
                  ...(spec.hasSeen ? { seenScreenshot: tinyPng(n, 1) } : {}),
                },
                thought,
              );
            });

            // Folders that already exist in the out folder.
            for (const name of c.priorNames) {
              await mkdir(path.join(siteFolder, name, 'shots'), { recursive: true });
              await writeFile(path.join(siteFolder, name, 'run.json'), '{}\n', 'utf8');
            }
            if (c.priorBase) await mkdir(path.join(siteFolder, formatRunId(startedAt, c.ghost, c.missionId)), { recursive: true });

            // The Run_Id, correct or built to be wrong.
            const otherGhost: GhostId = c.ghost === 'listener' ? 'phantom' : 'listener';
            let runId: string;
            switch (c.runIdMode) {
              case 'ok':
                runId = makeRunId(startedAt, c.ghost, c.missionId, folderExistsIn(siteFolder));
                break;
              case 'wrong_ghost':
                runId = formatRunId(startedAt, otherGhost, c.missionId);
                break;
              case 'wrong_mission':
                runId = formatRunId(startedAt, c.ghost, `${c.missionId}-zz`);
                break;
              case 'wrong_time':
                runId = formatRunId(new Date(c.startedAtMs + 60_000), c.ghost, c.missionId);
                break;
              case 'garbage':
                runId = 'not a run id';
                break;
            }
            const collide = c.collide && c.runIdMode === 'ok';
            if (collide) await mkdir(path.join(siteFolder, runId), { recursive: true });

            const findings = resolveFindings(c.findings, c.steps);
            const expectValid =
              c.steps.length <= 60 &&
              c.badThoughtAt === null &&
              c.runIdMode === 'ok' &&
              findings.every((f) => !f.bad);

            const result = finalizeRun({
              runId,
              ghost: c.ghost,
              mission: {
                id: c.missionId,
                goal: c.goal,
                requirement: c.requirement,
                successCheck: { text: c.successText, visible: '[data-haunt="payment-success"]' },
              },
              site: { name: c.siteName },
              url: c.siteUrl,
              commit: c.commit,
              startedAt,
              result: c.result,
              recorder,
              findings: findings.map((f) => f.input),
              screenshotSize,
            });

            // The generator must be able to tell valid from invalid runs.
            if (expectValid) {
              expect(result.problems.map(formatProblem)).toEqual([]);
            } else {
              expect(result.problems.length).toBeGreaterThan(0);
            }

            const before = await snapshot(outRoot);
            const siteChildrenBefore = await childNames(siteFolder);

            if (result.problems.length > 0) {
              // Req 3.5: nothing is written.
              await expect(writeRunFolder({ outRoot, siteKey: c.siteKey, result })).rejects.toBeInstanceOf(InvalidRunError);
              expect(await snapshot(outRoot)).toEqual(before);
              expect((await childNames(siteFolder)).filter((name) => name.startsWith('.'))).toEqual([]);
              rejectedInvalid++;
              return;
            }

            if (collide) {
              // A valid run whose folder already exists is refused, and leaves nothing behind.
              await expect(writeRunFolder({ outRoot, siteKey: c.siteKey, result })).rejects.toThrow(/already exists/);
              expect(await snapshot(outRoot)).toEqual(before);
              rejectedCollision++;
              return;
            }

            // Req 3.6: the folder is written as a whole.
            const wroteTo = await writeRunFolder({ outRoot, siteKey: c.siteKey, result });
            written++;
            expect(wroteTo.folder).toBe(path.join(siteFolder, runId));
            expect(wroteTo.runJsonPath).toBe(path.join(siteFolder, runId, 'run.json'));

            // Nothing else changed in the site folder, and no temporary folder is left.
            expect(await childNames(siteFolder)).toEqual([...siteChildrenBefore, runId].sort());
            expect((await childNames(siteFolder)).filter((name) => name.startsWith('.'))).toEqual([]);
            expect(await childNames(wroteTo.folder)).toEqual(['run.json', 'shots']);

            // Read the run back from disk and validate it against the files that are really there.
            const onDisk = JSON.parse(await readFile(wroteTo.runJsonPath, 'utf8')) as {
              steps: { n: number; screenshot: string }[];
              findings: { screenshot: string }[];
              site: { url: string };
              startedAt: string;
            };
            expect(onDisk).toEqual(JSON.parse(JSON.stringify(result.run)));

            const shotFiles = (await readdir(path.join(wroteTo.folder, 'shots'))).map((f) => `shots/${f}`).sort();
            expect(validate(onDisk, shotFiles, { screenshotSize }).map(formatProblem)).toEqual([]);

            // Exactly the referenced shots are on disk, and each holds the right picture.
            const referenced = [...new Set([...onDisk.steps.map((s) => s.screenshot), ...onDisk.findings.map((f) => f.screenshot)])].sort();
            expect(shotFiles).toEqual(referenced);
            for (const name of shotFiles) {
              const match = /^shots\/(\d{3})(-seen)?\.png$/.exec(name);
              expect(match).not.toBeNull();
              const expected = tinyPng(Number(match![1]), match![2] ? 1 : 0);
              expect((await readFile(path.join(wroteTo.folder, ...name.split('/')))).equals(expected)).toBe(true);
            }

            // Steps run from 1 with no gaps; the start time is UTC to the second; the URL has no
            // trailing slash when the path is "/".
            expect(onDisk.steps.map((s) => s.n)).toEqual(c.steps.map((_, i) => i + 1));
            expect(onDisk.startedAt).toBe(formatStartedAt(startedAt));
            expect(onDisk.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            const parsedUrl = new URL(c.siteUrl);
            const expectedUrl = parsedUrl.pathname === '/' ? `${parsedUrl.origin}${parsedUrl.search}` : parsedUrl.href;
            expect(onDisk.site.url).toBe(expectedUrl);
          } finally {
            await rm(outRoot, { recursive: true, force: true });
          }
        }),
        RUNS,
      );

      // The property must not pass by only ever seeing one kind of case.
      expect(written).toBeGreaterThan(0);
      expect(rejectedInvalid).toBeGreaterThan(0);
      expect(rejectedCollision).toBeGreaterThan(0);
    },
    300_000,
  );
});
