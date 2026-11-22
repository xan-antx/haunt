// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { badgeLabel, countsText, loadPatrol } from './model.ts';
import { makeEntry, type PatrolRecord } from '../../src/record.ts';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@kirocrew/app-sdk', () => ({ useAppApi: () => api }));

const record: PatrolRecord = {
  version: 1,
  date: '2026-11-03',
  seed: 20261103,
  interrupted: false,
  ghosts: [
    makeEntry('listener', { result: 'gave_up', exitCode: 0, runId: 'run one/x', findings: [{ type: 'focus_trap', step: 4, title: 'Trapped' }], error: null }),
    makeEntry('phantom', { result: 'no_run', exitCode: 1, runId: null, findings: [], error: 'No page' }),
    makeEntry('bebe', { result: 'error', exitCode: 3, runId: 'run-bebe', findings: [], error: null }),
  ],
};
const latestBody = { record, dashboardBaseUrl: 'http://localhost:3999/' };
const summaryBody = { summary: '# Haunt Patrol, 2026-11-03 (IST)' };

function notFound(): unknown {
  return { status: 404 };
}

function respondWith(routes: Record<string, unknown | (() => never)>): void {
  api.get.mockImplementation((path: string) => {
    const value = routes[path];
    if (typeof value === 'function') return Promise.reject((value as () => unknown)());
    if (value === undefined) return Promise.reject(new Error('unknown route'));
    return Promise.resolve(value);
  });
}

function staticFetch(files: Record<string, { status: number; body?: unknown }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const name = Object.keys(files).find((k) => url.endsWith(k));
      const file = name ? files[name] : undefined;
      if (!file) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('none')) });
      return Promise.resolve({ ok: file.status === 200, status: file.status, json: () => Promise.resolve(file.body) });
    }),
  );
}

beforeEach(() => {
  api.get.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Patrol page', () => {
  it('fetches both routes and shows the four badge texts, the date and the summary', async () => {
    respondWith({ '/apps/haunt-patrol/api/latest': latestBody, '/apps/haunt-patrol/api/summary': summaryBody });
    render(<App />);
    await screen.findByText('Latest patrol: 2026-11-03 (IST)');
    expect(api.get).toHaveBeenCalledWith('/apps/haunt-patrol/api/latest');
    expect(api.get).toHaveBeenCalledWith('/apps/haunt-patrol/api/summary');
    expect(screen.getByText('Gave up')).toBeTruthy();
    expect(screen.getByText('No run')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('# Haunt Patrol, 2026-11-03 (IST)')).toBeTruthy();
    expect(badgeLabel('succeeded')).toBe('Succeeded');
    expect(countsText({})).toBe('No findings');
    expect(countsText({ a: 2, b: 1 })).toBe('a 2, b 1');
  });

  it('names the ghost in each link, uses the base URL from the backend, and is keyboard reachable', async () => {
    respondWith({ '/apps/haunt-patrol/api/latest': latestBody, '/apps/haunt-patrol/api/summary': summaryBody });
    render(<App />);
    const link = await screen.findByRole('link', { name: "Open The Listener's run in dashboard" });
    expect(link.getAttribute('href')).toBe('http://localhost:3999/#/run/run%20one%2Fx');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toBe("Open The Listener's run in dashboard");
    expect(screen.getByRole('link', { name: "Open Bebe's run in dashboard" })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Phantom/ })).toBeNull();
    for (const l of screen.getAllByRole('link')) expect(l.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('shows the collect-runs note', async () => {
    respondWith({ '/apps/haunt-patrol/api/latest': latestBody, '/apps/haunt-patrol/api/summary': summaryBody });
    render(<App />);
    await screen.findByText(/needs its run list refreshed/);
    expect(screen.getByText('npm run collect-runs')).toBeTruthy();
  });

  it('shows the no-patrol state when the backend answers 404', async () => {
    respondWith({ '/apps/haunt-patrol/api/latest': notFound });
    render(<App />);
    await screen.findByText('No patrol has run yet.');
  });

  it('shows an error naming latest.json when the record is invalid', async () => {
    respondWith({ '/apps/haunt-patrol/api/latest': { record: { version: 9 }, dashboardBaseUrl: 'x' }, '/apps/haunt-patrol/api/summary': summaryBody });
    render(<App />);
    await screen.findByText(/latest\.json is not a valid patrol record/);
  });

  it('falls back to the static files when the backend fails, including a 401', async () => {
    respondWith({
      '/apps/haunt-patrol/api/latest': () => {
        throw { status: 401 };
      },
    });
    staticFetch({ 'data/latest.json': { status: 200, body: latestBody }, 'data/summary.json': { status: 200, body: summaryBody } });
    render(<App />);
    await screen.findByText('Latest patrol: 2026-11-03 (IST)');
    expect(screen.getByText('# Haunt Patrol, 2026-11-03 (IST)')).toBeTruthy();
  });

  it('shows the no-patrol state when the backend is down and the static file is missing', async () => {
    respondWith({
      '/apps/haunt-patrol/api/latest': () => {
        throw new Error('network');
      },
    });
    staticFetch({});
    render(<App />);
    await waitFor(() => expect(screen.getByText('No patrol has run yet.')).toBeTruthy());
  });
});

describe('loadPatrol', () => {
  it('reports an error when neither source works', async () => {
    const view = await loadPatrol(
      () => Promise.reject(new Error('down')),
      () => Promise.reject(new Error('also down')),
    );
    expect(view.kind).toBe('error');
  });
});
