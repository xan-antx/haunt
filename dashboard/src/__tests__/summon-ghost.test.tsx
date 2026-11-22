// "Summon a live ghost": the local button talks to the dev endpoint, and the published site explains.

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunSourceProvider } from '../data/hooks';
import type { RunSource } from '../data/source';
import { LOCAL_COMMANDS, LOCAL_ONLY_SENTENCE, SUMMON_ENDPOINT, SUMMON_HEADER, SummonGhost } from '../components/SummonGhost';
import { memorySource, sampleFiles } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderSummon(local: boolean, source: RunSource = memorySource(sampleFiles())) {
  return render(
    <MemoryRouter>
      <RunSourceProvider source={source}>
        <SummonGhost local={local} />
      </RunSourceProvider>
    </MemoryRouter>,
  );
}

describe('Summon a live ghost, published site', () => {
  it('explains in one sentence that live ghosts run locally, and shows the two commands', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderSummon(false);
    const button = screen.getByRole('button', { name: 'Summon a live ghost' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(LOCAL_ONLY_SENTENCE);
    expect(LOCAL_ONLY_SENTENCE.match(/\./g)).toHaveLength(1);
    expect(document.querySelector('pre code')?.textContent).toBe(LOCAL_COMMANDS.join('\n'));
    expect(LOCAL_COMMANDS).toEqual(['cd dashboard', 'npm run dev']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Summon a live ghost, local dev', () => {
  it('falls back to the explanation when nothing answers at the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200 })));
    renderSummon(true);
    expect(await screen.findByText(LOCAL_ONLY_SENTENCE)).toBeInTheDocument();
  });

  it('starts a ghost, shows progress, refreshes the runs and links to the new run', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const source = memorySource(sampleFiles());
    const refresh = vi.fn();
    source.refresh = refresh;

    const statuses = [
      { state: 'running', message: 'The Listener is at step 3.', step: 3 },
      { state: 'done', message: 'The Listener finished. The new run is on the dashboard.', runKey: 'new-run' },
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ state: 'running', message: 'Getting ready.' }, 202);
      if (fetchMock.mock.calls.length === 1) return json({ state: 'idle', message: '' });
      return json(statuses.shift() ?? statuses[0]);
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSummon(true, source);
    const button = await screen.findByRole('button', { name: 'Summon a live ghost' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(button);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe(SUMMON_ENDPOINT);
    expect((post[1]!.headers as Record<string, string>)[SUMMON_HEADER]).toBe('1');
    expect(screen.getByRole('status')).toHaveTextContent('Getting ready.');
    expect(screen.getByRole('button', { name: 'Summon a live ghost' })).toHaveAttribute('aria-disabled', 'true');

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole('status')).toHaveTextContent('The Listener is at step 3.');
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByRole('status')).toHaveTextContent('The Listener finished.');
    expect(screen.getByRole('link', { name: 'Watch the new run in the Ghost Cam' })).toHaveAttribute('href', '/run/new-run/step/1');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Summon a live ghost' })).not.toHaveAttribute('aria-disabled');
  });

  it('says plainly when the endpoint refuses a non-local request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ error: 'no' }, 403) : json({ state: 'idle', message: '' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSummon(true);
    await user.click(await screen.findByRole('button', { name: 'Summon a live ghost' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('only be summoned from this computer'));
  });
});
