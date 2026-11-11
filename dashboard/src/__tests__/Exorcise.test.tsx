import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as derived from './fixtures/derived';
import { memorySource, renderApp, sampleFiles, type MemoryRunFile } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const meta = (key: string) => ({ key, folder: `test/${key}`, origin: 'runs' as const });

function files(): MemoryRunFile[] {
  return [
    ...sampleFiles(),
    { json: derived.listenerAfterFix(), meta: meta('2026-11-05-listener-pay-bill') },
    { json: derived.listenerNeverReachesBill(), meta: meta('2026-11-06-listener-pay-bill') },
    { json: derived.differentMission(), meta: meta('2026-11-07-bebe-autopay') },
  ];
}

async function open(path: string) {
  const view = renderApp(path, memorySource(files()));
  await screen.findByRole('heading', { level: 1 });
  return view;
}

function statuses(): string[][] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((c) => c.textContent ?? ''));
}

describe('Exorcise', () => {
  it('marks the removed unlabeled button as exorcised and the trap as still haunting', async () => {
    await open(`/exorcise/${L}/2026-11-05-listener-pay-bill`);
    const rows = statuses();
    expect(rows).toHaveLength(2);
    expect(rows[0]![0]).toContain('Button with no name');
    expect(rows[0]![1]).toBe('/bill');
    expect(rows[0]![2]).toContain('Exorcised');
    expect(rows[1]![0]).toContain('Keyboard trap');
    expect(rows[1]![2]).toContain('Still haunting');
    expect(screen.queryByText(/Different ghosts/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Before' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After' })).toBeInTheDocument();
    expect(screen.getAllByText(/git checkout def5678/)).toHaveLength(2);
  });

  it('marks findings on a page the after run never reached as not reached', async () => {
    await open(`/exorcise/${L}/2026-11-06-listener-pay-bill`);
    const rows = statuses();
    expect(rows.map((r) => r[2])).toEqual([
      expect.stringContaining('Not reached'),
      expect.stringContaining('Not reached'),
    ]);
    // The sentence names the page in plain words, not by its path (Req 24.8).
    expect(screen.getAllByText(/never got as far as the bill page/)).toHaveLength(2);
    expect(screen.queryByText('Exorcised')).not.toBeInTheDocument();
  });

  it('refuses to compare runs by different ghosts', async () => {
    await open(`/exorcise/${L}/2026-11-03-bebe-pay-bill`);
    expect(screen.getByText(/Different ghosts\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Before' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    for (const label of ['Exorcised', 'Still haunting', 'New haunting', 'Not reached']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('marks a finding only the same-ghost after run has as a new haunting', async () => {
    // A separate file list, so the other tests' default pair and options stay as they are.
    const newFindingKey = '2026-11-08-listener-pay-bill';
    renderApp(
      `/exorcise/${L}/${newFindingKey}`,
      memorySource([...files(), { json: derived.listenerNewFinding(), meta: meta(newFindingKey) }]),
    );
    await screen.findByRole('heading', { level: 1 });
    const rows = statuses();
    expect(rows.map((r) => r[2])).toEqual([
      expect.stringContaining('Still haunting'),
      expect.stringContaining('Still haunting'),
      expect.stringContaining('New haunting'),
    ]);
    expect(rows[2]![0]).toContain('Error nobody announced');
    expect(rows[2]![1]).toBe('/bill');
    expect(screen.queryByText(/Different ghosts/)).not.toBeInTheDocument();
  });

  it('refuses to compare different missions', async () => {
    await open(`/exorcise/${L}/2026-11-07-bebe-autopay`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "These runs follow different missions, so Exorcise can't compare them.",
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers only runs by the same ghost of the same mission as the after run', async () => {
    await open(`/exorcise/${L}/2026-11-05-listener-pay-bill`);
    const after = screen.getByLabelText('After run (same ghost and mission)');
    const options = within(after).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).not.toContain(L);
    expect(options).not.toContain('2026-11-07-bebe-autopay');
    expect(options).not.toContain('2026-11-03-bebe-pay-bill');
    expect(options).toEqual(['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']);
  });

  it('picks a default pair on #/exorcise', async () => {
    await open('/exorcise');
    expect(screen.getByLabelText('Before run')).toHaveValue('2026-11-05-listener-pay-bill');
    expect(screen.getByLabelText('After run (same ghost and mission)')).toHaveValue('2026-11-06-listener-pay-bill');
  });
});

describe('exorcise-different-ghost-fix: bug condition', () => {
  const STATUS_LABELS = ['Exorcised', 'Still haunting', 'New haunting', 'Not reached'];

  it('shows no status table for a cross-ghost URL', async () => {
    await open(`/exorcise/${L}/2026-11-03-bebe-pay-bill`);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    for (const label of STATUS_LABELS) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('says there is no after run yet for Bebe on #/exorcise with only the samples', async () => {
    renderApp('/exorcise', memorySource(sampleFiles()));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByLabelText('Before run')).toHaveValue('2026-11-03-bebe-pay-bill');
    expect(screen.getByText(/No after run yet for Bebe/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers only same-ghost runs of the same mission as the after run, newest first', async () => {
    await open(`/exorcise/${L}/2026-11-05-listener-pay-bill`);
    const after = screen.getByRole('combobox', { name: /After run/ });
    const options = within(after)
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(options).not.toContain('2026-11-03-bebe-pay-bill');
    expect(options).toEqual(['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']);
  });

  it('still refuses different missions first when the ghosts also differ', async () => {
    await open(`/exorcise/${L}/2026-11-07-bebe-autopay`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      "These runs follow different missions, so Exorcise can't compare them.",
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('exorcise-different-ghost-fix: new states', () => {
  it('says there is no after run yet for The Listener on ?before= with only the samples', async () => {
    renderApp(`/exorcise?before=${L}`, memorySource(sampleFiles()));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByLabelText('Before run')).toHaveValue(L);
    expect(screen.getByText(/No after run yet for The Listener/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /After run/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Before' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the unknown-run screen for an unknown ?before= key', async () => {
    renderApp('/exorcise?before=nobody', memorySource(files()));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'No ghost by that name has walked here' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Before run')).not.toBeInTheDocument();
  });

  it('moves to ?before= with replace navigation when the chosen before run has no partner', async () => {
    const { router } = renderApp('/exorcise', memorySource(sampleFiles()));
    await screen.findByRole('heading', { level: 1 });
    fireEvent.change(screen.getByLabelText('Before run'), { target: { value: L } });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/exorcise');
      expect(router.state.location.search).toBe(`?before=${L}`);
    });
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByText(/No after run yet for The Listener/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lets a cross-ghost URL pick a same-ghost after run, which shows the table', async () => {
    const { router } = await open(`/exorcise/${L}/2026-11-03-bebe-pay-bill`);
    const after = screen.getByLabelText('After run (same ghost and mission)');
    const values = within(after)
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'))
      .filter((v) => v !== '');
    expect(values).toEqual(['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']);
    fireEvent.change(after, { target: { value: '2026-11-05-listener-pay-bill' } });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/exorcise/${L}/2026-11-05-listener-pay-bill`);
    });
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/Different ghosts/)).not.toBeInTheDocument();
  });

  it('keeps the empty state when there are no runs', async () => {
    renderApp('/exorcise', memorySource([]));
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.getByText("Exorcise needs two runs of the same mission. There aren't any yet."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Before run')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
