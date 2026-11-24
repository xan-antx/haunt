import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Run, RunMeta } from '../data/types';
import { memorySource, renderApp, sampleFiles, type MemoryRunFile } from './helpers';
import { LISTENER_META, listenerSample } from './fixtures/samples';

/** A Memos run file made from the Listener sample. */
function memosFile(mind: 'scripted' | 'ai'): MemoryRunFile {
  const json = structuredClone(listenerSample()) as Record<string, unknown>;
  json['site'] = { ...(json['site'] as object), name: 'Memos', url: 'http://localhost:5230' };
  if (mind === 'ai') json['mind'] = 'ai';
  const meta: RunMeta = { ...LISTENER_META, key: `memos-${mind}`, folder: `memos/${mind}`, origin: 'runs' };
  return { json, meta };
}

describe('Real-world screen', () => {
  it('shows the outcome, step count, findings and mind tag of a Memos run', async () => {
    renderApp('/real-world', memorySource([...sampleFiles(), memosFile('scripted'), memosFile('ai')]));
    expect(await screen.findByRole('heading', { level: 1, name: 'A real-world haunt' })).toBeInTheDocument();
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getByText(/steps? walked/)).toBeInTheDocument();
      expect(within(card).getByRole('list', { name: 'Problems found' })).toBeInTheDocument();
    }
    expect(screen.getByText('(Scripted mind)')).toBeInTheDocument();
    expect(screen.getByText('(AI mind)')).toBeInTheDocument();
  });

  it('says that no Memos run exists when there is none', async () => {
    renderApp('/real-world');
    expect(await screen.findByText(/No Memos run exists yet\./)).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('opens a Memos run in the Ghost Cam with the Watch it happen button', async () => {
    renderApp('/real-world', memorySource([memosFile('scripted')]));
    const button = await screen.findByRole('link', { name: /Watch it happen/ });
    expect(button.getAttribute('href')).toMatch(/^\/run\/memos-scripted\/step\/\d+$/);
  });
});

describe('Home with real-world runs', () => {
  it('has no real-world link when there are only Lantern Bills runs', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /real-world haunt/i })).toBeNull();
  });

  it('shows one link to the real-world screen, and keeps Memos out of the haunted sites', async () => {
    renderApp('/', memorySource([...sampleFiles(), memosFile('scripted')]));
    const link = await screen.findByRole('link', { name: /real-world haunt on Memos/i });
    expect(link.getAttribute('href')).toBe('/real-world');
    const sites = screen.getByRole('region', { name: 'Haunted sites' });
    expect(within(sites).queryByText(/Memos/)).toBeNull();
  });
});

// Keeps the Run type in use for readers who look for what a Memos run is.
export type MemosRun = Run;
