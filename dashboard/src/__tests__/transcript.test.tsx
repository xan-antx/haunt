import axe from 'axe-core';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTranscript, NOTHING_SPOKEN, NOTHING_THOUGHT } from '../model/transcript';
import { BEBE_META, LISTENER_META, bebeRun, bebeSample, listenerRun, listenerSample, mustRun } from './fixtures/samples';
import { memorySource, renderApp, sampleFiles } from './helpers';

const LISTENER = '/run/2026-11-03-listener-pay-bill/step';
const BEBE = '/run/2026-11-03-bebe-pay-bill/step';

describe('buildTranscript with the sample runs', () => {
  it('builds nine spoken lines for The Listener at step 9, fading 3,3,3,3,3,3,2,1,0', () => {
    const run = listenerRun();
    const lines = buildTranscript(run, 9);
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(lines.map((l) => l.fade)).toEqual([3, 3, 3, 3, 3, 3, 2, 1, 0]);
    expect(lines.map((l) => l.text)).toEqual(run.steps.map((s) => s.spoken));
    expect(lines.map((l) => l.current)).toEqual([false, false, false, false, false, false, false, false, true]);
    expect(lines.every((l) => !l.empty)).toBe(true);
  });

  it('builds six thought lines for Bebe at step 6, fading 3,3,3,2,1,0', () => {
    const run = bebeRun();
    const lines = buildTranscript(run, 6);
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lines.map((l) => l.fade)).toEqual([3, 3, 3, 2, 1, 0]);
    expect(lines.map((l) => l.text)).toEqual(run.steps.map((s) => s.thought));
    expect(lines.filter((l) => l.current).map((l) => l.n)).toEqual([6]);
  });

  it('stops at the current step', () => {
    const lines = buildTranscript(listenerRun(), 2);
    expect(lines.map((l) => [l.n, l.fade, l.current])).toEqual([
      [1, 1, false],
      [2, 0, true],
    ]);
  });

  it('returns no lines for a step that is not in the run', () => {
    expect(buildTranscript(listenerRun(), 42)).toEqual([]);
  });

  it('keeps repeated texts as separate lines', () => {
    const json = listenerSample();
    const steps = json.steps as Array<Record<string, unknown>>;
    steps[5]!.spoken = 'Button';
    steps[6]!.spoken = 'Button';
    const lines = buildTranscript(mustRun(json, LISTENER_META), 7);
    expect(lines).toHaveLength(7);
    expect(lines.slice(5).map((l) => [l.n, l.text])).toEqual([
      [6, 'Button'],
      [7, 'Button'],
    ]);
  });

  it('shows a note for empty or whitespace-only text and still counts the line', () => {
    const listener = listenerSample();
    (listener.steps as Array<Record<string, unknown>>)[2]!.spoken = '';
    const spoken = buildTranscript(mustRun(listener, LISTENER_META), 3);
    expect(spoken).toHaveLength(3);
    expect(spoken[2]).toEqual({ n: 3, text: NOTHING_SPOKEN, empty: true, fade: 0, current: true });

    const bebe = bebeSample();
    (bebe.steps as Array<Record<string, unknown>>)[0]!.thought = '   ';
    const thought = buildTranscript(mustRun(bebe, BEBE_META), 2);
    expect(thought[0]).toEqual({ n: 1, text: NOTHING_THOUGHT, empty: true, fade: 1, current: false });
    expect(thought[1]!.empty).toBe(false);
  });
});

// jsdom has no layout. These stubs give the transcript scroller a box and content
// height (one 40 px row per line), so scrolling and overflow can be measured.
const size = { clientHeight: 100, rowHeight: 40 };

function isTranscript(el: Element): boolean {
  return el instanceof HTMLElement && el.dataset.testid === 'transcript';
}

beforeEach(() => {
  size.clientHeight = 100;
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return isTranscript(this) ? this.querySelectorAll('li').length * size.rowHeight : 0;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return isTranscript(this) ? size.clientHeight : 0;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openStep(base: string, n: number, source = memorySource(sampleFiles())) {
  const view = renderApp(`${base}/${n}`, source);
  await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
  return view;
}

function transcript(name: 'Spoken transcript' | 'Thought transcript' = 'Spoken transcript') {
  return screen.getByRole('region', { name });
}

function lines(name?: 'Spoken transcript' | 'Thought transcript') {
  return within(transcript(name)).getAllByRole('listitem');
}

function bottom(el: HTMLElement): number {
  return el.scrollHeight - el.clientHeight;
}

describe('Transcript component', () => {
  it('shows each step number in text and marks only the last line as current', async () => {
    await openStep(LISTENER, 9);
    const items = lines();
    expect(items).toHaveLength(9);
    items.forEach((li, i) => {
      expect(li).toHaveTextContent(new RegExp(`^Step ${i + 1}\\b`));
      if (i === items.length - 1) expect(li).toHaveAttribute('aria-current', 'step');
      else expect(li).not.toHaveAttribute('aria-current');
    });
    expect(items[8]).toHaveTextContent('Step 9 Button, Confirm');
  });

  it('renders the thought transcript for Bebe', async () => {
    await openStep(BEBE, 6);
    const items = lines('Thought transcript');
    expect(items).toHaveLength(6);
    expect(items[5]).toHaveAttribute('aria-current', 'step');
    expect(items[5]).toHaveTextContent('Step 6 Success! The confirmation message appeared clearly.');
    expect(screen.queryByRole('region', { name: 'Spoken transcript' })).not.toBeInTheDocument();
  });

  it('shows only lines 1 to n after Step back', async () => {
    const { router } = await openStep(LISTENER, 9);
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${LISTENER}/8`));
    await waitFor(() => expect(lines()).toHaveLength(8));
    const items = lines();
    expect(items.map((li) => li.textContent)).toEqual(
      listenerRun()
        .steps.slice(0, 8)
        .map((s) => `Step ${s.n} ${s.spoken}`),
    );
    expect(items[7]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((li) => li.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('scrolls to the bottom so the Current_Line is visible, on open and on step change', async () => {
    const { router } = await openStep(LISTENER, 9);
    const el = transcript();
    expect(el.scrollHeight).toBe(360);
    expect(el.scrollTop).toBe(bottom(el));
    expect(el.scrollTop).toBe(260);

    await act(async () => {
      await router.navigate(`${LISTENER}/5`, { replace: true });
    });
    await waitFor(() => expect(lines()).toHaveLength(5));
    expect(el.scrollTop).toBe(bottom(el));
    expect(el.scrollTop).toBe(100);
  });

  it('keeps focus where it was and keeps scrolling to the bottom during playback', async () => {
    const { router } = await openStep(LISTENER, 6);
    vi.useFakeTimers();
    const play = screen.getByRole('button', { name: 'Play' });
    play.focus();
    fireEvent.click(play);

    for (const n of [7, 8, 9]) {
      act(() => vi.advanceTimersByTime(1500));
      expect(router.state.location.pathname).toBe(`${LISTENER}/${n}`);
      expect(lines()).toHaveLength(n);
      expect(transcript().scrollTop).toBe(bottom(transcript()));
      expect(document.activeElement).toBe(play);
    }
  });

  it('announces only the new step in the live region', async () => {
    await openStep(LISTENER, 8);
    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    await waitFor(() => expect(screen.getByTestId('live-region').textContent).toBe('Step 9: Button, Confirm'));
    expect(transcript()).not.toHaveAttribute('aria-live');
    expect(transcript().querySelector('[aria-live]')).toBeNull();
  });

  it('announces "nothing was spoken" and shows a note line for an empty step', async () => {
    const json = listenerSample();
    (json.steps as Array<Record<string, unknown>>)[8]!.spoken = '';
    await openStep(LISTENER, 8, memorySource([{ json, meta: LISTENER_META }]));
    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    await waitFor(() => expect(screen.getByTestId('live-region').textContent).toBe('Step 9: nothing was spoken'));
    const items = lines();
    expect(items).toHaveLength(9);
    expect(items[8]).toHaveTextContent(`Step 9 ${NOTHING_SPOKEN}`);
    expect(items[8]).toHaveAttribute('aria-current', 'step');
  });

  it('is focusable only while its lines overflow', async () => {
    size.clientHeight = 1000;
    await openStep(LISTENER, 9);
    const el = transcript();
    expect(el).not.toHaveAttribute('tabindex');

    size.clientHeight = 100;
    act(() => (ResizeObserver as unknown as { trigger(): void }).trigger());
    expect(el).toHaveAttribute('tabindex', '0');

    size.clientHeight = 1000;
    act(() => (ResizeObserver as unknown as { trigger(): void }).trigger());
    expect(el).not.toHaveAttribute('tabindex');
  });

  it('scrolls with ArrowUp and ArrowDown without scrolling the page', async () => {
    await openStep(LISTENER, 9);
    const el = transcript();
    expect(el).toHaveAttribute('tabindex', '0');
    el.focus();
    const start = el.scrollTop;

    const up = fireEvent.keyDown(el, { key: 'ArrowUp' });
    expect(up).toBe(false); // preventDefault() was called, so the page does not scroll too
    expect(el.scrollTop).toBe(start - 40);

    fireEvent.keyDown(el, { key: 'ArrowDown' });
    expect(el.scrollTop).toBe(start);
    expect(document.activeElement).toBe(el);
  });

  it.each([
    ['The Listener at step 9', LISTENER, 9],
    ['Bebe at step 6', BEBE, 6],
  ])('has no axe violations for %s while overflowing', async (_name, base, n) => {
    await openStep(base, n);
    expect(screen.getByTestId('transcript')).toHaveAttribute('tabindex', '0');
    // jsdom cannot compute colors; transcript contrast is covered by the token contrast test.
    const results = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
