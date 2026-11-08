import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_VOICE_REASON } from '../hooks/useApproximateVoice';
import { LISTENER_META, listenerSample } from './fixtures/samples';
import { memorySource, renderApp } from './helpers';

const LISTENER = '/run/2026-11-03-listener-pay-bill/step';
const BEBE = '/run/2026-11-03-bebe-pay-bill/step';

async function openStep(base: string, n: number) {
  const view = renderApp(`${base}/${n}`);
  await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
  return view;
}

function currentStepButton() {
  const timeline = screen.getByRole('region', { name: 'Timeline' });
  return within(timeline)
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-current') === 'step')!;
}

describe('Ghost Cam panels', () => {
  it('shows the Spoken panel for The Listener', async () => {
    await openStep(LISTENER, 9);
    expect(screen.getByRole('heading', { name: 'What The Listener heard' })).toBeInTheDocument();
    expect(screen.getByText('Button, Confirm')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /was thinking/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('waveform')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the Thought panel for Bebe', async () => {
    await openStep(BEBE, 3);
    expect(screen.getByRole('heading', { name: 'What Bebe was thinking' })).toBeInTheDocument();
    expect(screen.getByText(/some of the helper text is in English only/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /heard/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read aloud (approximation)' })).not.toBeInTheDocument();
  });

  it('shows step info, mission, result and provenance', async () => {
    await openStep(LISTENER, 9);
    expect(screen.getByText('Step 9 of 9')).toBeInTheDocument();
    expect(screen.getByText("Pay this month's electricity bill")).toBeInTheDocument();
    expect(screen.getByText(/WHEN the user submits a valid payment/)).toBeInTheDocument();
    expect(screen.getByText('def5678')).toBeInTheDocument();
    expect(screen.getByText(/git checkout def5678 && npx haunt run --ghost listener/)).toBeInTheDocument();
    expect(document.title).toBe('Step 9 of 9 · The Listener · Ghost Cam · Haunt');
  });

  it('shows the Placeholder when the screenshot fails to load', async () => {
    await openStep(LISTENER, 9);
    const img = screen.getByRole('img', { name: 'Screenshot of /bill at step 9' });
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'No screenshot for step 9' })).toBeInTheDocument();
    expect(screen.getByText('No screenshot for step 9')).toBeInTheDocument();
  });

  it('shows one merged Stuck_Notice on the last step', async () => {
    await openStep(LISTENER, 9);
    const notices = screen.getAllByTestId('stuck-notice');
    expect(notices).toHaveLength(1);
    expect(screen.getByText('The Listener got trapped here and gave up.')).toBeInTheDocument();
    expect(notices[0]!.textContent).toContain('Cannot escape the payment confirmation dialog');
    expect(screen.queryByRole('heading', { name: 'The Listener got trapped here.' })).not.toBeInTheDocument();
  });

  it('keeps the empty Stuck_Notice slot on a step with no notice', async () => {
    await openStep(LISTENER, 1);
    expect(screen.getByTestId('stuck-notice-slot')).toBeEmptyDOMElement();
  });

  it('shows the zero-sized focusBox warning for Bebe', async () => {
    await openStep(BEBE, 2);
    expect(screen.getByText(/Notes about this run file \(1\)/)).toBeInTheDocument();
  });
});

describe('Ghost Cam renders run text as plain text', () => {
  it('shows HTML in a run file as literal text', async () => {
    const json = listenerSample();
    const steps = json.steps as Array<Record<string, unknown>>;
    steps[0]!.spoken = '<img src=x onerror="window.__haunted=1"><b>bold</b>';
    renderApp(`${LISTENER}/1`, memorySource([{ json, meta: LISTENER_META }]));
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(screen.getByText('<img src=x onerror="window.__haunted=1"><b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('main b')).toBeNull();
    expect((window as { __haunted?: number }).__haunted).toBeUndefined();
  });
});

describe('Ghost Cam URLs', () => {
  it('opens a deep link to step 9 paused', async () => {
    const { router } = await openStep(LISTENER, 9);
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    expect(currentStepButton()).toHaveAccessibleName('Step 9, finding: Keyboard trap');
    expect(router.state.location.pathname).toBe(`${LISTENER}/9`);
  });

  it('redirects #/run/:key to step 1', async () => {
    const { router } = renderApp('/run/2026-11-03-listener-pay-bill');
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(router.state.location.pathname).toBe(`${LISTENER}/1`);
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('explains an unknown run key', async () => {
    renderApp('/run/nobody/step/1');
    expect(await screen.findByRole('heading', { name: 'No ghost by that name has walked here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go back to Home' })).toBeInTheDocument();
  });

  it('explains an out-of-range step', async () => {
    renderApp(`${LISTENER}/42`);
    expect(await screen.findByText('This run has steps 1 to 9.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to step 1' })).toHaveAttribute('href', `${LISTENER}/1`);
  });
});

describe('Ghost Cam controls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays every 1500 ms, announces each step, and pauses at the last step', async () => {
    const { router } = await openStep(LISTENER, 7);
    vi.useFakeTimers();
    const play = screen.getByRole('button', { name: 'Play' });
    play.focus();
    fireEvent.click(play);
    expect(play).toHaveAttribute('aria-pressed', 'true');

    act(() => vi.advanceTimersByTime(1499));
    expect(router.state.location.pathname).toBe(`${LISTENER}/7`);
    act(() => vi.advanceTimersByTime(1));
    expect(router.state.location.pathname).toBe(`${LISTENER}/8`);
    expect(router.state.historyAction).toBe('REPLACE');
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId('live-region')).toHaveTextContent('Step 8: Dialog, Payment confirmation');
    expect(document.activeElement).toBe(play);

    act(() => vi.advanceTimersByTime(1500));
    expect(router.state.location.pathname).toBe(`${LISTENER}/9`);
    expect(play).toHaveAttribute('aria-pressed', 'false');
    act(() => vi.advanceTimersByTime(5000));
    expect(router.state.location.pathname).toBe(`${LISTENER}/9`);
  });

  it('stops playing when the tab is hidden', async () => {
    const { router } = await openStep(LISTENER, 1);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(router.state.location.pathname).toBe(`${LISTENER}/1`);
    visibility.mockRestore();
  });

  it('marks Step back unavailable on step 1 and Step forward on the last step', async () => {
    const { router } = await openStep(LISTENER, 1);
    const back = screen.getByRole('button', { name: 'Step back' });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(back);
    expect(router.state.location.pathname).toBe(`${LISTENER}/1`);

    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${LISTENER}/2`));
    await waitFor(() => expect(back).not.toHaveAttribute('aria-disabled'));

    await act(async () => {
      await router.navigate(`${LISTENER}/9`, { replace: true });
    });
    const forward = screen.getByRole('button', { name: 'Step forward' });
    await waitFor(() => expect(forward).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(forward);
    expect(router.state.location.pathname).toBe(`${LISTENER}/9`);
  });

  it('moves to a timeline step and pauses', async () => {
    const { router } = await openStep(LISTENER, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step 7, finding: Button with no name' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${LISTENER}/7`));
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    expect(currentStepButton()).toHaveAccessibleName('Step 7, finding: Button with no name');
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    expect(within(timeline).getAllByRole('button')).toHaveLength(9);
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(9);
  });
});

describe('Approximate voice', () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  const remote = { name: 'Cloud', lang: 'en-US', localService: false } as SpeechSynthesisVoice;
  const local = { name: 'Local', lang: 'en-GB', localService: true } as SpeechSynthesisVoice;
  let voices: SpeechSynthesisVoice[] = [];

  class FakeUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null = null;
    lang = '';
    constructor(text: string) {
      this.text = text;
    }
  }

  beforeEach(() => {
    speak.mockReset();
    cancel.mockReset();
    voices = [remote, local];
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak,
        cancel,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    document.documentElement.lang = 'en';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  });

  it('is off by default and speaks with a local voice only when turned on', async () => {
    await openStep(LISTENER, 2);
    const toggle = screen.getByRole('button', { name: 'Read aloud (approximation)' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    expect(
      screen.getByText(/This uses your browser's built-in voice. It is an approximation, not real screen reader output./),
    ).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.text).toBe('Link, Pay your bill');
    expect(utterance.voice).toBe(local);
  });

  it('cancels and speaks again on step change, and cancels on toggle off and unmount', async () => {
    const { unmount } = await openStep(LISTENER, 2);
    const toggle = screen.getByRole('button', { name: 'Read aloud (approximation)' });
    // Wait until the local voice has been picked up.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    fireEvent.click(toggle);
    await waitFor(() => expect(speak).toHaveBeenCalled());
    cancel.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    await waitFor(() => expect((speak.mock.calls.at(-1)![0] as FakeUtterance).text).toBe('Page loading'));
    expect(cancel).toHaveBeenCalled();

    cancel.mockClear();
    fireEvent.click(toggle);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    cancel.mockClear();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });

  it('is unavailable with a reason when there is no local voice', async () => {
    voices = [remote];
    await openStep(LISTENER, 2);
    const toggle = screen.getByRole('button', { name: 'Read aloud (approximation)' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(new RegExp(NO_VOICE_REASON))).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(speak).not.toHaveBeenCalled();
  });

  it('is unavailable when speechSynthesis does not exist', async () => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
    await openStep(LISTENER, 2);
    expect(screen.getByRole('button', { name: 'Read aloud (approximation)' })).toHaveAttribute('aria-disabled', 'true');
  });
});
