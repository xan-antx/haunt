import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { validateRun } from '../data/validate';
import { isAiRun } from '../model/mind';
import * as derived from './fixtures/derived';
import { BEBE_META, LISTENER_META, bebeSample, listenerSample } from './fixtures/samples';
import { memorySource, renderApp } from './helpers';

// The "AI mind" label: shown wherever an AI run is named, never on a scripted run.
const L = '2026-11-03-listener-pay-bill';

/** The Listener sample made by the AI mind, and the Bebe sample, which has no `mind` field. */
function aiFiles() {
  return [
    { json: { ...listenerSample(), mind: 'ai' }, meta: LISTENER_META },
    { json: bebeSample(), meta: BEBE_META },
  ];
}

describe('validateRun and the mind field', () => {
  it('counts a run without mind as scripted', () => {
    const loaded = validateRun(listenerSample(), LISTENER_META);
    expect(loaded.ok && loaded.run.mind).toBe('scripted');
    expect(loaded.ok && isAiRun(loaded.run)).toBe(false);
  });

  it.each(['scripted', 'ai'] as const)('accepts mind "%s"', (mind) => {
    const loaded = validateRun({ ...listenerSample(), mind }, LISTENER_META);
    expect(loaded.ok && loaded.run.mind).toBe(mind);
    expect(loaded.ok && loaded.run.warnings).toEqual([]);
  });

  it('rejects any other mind and names the allowed values', () => {
    const loaded = validateRun({ ...listenerSample(), mind: 'human' }, LISTENER_META);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.errors.map((e) => `${e.path}: ${e.message}`)).toEqual(['mind: expected one of "scripted", "ai", got "human"']);
  });

  it('still rejects other invalid runs the same way', () => {
    expect(validateRun(derived.ghostPoltergeist(), LISTENER_META).ok).toBe(false);
  });
});

describe('the AI mind label', () => {
  it('Home: on the AI result card and in Recent ghost walks, not on the scripted run', async () => {
    renderApp('/', memorySource(aiFiles()));
    await screen.findByRole('heading', { level: 1 });
    const results = screen.getByRole('region', { name: 'What the ghosts found on Lantern Bills' });
    const [listener, bebe] = within(results).getAllByRole('article') as [HTMLElement, HTMLElement];
    expect(within(listener).getByText('AI mind')).toBeInTheDocument();
    expect(within(bebe).queryByText('AI mind')).not.toBeInTheDocument();

    const recent = screen.getByRole('complementary', { name: 'Recent ghost walks' });
    expect(within(recent).getAllByText('AI mind')).toHaveLength(1);
  });

  it('Ghost Cam: in the run summary of an AI run only', async () => {
    renderApp(`/run/${L}/step/1`, memorySource(aiFiles()));
    const heading = await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(heading.closest('[data-cam-area="summary"]')).toHaveTextContent('AI mind');
  });

  it('Ghost Cam: not in the summary of a scripted run', async () => {
    renderApp(`/run/${L}/step/1`, memorySource([{ json: listenerSample(), meta: LISTENER_META }]));
    const heading = await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(heading.closest('[data-cam-area="summary"]')).not.toHaveTextContent('AI mind');
  });

  it('Home: on the AI ghost row of the haunt card, not on the scripted one', async () => {
    renderApp('/', memorySource(aiFiles()));
    await screen.findByRole('heading', { level: 1 });
    const rows = screen
      .getAllByText(/^(The Listener|Bebe)$/)
      .map((name) => name.closest('li'))
      .filter((li): li is HTMLLIElement => li !== null && li.querySelector('details, a') !== null);
    const listener = rows.find((li) => li.textContent?.includes('The Listener') && li.querySelector('[data-mind-tag]'));
    expect(listener).toBeDefined();
    expect(rows.find((li) => li.textContent?.startsWith('Bebe') && li.querySelector('[data-mind-tag]'))).toBeUndefined();
  });

  it('Exorcise: in the run summary of an AI run only', async () => {
    renderApp('/exorcise', memorySource(aiFiles()));
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    const summaries = [...document.querySelectorAll('section[aria-labelledby^="summary-"]')];
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      const hasAi = summary.querySelector('[data-mind-tag]') !== null;
      expect(hasAi).toBe(summary.textContent?.includes('The Listener') ?? false);
    }
  });

  it('Exorcise: in the run picker option of an AI run only', async () => {
    renderApp('/exorcise', memorySource(aiFiles()));
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    const before = screen.getByLabelText('Before run');
    expect(within(before).getByRole('option', { name: /The Listener/ })).toHaveTextContent('AI mind');
    expect(within(before).getByRole('option', { name: /Bebe/ })).not.toHaveTextContent('AI mind');
  });

  it('shows no label anywhere when every run is scripted', async () => {
    renderApp('/', memorySource([{ json: listenerSample(), meta: LISTENER_META }, { json: bebeSample(), meta: BEBE_META }]));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('AI mind')).not.toBeInTheDocument();
  });
});
