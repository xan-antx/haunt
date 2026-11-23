import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { beforeOptions, defaultAfter, defaultPair } from '../screens/ExorciseScreen';
import { afterCandidates } from '../model/exorcise';
import {
  fixedCopyName,
  isAfterTheFix,
  isFixedCopyRun,
  originalSiteName,
  originalSiteRuns,
} from '../model/fixedCopy';
import { groupHaunts } from '../model/haunts';
import { screenDestinations } from '../model/screens';
import { pageName } from '../model/sites';
import { buildTour } from '../model/tour';
import * as derived from './fixtures/derived';
import { BEBE_META, bebeRun, bebeSample, listenerRun, listenerSample, mustRun } from './fixtures/samples';
import { memorySource, renderApp, type MemoryRunFile } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const FIXED = '2026-11-09-listener-pay-bill';
const meta = (key: string) => ({ key, folder: `test/${key}`, origin: 'runs' as const });

const fixedRun = () => mustRun(derived.listenerOnFixedCopy(), meta(FIXED));
/** An original-site run that is newer than the sample but older than the fixed copy's run. */
const laterOriginal = () => mustRun(derived.listenerNewFinding(), meta('2026-11-08-listener-pay-bill'));
/** An original-site run that is newer than the fixed copy's run. */
const newestOriginal = () => {
  const json = derived.listenerNewFinding();
  json.runId = '2026-11-12-listener-pay-bill';
  json.startedAt = '2026-11-12T10:00:00Z';
  return mustRun(json, meta('2026-11-12-listener-pay-bill'));
};

describe('fixed copy names', () => {
  it('reads the original name from a name ending in " (exorcised)"', () => {
    expect(originalSiteName('Lantern Bills demo (exorcised)')).toBe('Lantern Bills demo');
    expect(fixedCopyName('Lantern Bills demo')).toBe('Lantern Bills demo (exorcised)');
  });

  it.each(['Lantern Bills demo', 'Lantern Bills demo (exorcised) ', 'Lantern Bills demo(exorcised)', ' (exorcised)', '(exorcised)'])(
    'does not treat %j as a fixed copy',
    (name) => {
      expect(originalSiteName(name)).toBeNull();
    },
  );

  it('removes only the last suffix', () => {
    expect(originalSiteName('A (exorcised) (exorcised)')).toBe('A (exorcised)');
  });

  it('tells fixed copy runs from original runs and keeps the original runs in order', () => {
    const runs = [listenerRun(), fixedRun(), bebeRun()];
    expect(runs.map(isFixedCopyRun)).toEqual([false, true, false]);
    expect(originalSiteRuns(runs).map((r) => r.key)).toEqual([L, '2026-11-03-bebe-pay-bill']);
  });

  it('knows an after-the-fix run only on the before run\'s own fixed copy', () => {
    expect(isAfterTheFix(listenerRun(), fixedRun())).toBe(true);
    expect(isAfterTheFix(fixedRun(), listenerRun())).toBe(false);
    expect(isAfterTheFix(listenerRun(), laterOriginal())).toBe(false);
  });

  it('names pages of the fixed copy as the original does', () => {
    expect(pageName('Lantern Bills demo (exorcised)', '/')).toBe('the bill page');
    expect(pageName('Lantern Bills demo', '/')).toBe('the bill page');
  });
});

describe('the tour and Home groups ignore the fixed copy', () => {
  it('groupHaunts of the original runs has one haunt, without the fixed copy runs', () => {
    const haunts = groupHaunts(originalSiteRuns([listenerRun(), bebeRun(), fixedRun()]));
    expect(haunts.map((h) => h.siteName)).toEqual(['Lantern Bills demo']);
    expect(haunts[0]!.runs.map((r) => r.key)).not.toContain(FIXED);
  });

  it('groupHaunts of all runs shows the fixed copy as its own site', () => {
    const names = groupHaunts([listenerRun(), bebeRun(), fixedRun()]).map((h) => h.siteName);
    expect(names).toEqual(['Lantern Bills demo (exorcised)', 'Lantern Bills demo']);
  });

  it('the tour points at the original site and its newest Listener run, not the fixed copy', () => {
    const stops = buildTour([listenerRun(), bebeRun(), fixedRun()])!;
    expect(stops[0]!.body).toContain('on Lantern Bills.');
    expect(stops[0]!.body).not.toContain('exorcised');
    for (const stop of stops) expect(stop.path).not.toContain(FIXED);
    expect(stops.find((s) => s.id === 'shot')!.path).toContain(L);
  });

  it('there is no tour when only the fixed copy has runs', () => {
    expect(buildTour([fixedRun()])).toBeNull();
  });
});

describe('the Ghost Cam link stays on the original site', () => {
  it('points at the original Listener run, not the newer fixed copy run', () => {
    const destinations = screenDestinations([listenerRun(), bebeRun(), fixedRun()]);
    expect(destinations.ghostcam).toContain(L);
    expect(destinations.ghostcam).not.toContain(FIXED);
  });

  it('has no destination when only the fixed copy has runs', () => {
    expect(screenDestinations([fixedRun()]).ghostcam).toBeNull();
  });
});

describe('Exorcise offers the fixed copy as the after run', () => {
  it('lists the fixed copy run among the after candidates of the original run', () => {
    expect(afterCandidates(listenerRun(), [listenerRun(), fixedRun()]).map((r) => r.key)).toEqual([FIXED]);
  });

  it('defaults to the fixed copy even when another original run is newer than the sample', () => {
    expect(defaultAfter(listenerRun(), [listenerRun(), laterOriginal(), fixedRun()])?.key).toBe(FIXED);
    // Here an original run is newer than the fixed copy's run, and the fixed copy still wins.
    expect(defaultAfter(listenerRun(), [listenerRun(), fixedRun(), newestOriginal()])?.key).toBe(FIXED);
  });

  it('keeps the newest other run as the default when there is no fixed copy run', () => {
    expect(defaultAfter(listenerRun(), [listenerRun(), laterOriginal()])?.key).toBe('2026-11-08-listener-pay-bill');
  });

  it('defaultPair puts the newest original run before and the fixed copy run after', () => {
    const pair = defaultPair([listenerRun(), laterOriginal(), fixedRun(), newestOriginal()]);
    expect(pair?.after.key).toBe(FIXED);
    expect(pair?.before.key).toBe('2026-11-12-listener-pay-bill');
  });

  it('beforeOptions leaves out fixed copy runs unless the URL opened one as the before run', () => {
    const runs = [fixedRun(), laterOriginal(), listenerRun(), bebeRun()];
    expect(beforeOptions(runs).map((r) => r.key)).toEqual(['2026-11-08-listener-pay-bill', L, '2026-11-03-bebe-pay-bill']);
    expect(beforeOptions(runs, fixedRun()).map((r) => r.key)).toContain(FIXED);
  });

  it('defaultPair never picks a fixed copy run as the before run', () => {
    const secondFixed = () => {
      const json = derived.listenerOnFixedCopy();
      json.runId = '2026-11-10-listener-pay-bill';
      json.startedAt = '2026-11-10T10:00:00Z';
      return mustRun(json, meta('2026-11-10-listener-pay-bill'));
    };
    expect(defaultPair([fixedRun(), secondFixed()])).toBeNull();
  });

  it('defaultPair ignores the fixed copy for a ghost it has no run for', () => {
    expect(defaultPair([listenerRun(), bebeRun()])).toBeNull();
    expect(defaultPair([bebeRun(), fixedRun()])).toBeNull();
  });
});

function files(): MemoryRunFile[] {
  // Both Listener runs are real runs: a real run hides the Listener sample, as in a recorded demo.
  return [
    { json: listenerSample(), meta: meta(L) },
    { json: bebeSample(), meta: BEBE_META },
    { json: derived.listenerOnFixedCopy(), meta: meta(FIXED) },
  ];
}

describe('screens', () => {
  it('Home results use only the original site, and the fixed copy is its own site card', async () => {
    renderApp('/', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    const results = screen.getAllByRole('region', { name: /^What the ghosts found/ });
    expect(results.map((r) => r.getAttribute('aria-labelledby'))).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'What the ghosts found on Lantern Bills' })).toBeInTheDocument();

    // No result card links to the fixed copy's run.
    const cards = within(screen.getByRole('region', { name: 'What the ghosts found on Lantern Bills' }));
    for (const link of cards.getAllByRole('link')) expect(link.getAttribute('href') ?? '').not.toContain(FIXED);

    const sites = within(screen.getByRole('region', { name: 'Haunted sites' }));
    expect(sites.getByRole('heading', { name: 'Lantern Bills demo (exorcised)' })).toBeInTheDocument();
    expect(sites.getByRole('heading', { name: 'Lantern Bills demo' })).toBeInTheDocument();
  });

  it('Home result cards show the original Listener run, not the newer fixed copy run', async () => {
    renderApp('/', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    const results = within(screen.getByRole('region', { name: 'What the ghosts found on Lantern Bills' }));
    const watch = results.getByRole('link', { name: /Watch it happen: The Listener/ });
    expect(watch.getAttribute('href')).toContain(L);
  });

  it('the top navigation Ghost Cam link and the #/seance link open the original run', async () => {
    renderApp('/', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    const nav = within(screen.getByRole('navigation', { name: /main|primary|screens/i }));
    const cam = nav.getAllByRole('link').find((a) => /ghost cam/i.test(a.textContent ?? ''))!;
    expect(cam.getAttribute('href')).toContain(L);
    expect(cam.getAttribute('href')).not.toContain(FIXED);
  });

  it('#/seance without a run opens the Ask_Panel on the original run', async () => {
    const { router } = renderApp('/seance', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    expect(router.state.location.pathname).toContain(L);
    expect(router.state.location.pathname).not.toContain(FIXED);
  });

  it('Exorcise opens on the original run and the fixed copy run, labelled "after the fix"', async () => {
    renderApp('/exorcise', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByLabelText('Before run')).toHaveValue(L);
    const after = screen.getByLabelText('After run (same ghost and mission)');
    expect(after).toHaveValue(FIXED);
    const option = within(after).getByRole('option', { name: /after the fix/ });
    expect(option).toHaveValue(FIXED);
    // The Before list offers only original-site runs, never the fixed copy's run.
    const before = screen.getByLabelText('Before run');
    expect(within(before).queryByText(/after the fix/)).not.toBeInTheDocument();
    const beforeValues = within(before).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(beforeValues).not.toContain(FIXED);
    expect(beforeValues).toContain(L);
    // The Page column names the fixed copy's "/" as the original does.
    expect(within(screen.getByRole('table')).getAllByText('the bill page').length).toBeGreaterThan(0);
    // The fix removed the unlabeled button.
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Exorcised'),
      expect.stringContaining('Still haunting'),
    ]);
  });

  it('Exorcise marks only the fixed copy run as "after the fix", not other runs of the original site', async () => {
    renderApp(`/exorcise/${L}/${FIXED}`, memorySource([...files(), { json: derived.listenerNewFinding(), meta: meta('2026-11-08-listener-pay-bill') }]));
    await screen.findByRole('heading', { level: 1 });
    const after = screen.getByLabelText('After run (same ghost and mission)');
    const labelled = within(after)
      .getAllByRole('option')
      .filter((o) => /after the fix/.test(o.textContent ?? ''))
      .map((o) => o.getAttribute('value'));
    expect(labelled).toEqual([FIXED]);
    expect(within(after).getAllByRole('option')).toHaveLength(2);
  });

  it('the Graveyard site filter lists the fixed copy as its own site', async () => {
    renderApp('/graveyard', memorySource(files()));
    await screen.findByRole('heading', { level: 1 });
    const site = screen.getByLabelText(/site/i);
    const names = within(site as HTMLElement)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Lantern Bills demo', 'Lantern Bills demo (exorcised)']));
  });
});
