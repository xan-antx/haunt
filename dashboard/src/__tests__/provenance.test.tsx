// Provenance_Panel: copying the Reproduce_Command and the scrollable command box (Req 5.8 to 5.11).

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reproduceCommand } from '../model/reproduce';
import * as derived from './fixtures/derived';
import { bebeRun, listenerRun } from './fixtures/samples';
import { memorySource, renderApp, sampleFiles } from './helpers';

const FAILURE = "Couldn't copy. Select the command and copy it yourself.";

const samples = [
  ['The Listener', listenerRun()],
  ['Bebe', bebeRun()],
] as const;

async function openGhostCam(key: string) {
  const view = renderApp(`/run/${key}/step/1`);
  await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
  return view;
}

function liveRegion(): HTMLElement {
  return screen.getByTestId('live-region');
}

function copyButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Copy command' });
}

function commandBox(name = 'Reproduce command'): HTMLElement {
  return screen.getByRole('region', { name });
}

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gives one element fixed scroll dimensions and a working horizontal scroll position. */
function stubBox(element: HTMLElement, size: { scrollWidth: number; clientWidth: number }) {
  let left = 0;
  const clamp = (value: number) => Math.max(0, Math.min(value, size.scrollWidth - size.clientWidth));
  Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => size.scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => size.clientWidth });
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (value: number) => {
      left = clamp(value);
    },
  });
  Object.defineProperty(element, 'scrollBy', {
    configurable: true,
    value: (options: ScrollToOptions) => {
      left = clamp(left + (options.left ?? 0));
    },
  });
  return size;
}

function fireResize(): void {
  act(() => (ResizeObserver as unknown as { trigger(): void }).trigger());
}

afterEach(() => {
  // jsdom has no navigator.clipboard; remove whatever a test installed.
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
});

describe('Provenance_Panel copy command', () => {
  it.each(samples)('passes exactly reproduceCommand(run) to writeText for %s', async (_name, run) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await openGhostCam(run.key);
    expect(commandBox()).toHaveTextContent(reproduceCommand(run));
    fireEvent.click(copyButton());
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Command copied'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toBe(reproduceCommand(run));
  });

  it('announces "Command copied" only after writeText resolves', async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    setClipboard({ writeText });
    await openGhostCam(listenerRun().key);
    fireEvent.click(copyButton());
    expect(writeText).toHaveBeenCalledTimes(1);
    // Longer than the live region's 50 ms delay, so an early announcement would show by now.
    await act(() => sleep(120));
    expect(liveRegion()).not.toHaveTextContent('Command copied');
    await act(async () => resolve());
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Command copied'));
  });

  it('announces the failure text and keeps the button enabled when writeText rejects', async () => {
    const run = listenerRun();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    await openGhostCam(run.key);
    fireEvent.click(copyButton());
    await waitFor(() => expect(liveRegion()).toHaveTextContent(FAILURE));
    await act(() => sleep(120));
    expect(liveRegion()).not.toHaveTextContent('Command copied');
    expect(copyButton()).toBeEnabled();
    expect(commandBox()).toHaveTextContent(reproduceCommand(run));
    expect(window.getSelection()?.toString()).toBe(reproduceCommand(run));
  });

  it('announces the failure text when navigator.clipboard is missing', async () => {
    expect('clipboard' in navigator).toBe(false);
    await openGhostCam(bebeRun().key);
    fireEvent.click(copyButton());
    await waitFor(() => expect(liveRegion()).toHaveTextContent(FAILURE));
    await act(() => sleep(120));
    expect(liveRegion()).not.toHaveTextContent('Command copied');
    expect(copyButton()).toBeEnabled();
  });
});

describe('Provenance_Panel command box', () => {
  it('is a region named "Reproduce command" on the Ghost Cam', async () => {
    await openGhostCam(listenerRun().key);
    const box = commandBox();
    expect(box).toHaveAttribute('role', 'region');
    expect(box).toHaveAccessibleName('Reproduce command');
  });

  it('names the two Exorcise boxes "Reproduce command, Before" and "Reproduce command, After"', async () => {
    const after = { key: '2026-11-05-listener-pay-bill', folder: 'test/after', origin: 'runs' as const };
    renderApp(
      `/exorcise/${listenerRun().key}/${after.key}`,
      memorySource([...sampleFiles(), { json: derived.listenerAfterFix(), meta: after }]),
    );
    await screen.findByRole('heading', { level: 1 });
    const before = commandBox('Reproduce command, Before');
    const afterBox = commandBox('Reproduce command, After');
    expect(before).not.toBe(afterBox);
    expect(within(before).getByText(/git checkout/)).toBeInTheDocument();
    expect(within(afterBox).getByText(/git checkout/)).toBeInTheDocument();
  });

  it('is in the Tab order only while it overflows, re-checked on resize', async () => {
    await openGhostCam(listenerRun().key);
    const box = commandBox();
    const size = stubBox(box, { scrollWidth: 300, clientWidth: 300 });
    fireResize();
    expect(box).not.toHaveAttribute('tabindex');

    size.clientWidth = 120;
    fireResize();
    expect(box.tabIndex).toBe(0);
    expect(box).toHaveAttribute('tabindex', '0');

    size.clientWidth = 400;
    fireResize();
    expect(box).not.toHaveAttribute('tabindex');
  });

  it('scrolls with ArrowRight, ArrowLeft, Home and End and prevents the default action', async () => {
    await openGhostCam(listenerRun().key);
    const box = commandBox();
    stubBox(box, { scrollWidth: 500, clientWidth: 200 });
    fireResize();
    expect(box).toHaveAttribute('tabindex', '0');

    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.keyDown(box, { key: 'ArrowRight' })).toBe(false);
    const afterRight = box.scrollLeft;
    expect(afterRight).toBeGreaterThan(0);

    expect(fireEvent.keyDown(box, { key: 'ArrowLeft' })).toBe(false);
    expect(box.scrollLeft).toBeLessThan(afterRight);

    expect(fireEvent.keyDown(box, { key: 'End' })).toBe(false);
    expect(box.scrollLeft).toBe(300);

    expect(fireEvent.keyDown(box, { key: 'Home' })).toBe(false);
    expect(box.scrollLeft).toBe(0);

    // Other keys are left alone.
    expect(fireEvent.keyDown(box, { key: 'a' })).toBe(true);
  });
});
