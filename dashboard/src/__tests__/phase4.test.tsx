// Phase 4 of the pre-recording polish: first load (UI-08), the page head and 404 (UI-21), GitHub
// and fixed-copy links (UI-22), the loader and the public wording (UI-31).

import { screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RunSource } from '../data/source';
import { REPO_URL } from '../model/repo';
import { fixedCopyTryLink } from '../model/sites';
import { failingSource, memorySource, renderApp } from './helpers';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const RECORDED = import.meta.glob('../../../runs/**/run.json', { eager: true, import: 'default' });
const recorded = () =>
  Object.entries(RECORDED).map(([path, json]) => {
    const folder = path.replace(/^.*\/runs\//, '').replace(/\/run\.json$/, '');
    return {
      json,
      meta: { key: folder.split('/').pop()!, folder, origin: (folder.startsWith('samples/') ? 'samples' : 'runs') as 'samples' | 'runs' },
    };
  });

/** A source whose index never arrives, to look at the screen while it loads. */
function neverLoads(): RunSource {
  return {
    listRuns: () => new Promise(() => undefined),
    loadRun: () => new Promise(() => undefined),
    screenshotUrl: () => null,
  };
}

const NAV_NAMES = ['Home', 'Ghost Cam', 'Graveyard', 'Exorcise', 'Spec Coverage'];

describe('UI-08: first load', () => {
  it('shows the hero, the ghosts, How Haunt works and a skeleton at once, with five menu items', async () => {
    renderApp('/', neverLoads());
    expect(await screen.findByRole('heading', { level: 1, name: 'Haunt your app before your users do.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How Haunt works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What the ghosts found' })).toBeInTheDocument();
    expect(screen.getByText('Summoning the runs…')).toBeInTheDocument();
    // No empty state while loading.
    expect(screen.queryByText('No ghosts have walked here yet')).toBeNull();
    const items = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('listitem');
    expect(items.map((li) => NAV_NAMES.find((n) => li.textContent?.includes(n)))).toEqual(NAV_NAMES);
  });

  it('keeps five menu items when there are no runs, with Ghost Cam shown but not a link', async () => {
    renderApp('/', memorySource([]));
    await screen.findByText('No ghosts have walked here yet');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(5);
    expect(within(nav).queryByRole('link', { name: /Ghost Cam/ })).toBeNull();
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    // A screen reader hears why it is unavailable.
    expect(within(nav).getByTestId('nav-unavailable')).toHaveTextContent(/Ghost Cam.*Unavailable because no ghost has run here yet\./);
  });

  it('says the Ghost Cam is unavailable while the runs load, and drops it on the published site when there are none', async () => {
    const loading = renderApp('/', neverLoads());
    await screen.findByRole('heading', { level: 1 });
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByTestId('nav-unavailable')).toHaveTextContent(
      'Unavailable until the runs have loaded.',
    );
    loading.unmount();
    vi.stubEnv('DEV', false);
    try {
      renderApp('/', memorySource([]));
      await screen.findByText('No ghosts have walked here yet');
      expect(screen.queryByTestId('nav-unavailable')).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps five menu items with the recorded runs, all links', async () => {
    renderApp('/', memorySource(recorded()));
    await screen.findByTestId('planted-line');
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')).toHaveLength(5);
  });
});

describe('UI-21: page head and 404', () => {
  it('has a favicon, a theme colour and the Open Graph tags with a full live address', () => {
    const html = read('index.html');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('name="theme-color"');
    for (const tag of ['og:title', 'og:description', 'og:image"', 'og:image:width', 'og:image:height']) {
      expect(html).toContain(`property="${tag.replace('"', '')}"`);
    }
    expect(html).toContain('content="https://xan-antx.github.io/haunt/og-image.png"');
    expect(html).toContain('content="1200"');
    expect(html).toContain('content="630"');
  });

  it('commits the favicon, the 1200 by 630 image and the 404 page', () => {
    expect(existsSync(join(process.cwd(), 'public/favicon.svg'))).toBe(true);
    const png = readFileSync(join(process.cwd(), 'public/og-image.png'));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    const page = read('public/404.html');
    expect(page).toContain('This room is empty');
    expect(page).toContain('href="/haunt/"');
    expect(page).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/);
  });
});

describe('UI-22: GitHub and fixed-copy links', () => {
  it('puts a "View on GitHub" link in the footer', async () => {
    renderApp('/coverage', memorySource(recorded()));
    await screen.findByRole('heading', { level: 1, name: 'Spec Coverage' });
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', REPO_URL);
  });

  it('puts "Try the fixed copy" beside the run after the fix', async () => {
    renderApp(
      '/exorcise/2026-11-11T1744Z-phantom-pay-bill/2026-11-22T1153Z-phantom-pay-bill',
      memorySource(recorded()),
    );
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    const after = screen.getByRole('region', { name: 'After' });
    expect(within(after).getByRole('link', { name: 'Try the fixed copy' })).toHaveAttribute(
      'href',
      'https://xan-antx.github.io/haunt/lantern-bills-exorcised/',
    );
    expect(within(screen.getByRole('region', { name: 'Before' })).queryByRole('link', { name: 'Try the fixed copy' })).toBeNull();
    expect(fixedCopyTryLink('Memos')).toBeNull();
  });

  it('keeps a link to Memos on the real-world page', async () => {
    renderApp('/real-world', memorySource(recorded()));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('link', { name: /Memos on GitHub/ })[0]).toHaveAttribute('href', 'https://github.com/usememos/memos');
  });
});

describe('UI-31: the loader and the public wording', () => {
  it('does not tell visitors to run npm commands when the runs cannot load', async () => {
    renderApp('/', failingSource());
    await screen.findByRole('heading', { name: 'No runs found' });
    expect(document.body.textContent).not.toMatch(/npm run|dashboard\//);
    expect(screen.getByText(/could not be loaded just now/)).toBeInTheDocument();
  });

  it('does not tell visitors to run npm commands when there are no runs', async () => {
    renderApp('/', memorySource([]));
    await screen.findByText('No ghosts have walked here yet');
    expect(screen.getByText(/This room is empty/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/runs\/ folder|collect them/);
  });

  it('shows a candle and a ghost with the loading words', async () => {
    renderApp('/coverage', neverLoads());
    const status = (await screen.findAllByRole('status')).find((el) => el.textContent?.includes('Summoning'))!;
    expect(status).toHaveTextContent('Summoning the missions…');
    expect(status.querySelector('svg')).not.toBeNull();
  });
});
