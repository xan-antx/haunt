import axe from 'axe-core';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as derived from './fixtures/derived';
import { failingSource, memorySource, renderApp, sampleFiles } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

function source() {
  return memorySource(
    [...sampleFiles(), { json: derived.listenerAfterFix(), meta: { key: 'after', folder: 'x/after', origin: 'runs' } }],
    [{ ok: false, key: 'broken', folder: 'broken', errors: [{ path: 'result', message: 'expected one of …' }] }],
  );
}

async function violations(): Promise<string[]> {
  // jsdom cannot compute colors; contrast is checked in the Playwright suite and the token contrast test.
  const results = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const screens: [string, string][] = [
  ['Home', '/'],
  ['Graveyard Map view', '/graveyard?view=map'],
  ['Graveyard Map view with fog', '/graveyard?ghost=phantom&view=map'],
  ['Old Haunted Map link', '/haunt/lantern-bills-demo/map?ghost=phantom'],
  ['Graveyard', '/graveyard'],
  ['Graveyard filtered', '/graveyard?ghost=listener&site=lantern-bills-demo'],
  ['Ghost Cam (Listener)', `/run/${L}/step/9`],
  ['Ghost Cam (Bebe)', `/run/${B}/step/2`],
  ['Ghost Cam with the Ask panel open', `/run/${L}/step/9?ask=open`],
  ['Ghost Cam with an Ask panel answer', `/run/${L}/step/9?ask=why-give-up`],
  ['Ghost Cam (Bebe) with an Ask panel answer', `/run/${B}/step/3?ask=what-helped`],
  ['Old Séance link', '/seance'],
  ['Old Séance answer link', `/seance/${L}/why-give-up`],
  ['Exorcise', `/exorcise/${L}/after`],
  ['Exorcise across ghosts', `/exorcise/${L}/${B}`],
  ['Spec Coverage', '/coverage'],
  ['Restless file', '/restless/broken'],
  ['Unknown run', '/run/nobody/step/1'],
  ['Step out of range', `/run/${L}/step/42`],
  ['Not found', '/nowhere'],
];

describe('axe-core', () => {
  it.each(screens)('%s has no violations', async (_name, path) => {
    renderApp(path, source());
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await violations()).toEqual([]);
    // The first axe run in a cold worker can take over 5 s while other test files run in parallel.
  }, 20_000);

  it('Exorcise with no after run has no violations', async () => {
    // Bebe has no same-ghost, same-mission partner in source(), so this shows the "no after run" state.
    renderApp(`/exorcise?before=${B}`, source());
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByText(/No after run yet for Bebe/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(await violations()).toEqual([]);
  });

  it('has no violations on the missing-index screen', async () => {
    renderApp('/', failingSource());
    expect(await screen.findByText(/No runs were collected\. Run/)).toBeInTheDocument();
    expect(await violations()).toEqual([]);
  });

  it('puts the skip link first and uses landmarks', async () => {
    renderApp('/', source());
    await screen.findByRole('heading', { level: 1 });
    const focusable = document.querySelectorAll<HTMLElement>('a[href], button, select, input');
    expect(focusable[0]).toHaveTextContent('Skip to main content');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
