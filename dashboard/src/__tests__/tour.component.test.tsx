import axe from 'axe-core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUR_UNAVAILABLE } from '../components/tour/Tour';
import { memorySource, renderApp } from './helpers';

const L = '2026-11-03-listener-pay-bill';

// jsdom has no layout, so every box is empty. The results section is placed far down a tall page,
// so the tour has to scroll to it.
const scrollTo = vi.fn();
const RESULTS_TOP = 2000;
beforeEach(() => {
  scrollTo.mockClear();
  vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const results = this.matches('[data-tour="results"]');
    const box = { x: 0, y: results ? RESULTS_TOP : 0, left: 0, top: results ? RESULTS_TOP : 0, width: results ? 800 : 0, height: results ? 300 : 0 };
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box } as DOMRect;
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 6000 });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document.documentElement, 'scrollHeight');
  vi.unstubAllGlobals();
});

async function startTour() {
  const user = userEvent.setup();
  const view = renderApp('/');
  await screen.findByRole('heading', { level: 1 });
  const button = screen.getByRole('button', { name: 'Take the 60-second tour' });
  await user.click(button);
  const dialog = await screen.findByRole('dialog', { name: 'What the ghosts found' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveFocus());
  return { user, button, dialog, ...view };
}

const here = (router: ReturnType<typeof renderApp>['router']) =>
  router.state.location.pathname + router.state.location.search;

/** Presses Next and waits for the next stop's dialog, with focus on its Next or Finish button. */
async function next(user: ReturnType<typeof userEvent.setup>, title: string, last = false) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  const dialog = await screen.findByRole('dialog', { name: title });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: last ? 'Finish' : 'Next' })).toHaveFocus());
  return dialog;
}

describe('the 60-second tour (Req 22)', () => {
  it('opens as a modal dialog on the Home results, with the rest of the page inert', async () => {
    const { dialog, container } = await startTour();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      'Each card says in plain words what happened to one ghost on Lantern Bills. Press Watch it happen on a card to see that moment.',
    );
    expect(dialog).toHaveTextContent('Tour · 1 of 8');
    expect(container).toHaveAttribute('inert');
    expect(dialog.closest('[inert]')).toBeNull();
    expect(document.querySelector('[data-tour-highlight]')).not.toBeNull();
    // Scrolled so the results are fully on screen, with room around them.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    const { top } = scrollTo.mock.calls[0]![0] as { top: number };
    // (jsdom's window is 768 px tall and its callout has no height.)
    expect(RESULTS_TOP - top).toBeGreaterThanOrEqual(24);
    expect(RESULTS_TOP + 300 - top).toBeLessThanOrEqual(768 - 24);
  });

  it('marks Back unavailable on the first stop, and Back does nothing there', async () => {
    const { user, dialog, router } = await startTour();
    const back = within(dialog).getByRole('button', { name: 'Back' });
    expect(back).toHaveAttribute('aria-disabled', 'true');
    await user.click(back);
    expect(screen.getByRole('dialog', { name: 'What the ghosts found' })).toBeInTheDocument();
    expect(here(router)).toBe('/');
  });

  it('wraps Tab and Shift+Tab between its three buttons', async () => {
    const { user, dialog } = await startTour();
    const [back, nextButton, skip] = within(dialog).getAllByRole('button') as [HTMLElement, HTMLElement, HTMLElement];
    expect([back, nextButton, skip].map((b) => b.textContent)).toEqual(['Back', 'Next', 'Skip']);
    await user.tab();
    expect(skip).toHaveFocus();
    await user.tab();
    expect(back).toHaveFocus();
    await user.tab({ shift: true });
    expect(skip).toHaveFocus();
  });

  it('walks all eight stops across the screens and finishes on Spec Coverage', async () => {
    const { user, router, container } = await startTour();

    await next(user, 'What the page looked like');
    expect(here(router)).toBe(`/run/${L}/step/9`);
    await next(user, 'What The Listener heard');
    const notice = await next(user, 'Where it got stuck');
    expect(notice).toHaveAccessibleDescription(/Ask this ghost/);
    await next(user, 'Every step of the visit');
    expect(here(router)).toBe(`/run/${L}/step/9`);
    await next(user, 'Every problem in one place');
    expect(here(router)).toBe('/graveyard');
    await next(user, 'Before and after a fix');
    expect(here(router)).toBe('/exorcise');
    const last = await next(user, 'Which requirements people can reach', true);
    expect(here(router)).toBe('/coverage');
    expect(last).toHaveTextContent('Tour · 8 of 8');

    await user.click(within(last).getByRole('button', { name: 'Finish' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute('inert');
    expect(document.querySelector('[data-tour-host]')).toBeNull();
    expect(here(router)).toBe('/coverage');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Spec Coverage' })).toHaveFocus());
  });

  it('goes Back to the earlier stop and its screen', async () => {
    const { user, router } = await startTour();
    await next(user, 'What the page looked like');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const dialog = await screen.findByRole('dialog', { name: 'What the ghosts found' });
    await waitFor(() => expect(here(router)).toBe('/'));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveFocus());

    // Home was rendered again, so the tour button is a new element; focus still returns to it.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Take the 60-second tour' })).toHaveFocus());
  });

  it('closes with Escape on the first stop and returns focus to the tour button', async () => {
    const { user, button, container, router } = await startTour();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute('inert');
    await waitFor(() => expect(button).toHaveFocus());
    expect(here(router)).toBe('/');
  });

  it('closes with Escape on another screen without changing the URL, focusing its h1', async () => {
    const { user, router } = await startTour();
    await next(user, 'What the page looked like');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(here(router)).toBe(`/run/${L}/step/9`);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Ghost Cam/ })).toHaveFocus());
  });

  it('closes with Skip', async () => {
    const { user, dialog, button } = await startTour();
    await user.click(within(dialog).getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('scrolls instantly under Reduced_Motion and smoothly otherwise', async () => {
    await startTour();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
  });

  it('scrolls smoothly when motion is allowed', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('no-preference'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    window.matchMedia = globalThis.matchMedia;
    try {
      await startTour();
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    } finally {
      delete (window as Partial<Window>).matchMedia;
    }
  });

  it('has no axe violations while open', async () => {
    const { user } = await startTour();
    const check = async () => {
      const results = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
      return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    expect(await check()).toEqual([]);
    await next(user, 'What the page looked like');
    expect(await check()).toEqual([]);
  }, 20_000);

  it('is an unlit candle with a reason when there are no runs', async () => {
    renderApp('/', memorySource([]));
    await screen.findByRole('heading', { level: 1 });
    const button = screen.getByRole('button', { name: 'Take the 60-second tour' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(TOUR_UNAVAILABLE);
    await userEvent.setup().click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
