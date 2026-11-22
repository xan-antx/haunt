import { describe, expect, it } from 'vitest';
import { main } from '../src/patrol.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { fakeSite, goodProbe, harness, memoryStore, record, runJsonText, savedResult } from './helpers.ts';

describe('runPatrol with fakes', () => {
  it('prints and saves the summary, writes the record, and never runs npm or collect-runs', async () => {
    const h = harness({ files: () => runJsonText('gave_up', [{ type: 'focus_trap', step: 4, title: 'Trapped' }]) });
    const code = await runPatrol(h.deps);
    expect(code).toBe(0);
    expect(h.out.join('')).toContain('# Haunt Patrol, 2026-11-03 (IST)');
    expect(h.out.join('')).toContain('Trapped');
    expect(h.store.summaries).toEqual([h.out.join('')]);
    expect(h.store.records).toHaveLength(1);
    expect(h.store.records[0]?.ghosts.map((g) => g.ghost)).toEqual(['listener', 'phantom', 'bebe']);
    expect(h.store.exports).toHaveLength(1);
    expect(h.store.exports[0]?.dashboardBaseUrl).toBe('http://localhost:3001');
    for (const call of h.commands.calls) {
      expect(call.join(' ')).not.toMatch(/npm|npx|collect-runs|haunt-mcp/);
      expect(call[1]).toBe('run');
    }
  });

  it('exits 0 when a ghost gave up', async () => {
    const h = harness({ files: () => runJsonText('gave_up') });
    expect(await runPatrol(h.deps)).toBe(0);
  });

  it('replaces the record of the same date on a second patrol', async () => {
    const store = memoryStore();
    const first = harness({ store });
    const second = harness({ store, files: () => runJsonText('error') });
    await runPatrol(first.deps);
    await runPatrol(second.deps);
    expect(store.records).toHaveLength(2);
    expect(store.records[0]?.date).toBe(store.records[1]?.date);
  });

  it('exits 3 when the site started and no ghost saved a run', async () => {
    const h = harness({ respond: () => ({ code: 1, stdout: '', stderr: 'Chromium missing\n', timedOut: false }) });
    expect(await runPatrol(h.deps)).toBe(3);
    expect(h.store.records[0]?.ghosts.every((g) => g.result === 'no_run' && g.error === 'Chromium missing')).toBe(true);
    expect(h.site.stops).toBe(1);
  });

  it('exits 2 when the site did not start, and runs nothing', async () => {
    const h = harness({ site: fakeSite({ ok: false, reason: 'Port 3000 is already in use.' }) });
    expect(await runPatrol(h.deps)).toBe(2);
    expect(h.commands.calls).toHaveLength(0);
    expect(h.err.join('')).toContain('Port 3000 is already in use.');
    expect(h.store.records).toHaveLength(0);
  });

  it('exits 1 when a prerequisite is missing, naming the fix', async () => {
    const h = harness({ probe: goodProbe({ chromiumInstalled: () => Promise.resolve(false) }) });
    expect(await runPatrol(h.deps)).toBe(1);
    expect(h.err.join('')).toContain('npx playwright install chromium in engine/');
    expect(h.site.starts).toBe(0);
    expect(h.commands.calls).toHaveLength(0);
  });

  it('records no_run with the text "No run.json path was printed." for exit 0 and 3 with no path', async () => {
    const h = harness({ respond: (ghost) => (ghost === 'listener' ? { code: 0, stdout: 'done\n', stderr: '', timedOut: false } : savedResult(ghost, 3)) });
    expect(await runPatrol(h.deps)).toBe(0);
    const [listener, phantom] = h.store.records[0]?.ghosts ?? [];
    expect(listener).toMatchObject({ result: 'no_run', exitCode: 0, error: 'No run.json path was printed.' });
    expect(phantom).toMatchObject({ result: 'succeeded', exitCode: 3 });
  });

  it('reports "Not checked tonight" and no fixed entry for a ghost with no saved run tonight', async () => {
    const previous = record('2026-11-02', { phantom: { result: 'gave_up', findings: [{ type: 'zoom', step: 3, title: 'Text is too small' }] } });
    const h = harness({
      store: memoryStore({ kind: 'record', record: previous }),
      respond: (ghost) => (ghost === 'phantom' ? { code: 1, stdout: '', stderr: 'no page', timedOut: false } : savedResult(ghost)),
    });
    await runPatrol(h.deps);
    const text = h.out.join('');
    expect(text).toContain('Not checked tonight (The Phantom had no saved run)');
    expect(text).toContain('Fixed findings (0).');
  });

  it('stops when a ghost is interrupted and writes the rest as not run', async () => {
    const h = harness({ respond: (ghost) => (ghost === 'phantom' ? { code: 130, stdout: '', stderr: '', timedOut: false } : savedResult(ghost)) });
    expect(await runPatrol(h.deps)).toBe(0);
    expect(h.commands.calls).toHaveLength(2);
    const rec = h.store.records[0];
    expect(rec?.interrupted).toBe(true);
    expect(rec?.ghosts[2]).toMatchObject({ result: 'no_run', exitCode: null, error: 'Not run: patrol interrupted.' });
  });
});

describe('crash cases (integration half of Property 12)', () => {
  it('a failing writeRecord gives exit 4 and the site is stopped', async () => {
    const store = memoryStore();
    store.failWrite = true;
    const h = harness({ store });
    const stderr: string[] = [];
    const code = await main({ run: () => runPatrol(h.deps), stderr: (t) => stderr.push(t) });
    expect(code).toBe(4);
    expect(h.site.stops).toBe(1);
    expect(stderr.join('')).toContain('disk full');
  });

  it('a step that throws after the site started gives exit 4 and the site is stopped', async () => {
    const store = memoryStore();
    store.failLoad = true;
    const h = harness({ store });
    const code = await main({ run: () => runPatrol(h.deps), stderr: () => undefined });
    expect(code).toBe(4);
    expect(h.site.stops).toBe(1);
  });

  it('a fake runPatrol that throws inside main gives exit 4 and prints the error', async () => {
    const stderr: string[] = [];
    const code = await main({
      run: () => Promise.reject(new Error('boom')),
      stderr: (t) => stderr.push(t),
    });
    expect(code).toBe(4);
    expect(stderr.join('')).toContain('boom');
  });

  it('a command runner that throws is recorded per ghost, the patrol exits 3 and the site is stopped', async () => {
    const h = harness({
      respond: () => {
        throw new Error('spawn failed');
      },
    });
    expect(await main({ run: () => runPatrol(h.deps), stderr: () => undefined })).toBe(3);
    expect(h.site.stops).toBe(1);
    expect(h.store.records[0]?.ghosts.map((g) => g.error)).toEqual(['spawn failed', 'spawn failed', 'spawn failed']);
  });
});
