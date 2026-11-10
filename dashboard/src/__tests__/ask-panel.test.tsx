import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

async function renderCam(path: string) {
  const result = renderApp(path);
  await screen.findByRole('heading', { level: 1 });
  return result;
}

const here = (router: ReturnType<typeof renderApp>['router']) =>
  router.state.location.pathname + router.state.location.search;

describe('Ask_Panel in the Ghost Cam (Req 12)', () => {
  it('opens from the Ask_Button in the Run_Summary, with focus on the first question', async () => {
    const user = userEvent.setup();
    const { router } = await renderCam(`/run/${L}/step/9`);
    const summary = document.querySelector('[data-cam-area="summary"]') as HTMLElement;
    const askButton = within(summary).getByRole('button', { name: 'Ask this ghost' });
    expect(askButton).toHaveAttribute('aria-expanded', 'false');
    expect(askButton).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('region', { name: 'Ask The Listener' })).not.toBeInTheDocument();

    await user.click(askButton);
    await waitFor(() => expect(here(router)).toBe(`/run/${L}/step/9?ask=open`));
    expect(router.state.historyAction).toBe('REPLACE');
    const panel = screen.getByRole('region', { name: 'Ask The Listener' });
    expect(askButton).toHaveAttribute('aria-expanded', 'true');
    expect(askButton).toHaveAttribute('aria-controls', panel.id);

    const questions = within(panel).getByRole('group', { name: 'Questions' });
    const buttons = within(questions).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Why did you give up?',
      'Where did you get stuck?',
      'What did you hear?',
      'What would have helped?',
    ]);
    await waitFor(() => expect(buttons[0]).toHaveFocus());
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent('The Listener is listening');
    // The panel adds no grid area of its own.
    expect(panel).not.toHaveAttribute('data-cam-area');
  });

  it('answers a question, keeps it in the URL and keeps focus on the question', async () => {
    const user = userEvent.setup();
    const { router } = await renderCam(`/run/${L}/step/9?ask=open`);
    const panel = screen.getByRole('region', { name: 'Ask The Listener' });
    const why = within(panel).getByRole('button', { name: 'Why did you give up?' });
    await user.click(why);
    await waitFor(() => expect(here(router)).toBe(`/run/${L}/step/9?ask=why-give-up`));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(why).toHaveAttribute('aria-pressed', 'true');
    expect(why).toHaveFocus();

    const board = within(panel).getByRole('region', { name: 'The Listener answers: Why did you give up?' });
    expect(board).toHaveAttribute('aria-live', 'polite');
    expect(board).toHaveTextContent('I gave up at step 9 on /bill.');
    expect(board).toHaveTextContent('At step 7, The pay button has no accessible name.');
  });

  it('follows a step citation with the panel still open on the same question', async () => {
    const user = userEvent.setup();
    const { router } = await renderCam(`/run/${L}/step/9?ask=why-give-up`);
    const panel = screen.getByRole('region', { name: 'Ask The Listener' });
    await user.click(within(panel).getByRole('link', { name: 'step 7' }));
    await waitFor(() => expect(here(router)).toBe(`/run/${L}/step/7?ask=why-give-up`));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByRole('region', { name: 'Ask The Listener' })).toBeInTheDocument();
    expect(document.querySelector('[data-cam-area="controls"]')).toHaveTextContent('Step 7 of 9');
  });

  it('keeps the panel open while stepping with the Control_Row', async () => {
    const user = userEvent.setup();
    const { router } = await renderCam(`/run/${L}/step/9?ask=where-stuck`);
    await user.click(screen.getByRole('button', { name: 'Step back' }));
    await waitFor(() => expect(here(router)).toBe(`/run/${L}/step/8?ask=where-stuck`));
    expect(screen.getByRole('region', { name: 'Ask The Listener' })).toBeInTheDocument();
  });

  it('closes with Escape and with Close, removing ask and returning focus to the Ask_Button', async () => {
    const user = userEvent.setup();
    const { router } = await renderCam(`/run/${B}/step/3?ask=what-helped`);
    const panel = screen.getByRole('region', { name: 'Ask Bebe' });
    expect(panel).toHaveTextContent('At step 3: This text in my language.');

    within(panel).getByRole('button', { name: 'What did you hear?' }).focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(here(router)).toBe(`/run/${B}/step/3`));
    expect(screen.queryByRole('region', { name: 'Ask Bebe' })).not.toBeInTheDocument();
    const askButton = screen.getByRole('button', { name: 'Ask this ghost' });
    expect(askButton).toHaveFocus();
    expect(askButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(askButton);
    await waitFor(() => expect(here(router)).toBe(`/run/${B}/step/3?ask=open`));
    await user.click(within(screen.getByRole('region', { name: 'Ask Bebe' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(here(router)).toBe(`/run/${B}/step/3`));
    expect(askButton).toHaveFocus();
  });

  it('does not trap focus: Tab moves from the panel on to the screenshot area and beyond', async () => {
    const user = userEvent.setup();
    await renderCam(`/run/${L}/step/9?ask=open`);
    const panel = screen.getByRole('region', { name: 'Ask The Listener' });
    within(panel).getByRole('button', { name: 'What would have helped?' }).focus();
    await user.tab();
    expect(panel.contains(document.activeElement)).toBe(false);
  });
});
