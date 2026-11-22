import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractRunSummary, savedRunPath } from '../src/runFile.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { RUNS, harness } from './helpers.ts';

describe('Feature: haunt-patrol, Property 18: Run file path extraction', () => {
  const absolute = (name: string): string => path.join(path.resolve('/x'), name, 'run.json');
  const noise = fc.oneof(
    fc.string().filter((s) => !/[\r\n]/.test(s) && !(path.isAbsolute(s.trim()) && /[\\/]run\.json$/.test(s.trim()))),
    fc.constantFrom('runs/lantern-bills/a/run.json', 'relative\\run.json', path.join(path.resolve('/x'), 'a', 'other.json')),
  );

  it('returns the last absolute run.json line and ignores everything else', () => {
    fc.assert(
      fc.property(fc.array(noise, { maxLength: 4 }), fc.stringMatching(/^[a-z]{1,6}$/), fc.array(noise, { maxLength: 4 }), (before, name, after) => {
        const wanted = absolute(name);
        const stdout = [...before, wanted, ...after].join('\n');
        expect(savedRunPath(stdout)).toBe(wanted);
      }),
      RUNS,
    );
  });

  it('returns null when no line qualifies', () => {
    fc.assert(
      fc.property(fc.array(noise, { maxLength: 6 }), (lines) => {
        expect(savedRunPath(lines.join('\n'))).toBeNull();
      }),
      RUNS,
    );
  });

  it('prefers the later of two paths', () => {
    expect(savedRunPath(`${absolute('a')}\n${absolute('b')}\n`)).toBe(absolute('b'));
  });

  it('records no_run with the "No run.json path was printed." text for exit 0 or 3 without a path', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(0, 3), fc.array(noise, { maxLength: 4 }), async (code, lines) => {
        const h = harness({ respond: () => ({ code, stdout: lines.join('\n'), stderr: '', timedOut: false }) });
        await expect(runPatrol(h.deps)).resolves.toBe(3);
        for (const entry of h.store.records[0]?.ghosts ?? []) {
          expect(entry.result).toBe('no_run');
          expect(entry.error).toBe('No run.json path was printed.');
          expect(entry.exitCode).toBe(code);
        }
      }),
      RUNS,
    );
  });
});

describe('Feature: haunt-patrol, Property 6 (pure half): Invalid run files never count as saved runs', () => {
  it('rejects text that is not a run file, never throws, and explains', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.json().filter((t) => {
            const v: unknown = JSON.parse(t);
            return typeof v !== 'object' || v === null || Array.isArray(v) || !['succeeded', 'gave_up', 'error'].includes(String((v as Record<string, unknown>).result));
          }),
          fc.constantFrom('{"result":"won"}', '{"result":"succeeded","findings":3}', '{"result":"error","findings":[{"type":1}]}', 'null', '[]'),
        ),
        (text) => {
          const result = extractRunSummary(text, 'folder');
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
        },
      ),
      RUNS,
    );
  });

  it('accepts a good run file and falls back to the folder name for the run id', () => {
    const ok = extractRunSummary('{"result":"gave_up","findings":[{"type":"t","step":2,"title":"x","evidence":"e"}]}', 'folder');
    expect(ok).toEqual({ ok: true, runId: 'folder', result: 'gave_up', findings: [{ type: 't', step: 2, title: 'x' }] });
    expect(extractRunSummary('{"runId":"abc","result":"succeeded"}', 'folder')).toMatchObject({ ok: true, runId: 'abc' });
  });
});
