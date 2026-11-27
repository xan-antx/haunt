// Phase 2 of the pre-recording polish (UI-01, UI-04, UI-09, UI-10, UI-14, UI-15, UI-20): the
// thoughts strip, the one-row timeline, the Pause label and keys, screenshot preloading and the
// phone frame. Layout is checked in the browser (e2e/ghostcam-layout.spec.ts and
// e2e/ghostcam-recorded-fit.spec.ts); this file checks the words, the keys and the logic.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBlankPixels, isPortrait, SLOW_LOAD_CAPTION } from '../model/blank';
import { preloadOrder } from '../model/preload';
import { thoughtStrip } from '../model/transcript';
import { isControl } from '../screens/GhostCamScreen';
import { REAL_LISTENER_META, realListenerRun, realListenerSample } from './fixtures/real';
import { BEBE_META, bebeRun, bebeSample, listenerRun } from './fixtures/samples';
import { memorySource, realAndSampleFiles, renderApp } from './helpers';

const REAL = '/run/2026-11-10T1822Z-listener-pay-bill/step';
const BEBE = '/run/2026-11-03-bebe-pay-bill/step';
const SAMPLE = '/run/2026-11-03-listener-pay-bill/step';

async function openStep(base: string, n: number, source = memorySource(realAndSampleFiles())) {
  const view = renderApp(`${base}/${n}`, source);
  await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
  return view;
}

function realWith(change: (json: Record<string, unknown>) => void) {
  const json = realListenerSample();
  change(json);
  return memorySource([{ json, meta: REAL_LISTENER_META }]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UI-01: the thoughts strip', () => {
  it('shows what The Listener was thinking at this step, in full', async () => {
    const run = realListenerRun();
    const step = run.steps.find((s) => s.n === 12)!;
    await openStep(REAL, 12);
    const strip = screen.getByTestId('thoughts-strip');
    expect(within(strip).getByRole('heading', { name: 'What The Listener was thinking' })).toBeInTheDocument();
    expect(within(strip).getByText(step.thought)).toBeInTheDocument();
  });

  it('is named for the AI mind on an AI run', async () => {
    await openStep(
      REAL,
      12,
      realWith((json) => {
        json.mind = 'ai';
      }),
    );
    expect(screen.getByRole('heading', { name: 'What the AI mind decided' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What The Listener was thinking' })).toBeNull();
  });

  it('keeps a very long thought whole inside its own region, so it never lengthens the page', async () => {
    const long = 'I keep thinking about this button. '.repeat(40).trim();
    await openStep(
      REAL,
      12,
      realWith((json) => {
        (json.steps as Array<Record<string, unknown>>).find((s) => s.n === 12)!.thought = long;
      }),
    );
    const body = screen.getByTestId('thoughts-strip-text');
    expect(body).toHaveTextContent(long);
    expect(body).toHaveAttribute('role', 'region');
  });

  it('says so when a step has no thought, and is replaced at every step', async () => {
    const view = await openStep(
      REAL,
      12,
      realWith((json) => {
        (json.steps as Array<Record<string, unknown>>).find((s) => s.n === 12)!.thought = '';
      }),
    );
    expect(screen.getByTestId('thoughts-strip')).toHaveTextContent('The Listener noted no thought at this step.');
    view.unmount();
  });

  it('is only for The Listener: Bebe\'s thoughts are her transcript', async () => {
    await openStep(BEBE, 3);
    expect(screen.queryByTestId('thoughts-strip')).toBeNull();
    expect(thoughtStrip(bebeRun(), 3)).toBeNull();
  });

  it('builds the heading and text for every step of the real Listener run', () => {
    const run = realListenerRun();
    for (const step of run.steps) {
      const strip = thoughtStrip(run, step.n)!;
      expect(strip.heading).toBe('What The Listener was thinking');
      expect(strip.text.length).toBeGreaterThan(0);
    }
  });
});

describe('UI-15: Pause label and keyboard shortcuts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a hint for the keys', async () => {
    await openStep(REAL, 5);
    expect(screen.getByTestId('shortcut-hint')).toHaveTextContent('Space play or pause');
  });

  it('steps with the arrow keys and plays and pauses with Space when focus is on the page', async () => {
    const { router } = await openStep(REAL, 5);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`${REAL}/6`));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`${REAL}/5`));

    vi.useFakeTimers();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(router.state.location.pathname).toBe(`${REAL}/5`);
  });

  it('does not take the keys when a button or a field has focus', async () => {
    const { router } = await openStep(REAL, 5);
    const stepBack = screen.getByRole('button', { name: 'Step back' });
    stepBack.focus();
    fireEvent.keyDown(stepBack, { key: 'ArrowRight' });
    fireEvent.keyDown(stepBack, { key: ' ' });
    expect(router.state.location.pathname).toBe(`${REAL}/5`);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    expect(router.state.location.pathname).toBe(`${REAL}/5`);
    field.remove();
  });

  it('leaves keys with a modifier alone', async () => {
    const { router } = await openStep(REAL, 5);
    fireEvent.keyDown(document.body, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'ArrowRight', altKey: true });
    expect(router.state.location.pathname).toBe(`${REAL}/5`);
  });

  it('tells fields and controls from the page', () => {
    const html = (markup: string) => {
      const host = document.createElement('div');
      host.innerHTML = markup;
      return host.firstElementChild as Element;
    };
    expect(isControl(html('<button>x</button>'))).toBe(true);
    expect(isControl(html('<textarea></textarea>'))).toBe(true);
    expect(isControl(html('<a href="#x">x</a>'))).toBe(true);
    expect(isControl(html('<div tabindex="0">x</div>'))).toBe(true);
    expect(isControl(html('<main tabindex="-1">x</main>'))).toBe(false);
    expect(isControl(html('<p>x</p>'))).toBe(false);
    expect(isControl(document.body)).toBe(false);
    expect(isControl(null)).toBe(false);
  });
});

describe('UI-04: the timeline is one row', () => {
  it('draws no wrapping row and scrolls inside itself', () => {
    const css = readFileSync(join(process.cwd(), 'src/screens/ghostcam/GhostCam.module.css'), 'utf8');
    const rule = /\n\.timeline \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain('flex-wrap: nowrap');
    expect(rule).toContain('overflow-x: auto');
    expect(css).not.toMatch(/\.timeline \{[^}]*flex-wrap: wrap/);
  });
});

describe('UI-10: the stuck notice grows', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/StuckNotice.module.css'), 'utf8');

  it('has no fixed height, no clipped lines and no ellipsis', () => {
    expect(css).not.toMatch(/text-overflow/);
    expect(css).not.toMatch(/[^-]height:\s*(1\.5rem|4\.5rem|100%)/);
    expect(css).not.toMatch(/overflow:\s*hidden/);
    expect(css).not.toMatch(/white-space:\s*nowrap/);
    expect(css).toMatch(/min-height:\s*4\.5rem/);
  });

  it('reserves room for a notice only in a run that has one', async () => {
    await openStep(REAL, 1);
    expect(screen.getByTestId('stuck-notice-slot')).toHaveAttribute('data-reserved', 'true');
  });

  it('reserves nothing in a run with no notice at any step', async () => {
    await openStep(
      REAL,
      1,
      realWith((json) => {
        json.findings = [];
        json.result = 'succeeded';
      }),
    );
    const slot = screen.getByTestId('stuck-notice-slot');
    expect(slot).toHaveAttribute('data-reserved', 'false');
    expect(slot).toBeEmptyDOMElement();
  });

  it('shows all three lines of the notice in full', async () => {
    await openStep(REAL, 12);
    const notice = screen.getByTestId('stuck-notice');
    expect(within(notice).getAllByText(/./, { selector: 'p' })).toHaveLength(3);
  });
});

describe('UI-09: screenshots', () => {
  it('orders the screenshots nearest first, the next step before the previous one', () => {
    const run = listenerRun();
    const order = preloadOrder(run, 5);
    const byStep = run.steps.map((s) => s.screenshot);
    expect(order[0]).toBe(byStep[4]);
    expect(order[1]).toBe(byStep[5]);
    expect(order[2]).toBe(byStep[3]);
    expect(order[3]).toBe(byStep[6]);
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(new Set(byStep.filter(Boolean)).size);
  });

  it('keeps the previous image on screen until the next one has loaded', async () => {
    await openStep(SAMPLE, 1);
    const images = () => Array.from(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img'));
    expect(images()).toHaveLength(1);
    fireEvent.load(images()[0]!);
    const first = images()[0]!.getAttribute('src');
    expect(images()[0]!.getAttribute('alt')).toMatch(/at step 1$/);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByText(/Step 2 of/);
    // The previous image is still drawn (hidden from screen readers); the next loads out of sight.
    expect(images()).toHaveLength(2);
    expect(images()[0]!.getAttribute('src')).toBe(first);
    expect(images()[0]!).toHaveAttribute('aria-hidden', 'true');
    expect(images()[1]!.getAttribute('alt')).toMatch(/at step 2$/);
    expect(images()[1]!.className).toContain('loading');

    fireEvent.load(images()[1]!);
    expect(images()).toHaveLength(1);
    expect(images()[0]!.className).not.toContain('loading');
  });

  it('shows the Placeholder, not a stuck image, when the next image fails', async () => {
    await openStep(SAMPLE, 1);
    const img = () => document.querySelector<HTMLImageElement>('[data-cam-area="shot"] img')!;
    fireEvent.load(img());
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await screen.findByText(/Step 2 of/);
    fireEvent.error(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img')[1]!);
    expect(screen.getByRole('img', { name: 'No screenshot for step 2' })).toBeInTheDocument();
  });
});

describe('UI-14 and UI-20: the phone frame', () => {
  it('tells a blank image from a painted one', () => {
    expect(isBlankPixels(new Uint8ClampedArray(24 * 24 * 4).fill(255))).toBe(true);
    const painted = new Uint8ClampedArray(24 * 24 * 4).fill(255);
    painted[40] = 10;
    expect(isBlankPixels(painted)).toBe(false);
    expect(isBlankPixels([])).toBe(false);
  });

  it('treats a portrait image as a phone screen', () => {
    expect(isPortrait(360, 640)).toBe(true);
    expect(isPortrait(720, 1280)).toBe(true);
    expect(isPortrait(1280, 800)).toBe(false);
    expect(isPortrait(900, 1000)).toBe(false);
  });

  function phantomSource() {
    const json = bebeSample();
    json.ghost = 'phantom';
    return memorySource([{ json, meta: BEBE_META }]);
  }

  function portraitImage(img: HTMLImageElement) {
    Object.defineProperty(img, 'naturalWidth', { value: 360, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 640, configurable: true });
  }

  it('frames a phone screen by height and explains a blank first step', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4).fill(255) }),
    } as unknown as CanvasRenderingContext2D);
    await openStep(BEBE, 1, phantomSource());
    const img = document.querySelector<HTMLImageElement>('[data-cam-area="shot"] img')!;
    portraitImage(img);
    fireEvent.load(img);
    expect(screen.getByTestId('screenshot-box')).toHaveAttribute('data-portrait', 'true');
    expect(screen.getByTestId('slow-load-caption')).toHaveTextContent(SLOW_LOAD_CAPTION);
  });

  it('adds the slow 3G caption only to the first step, and only for The Phantom', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4).fill(255) }),
    } as unknown as CanvasRenderingContext2D);
    // The Phantom, step 2: blank but not the first step.
    const second = await openStep(BEBE, 2, phantomSource());
    const img = document.querySelector<HTMLImageElement>('[data-cam-area="shot"] img')!;
    portraitImage(img);
    fireEvent.load(img);
    expect(screen.queryByTestId('slow-load-caption')).toBeNull();
    second.unmount();

    // Bebe, step 1: blank, but not a slow 3G walk.
    await openStep(BEBE, 1);
    const bebeImg = document.querySelector<HTMLImageElement>('[data-cam-area="shot"] img')!;
    fireEvent.load(bebeImg);
    expect(screen.queryByTestId('slow-load-caption')).toBeNull();
  });
});
