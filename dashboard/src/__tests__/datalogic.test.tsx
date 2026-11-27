// Phase 3 of the pre-recording polish: Spec Coverage by site (UI-03), Exorcise pairing (UI-13) and
// the planted-problems line on Home (UI-17), all against every recorded run in runs/.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Run } from '../data/types';
import { buildCoverage, groupCoverageBySite } from '../model/coverage';
import { afterOptions, isFairAfter } from '../model/exorcise';
import { splitRuns } from '../model/origin';
import { reproduceCommand } from '../model/reproduce';
import { beforeOptions, comparisonAnnouncement, defaultPair } from '../screens/ExorciseScreen';
import { allRecordedRuns } from './fixtures/samples';
import { memorySource, renderApp, type MemoryRunFile } from './helpers';

const RECORDED = import.meta.glob('../../../runs/**/run.json', { eager: true, import: 'default' });

function recordedFiles(): MemoryRunFile[] {
  return Object.entries(RECORDED).map(([path, json]) => {
    const folder = path.replace(/^.*\/runs\//, '').replace(/\/run\.json$/, '');
    return {
      json,
      meta: { key: folder.split('/').pop()!, folder, origin: folder.startsWith('samples/') ? 'samples' : 'runs' },
    };
  });
}

const shown = (): Run[] => splitRuns(allRecordedRuns()).shown;
const byKey = (key: string): Run => allRecordedRuns().find((r) => r.key === key)!;

const AI_RUN = '2026-11-23T1020Z-listener-pay-bill';
const SCRIPTED_LISTENER = '2026-11-10T1822Z-listener-pay-bill';
const FIXED_LISTENER = '2026-11-22T1148Z-listener-pay-bill';
const PHANTOM = '2026-11-11T1744Z-phantom-pay-bill';
const FIXED_PHANTOM = '2026-11-22T1153Z-phantom-pay-bill';
const MEMOS_SCRIPTED = '2026-11-24T2141Z-listener-write-note';
const MEMOS_AI = '2026-11-26T2026Z-listener-write-note';

describe('UI-03: Spec Coverage by site', () => {
  it('has one row for Lantern Bills, one for its fixed copy and one for Memos, in that order', () => {
    const rows = buildCoverage(shown());
    expect(rows.map((r) => `${r.site} | ${r.missionId}`)).toEqual([
      'Lantern Bills | pay-bill',
      'Lantern Bills (fixed copy) | pay-bill',
      'Memos | write-note',
    ]);
    expect(groupCoverageBySite(rows).map((s) => s.site)).toEqual(['Lantern Bills', 'Lantern Bills (fixed copy)', 'Memos']);
  });

  it("shows The Phantom as gave up for Lantern Bills, and fixed copy results only under the fixed copy", () => {
    const [original, fixed, memos] = buildCoverage(shown());
    expect(original!.perGhost.phantom.latest?.result).toBe('gave_up');
    expect(original!.perGhost.phantom.latest?.key).toBe(PHANTOM);
    expect(original!.perGhost.listener.latest?.key).toBe(AI_RUN);
    for (const run of Object.values(original!.perGhost).flatMap((g) => g.runs)) {
      expect(run.site.name).toBe('Lantern Bills demo');
    }
    expect(fixed!.perGhost.phantom.latest?.key).toBe(FIXED_PHANTOM);
    for (const run of Object.values(fixed!.perGhost).flatMap((g) => g.runs)) {
      expect(run.site.name).toBe('Lantern Bills demo (exorcised)');
    }
    expect(memos!.perGhost.phantom.latest).toBeNull();
    expect(memos!.perGhost.bebe.latest).toBeNull();
  });

  it('gives each requirement a plain title and a link to its file on GitHub', () => {
    const [original, , memos] = buildCoverage(shown());
    expect(original!.title).toBe('Pay a bill with a valid card');
    expect(original!.requirementLink).toBe(
      'https://github.com/xan-antx/haunt/blob/main/.kiro/specs/lantern-bills/requirements.md',
    );
    expect(memos!.title).toBe('Write and save a note');
    expect(memos!.requirementLink).toContain('/.kiro/specs/memos-real-world-haunt/requirements.md');
    expect(original!.requirement).toMatch(/^WHEN the card number is any valid card number/);
  });

  it('shows the sites, the plain titles and "Gave up" on the screen, with the EARS text behind "Full requirement"', async () => {
    renderApp('/coverage', memorySource(recordedFiles()));
    await screen.findByRole('heading', { level: 1, name: 'Spec Coverage' });
    const table = screen.getByRole('table');
    for (const site of ['Lantern Bills', 'Lantern Bills (fixed copy)', 'Memos']) {
      expect(within(table).getByRole('rowheader', { name: site })).toBeInTheDocument();
    }
    expect(within(table).getAllByText('Pay a bill with a valid card')).toHaveLength(2);
    expect(within(table).queryByText(/WHEN the card number is any valid card number/)).toBeNull();

    // The first body group is Lantern Bills, and The Phantom's cell says "Gave up".
    const group = within(table).getAllByRole('rowgroup').find((g) => g.getAttribute('data-site') === 'Lantern Bills')!;
    const cells = within(group).getAllByRole('cell');
    expect(within(cells[1]!).getByText('Gave up')).toBeInTheDocument();
    const fixedGroup = within(table)
      .getAllByRole('rowgroup')
      .find((g) => g.getAttribute('data-site') === 'Lantern Bills (fixed copy)')!;
    expect(within(within(fixedGroup).getAllByRole('cell')[1]!).getByText('Completed')).toBeInTheDocument();

    const button = within(group).getByRole('button', { name: 'Full requirement' });
    fireEvent.click(button);
    expect(within(group).getByText(/WHEN the card number is any valid card number/)).toBeInTheDocument();
    const link = within(group).getByRole('link', { name: /Requirement file on GitHub/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('github.com/xan-antx/haunt/blob/main/.kiro/specs/'));
  });
});

describe('UI-13: Exorcise pairs only a fair before and after', () => {
  it('offers only later runs by the same ghost and mind on the same site or its fixed copy', () => {
    const runs = shown();
    expect(afterOptions(byKey(SCRIPTED_LISTENER), runs).map((r) => r.key)).toEqual([FIXED_LISTENER]);
    // The AI run has no later AI run, and the earlier scripted fixed-copy run is a different mind.
    expect(afterOptions(byKey(AI_RUN), runs)).toEqual([]);
    expect(afterOptions(byKey(PHANTOM), runs).map((r) => r.key)).toEqual([FIXED_PHANTOM]);
    // An earlier run is never an after run.
    expect(isFairAfter(byKey(FIXED_LISTENER), byKey(SCRIPTED_LISTENER))).toBe(false);
  });

  it('never offers or pairs Memos runs', () => {
    const runs = shown();
    expect(afterOptions(byKey(MEMOS_SCRIPTED), runs)).toEqual([]);
    expect(afterOptions(byKey(MEMOS_AI), runs)).toEqual([]);
    expect(isFairAfter(byKey(MEMOS_SCRIPTED), byKey(MEMOS_AI))).toBe(false);
    expect(beforeOptions(runs).map((r) => r.site.name)).not.toContain('Memos');
    const pair = defaultPair(runs);
    expect(pair?.before.site.name).not.toBe('Memos');
    expect(pair?.after.site.name).not.toBe('Memos');
  });

  it('defaults to the newest fixed-copy run and the earlier original run by the same ghost and mind', () => {
    const pair = defaultPair(shown())!;
    expect(pair.after.key).toBe(FIXED_PHANTOM);
    expect(pair.before.key).toBe(PHANTOM);
  });

  it("adds --mind ai to the AI run's Reproduce command, and to no other", () => {
    expect(reproduceCommand(byKey(AI_RUN))).toMatch(/--mission pay-bill --url \S+ --mind ai$/);
    expect(reproduceCommand(byKey(SCRIPTED_LISTENER))).not.toContain('--mind');
    expect(reproduceCommand(byKey(MEMOS_AI))).toContain('--mind ai');
    expect(reproduceCommand(byKey(MEMOS_SCRIPTED))).not.toContain('--mind');
  });

  it('labels the commit as the Haunt commit', async () => {
    renderApp(`/run/${SCRIPTED_LISTENER}/step/1`, memorySource(recordedFiles()));
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    fireEvent.click(screen.getByRole('button', { name: /Where this run came from/ }));
    expect(screen.getByText('Haunt commit')).toBeInTheDocument();
    expect(screen.queryByText('Site commit')).toBeNull();
  });

  it('describes a comparison in words for the live region', () => {
    expect(comparisonAnnouncement(byKey(PHANTOM), byKey(FIXED_PHANTOM))).toMatch(/^Comparing The Phantom: 2 exorcised\.$/);
    expect(comparisonAnnouncement(byKey(PHANTOM), byKey(FIXED_LISTENER))).toMatch(/^Different ghosts/);
  });

  it('announces the result when the After run changes', async () => {
    renderApp(`/exorcise/${SCRIPTED_LISTENER}/${FIXED_LISTENER}`, memorySource(recordedFiles()));
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    // The Before run changes to the Phantom run: a new comparison is announced.
    const before = screen.getByLabelText('Before run');
    fireEvent.change(before, { target: { value: PHANTOM } });
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(/^Comparing The Phantom/));
  });

  it('keeps old different-ghost links working', async () => {
    renderApp(`/exorcise/${SCRIPTED_LISTENER}/${FIXED_PHANTOM}`, memorySource(recordedFiles()));
    expect(await screen.findByText('Different ghosts.')).toBeInTheDocument();
  });

  it('never offers Memos runs in the Before picker', async () => {
    renderApp('/exorcise', memorySource(recordedFiles()));
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    const options = within(screen.getByLabelText('Before run')).getAllByRole('option');
    for (const option of options) expect(option.textContent).not.toContain('write-note');
  });
});

describe('UI-17: the planted-problems line on Home', () => {
  it('says how many problems were planted, found and exorcised, and which no ghost reached', async () => {
    renderApp('/', memorySource(recordedFiles()));
    await screen.findByRole('heading', { level: 1 });
    const line = await screen.findByTestId('planted-line');
    expect(line).toHaveTextContent(
      '6 problems were planted in Lantern Bills. The ghosts found 5 of 6. The fix exorcised 5 of those 5. No ghost has reached card errors that are never announced.',
    );
    expect(within(line).getByRole('link', { name: '5 of 6' })).toHaveAttribute('href', expect.stringContaining('/graveyard?site=lantern-bills-demo'));
    expect(within(line).getByRole('link', { name: '5 of those 5' }).getAttribute('href')).toContain('/exorcise/');
    expect(within(line).getByRole('link', { name: '6 problems' })).toHaveAttribute(
      'href',
      'https://github.com/xan-antx/haunt/blob/main/.kiro/steering/demo-site.md',
    );
  });
});
