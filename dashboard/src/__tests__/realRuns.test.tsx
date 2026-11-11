import axe from 'axe-core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Run } from '../data/types';
import { evidenceSentence, stuckPhrase, trapPlace } from '../model/findingWords';
import { groupHaunts, startHereTarget } from '../model/haunts';
import { newestRun, splitRuns } from '../model/origin';
import { blockingFindings, watchStep } from '../model/results';
import { ghostCamTarget } from '../model/screens';
import { answer, answerText } from '../model/seance';
import { pageName } from '../model/sites';
import { stuckNotice } from '../model/stuckNotice';
import { buildTour } from '../model/tour';
import { REAL_LISTENER_META, realListenerRun } from './fixtures/real';
import { bebeRun, listenerRun } from './fixtures/samples';
import { memorySource, realAndSampleFiles, renderApp } from './helpers';

// Req 24 with the fixed copies in fixtures/runs/: one real Listener run and the two samples.
const REAL = REAL_LISTENER_META.key;
const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

function runs(): Run[] {
  return [realListenerRun(), listenerRun(), bebeRun()];
}

function stepOf(run: Run, n: number) {
  return run.steps.find((s) => s.n === n)!;
}

describe('real runs win (Req 24.1, 24.2)', () => {
  it('hides the Listener sample and keeps the Bebe sample', () => {
    const { shown, hidden } = splitRuns(runs());
    expect(shown.map((r) => r.key)).toEqual([REAL, B]);
    expect(hidden.map((r) => r.key)).toEqual([L]);
  });

  it('shows every sample while no ghost has a real run', () => {
    const { shown, hidden } = splitRuns([listenerRun(), bebeRun()]);
    expect(shown.map((r) => r.key)).toEqual([L, B]);
    expect(hidden).toEqual([]);
  });

  it('picks the real run even when a sample is newer', () => {
    const newerSample = { ...listenerRun(), startedAt: '2026-12-01T00:00:00Z' };
    expect(newestRun([newerSample, realListenerRun()], 'listener')!.key).toBe(REAL);
    const haunt = groupHaunts([newerSample, realListenerRun(), bebeRun()])[0]!;
    expect(haunt.ghosts.map((g) => g.latest.key)).toEqual([REAL, B]);
  });
});

describe('the first Blocking_Finding (Req 24.4)', () => {
  it('is the keyboard trap at step 20 of the real Listener run, not the unnamed button at step 12', () => {
    const real = realListenerRun();
    expect(blockingFindings(real).map((f) => [f.type, f.step])).toEqual([['focus_trap', 20]]);
    expect(watchStep(real)).toBe(20);
  });

  it('opens a keyboard trap before the last step of a run that gave up', () => {
    const real = realListenerRun();
    const longer: Run = {
      ...real,
      steps: [...real.steps, { ...real.steps[real.steps.length - 1]!, n: 21 }],
    };
    expect(watchStep(longer)).toBe(20);
  });

  it('is what Start here, the Ghost Cam link and the tour stop open', () => {
    const { shown } = splitRuns(runs());
    expect(startHereTarget(shown)).toEqual({ runKey: REAL, step: 20 });
    expect(ghostCamTarget(shown)).toEqual({ runKey: REAL, step: 20 });
    const tour = buildTour(shown)!;
    for (const stop of tour.slice(1, 5)) expect(stop.path).toBe(`/run/${REAL}/step/20`);
  });
});

describe('plain words (Req 24.6–24.8, 10.36)', () => {
  it('answers "Where did you get stuck?" with the findings at each stuck step', () => {
    expect(answerText(answer(realListenerRun(), 'where-stuck'))).toBe(
      "At step 12 I found a button with no name.\nAt step 20 I got trapped in the 'Protect your payment' dialog.",
    );
  });

  it('names pages in sentences instead of showing their paths', () => {
    expect(answerText(answer(realListenerRun(), 'why-give-up')).split('\n')[0]).toBe(
      'I gave up at step 20 on the bill page.',
    );
    expect(pageName('Lantern Bills demo', '/')).toBe('the bill page');
    expect(pageName('Lantern Bills demo', '/bill')).toBe('the bill page');
    expect(pageName('Lantern Bills demo', '/confirmation?lang=pa')).toBe('the confirmation page');
    expect(pageName('Elsewhere', '/')).toBe('the home page');
    expect(pageName('Elsewhere', '/pay-now/')).toBe('the pay now page');
    expect(pageName('Elsewhere', '/%E0%A8%AC%E0%A8%BF%E0%A8%B2')).toBe('the ਬਿਲ page');
    expect(pageName('Elsewhere', '/---/')).toBe('this page');
  });

  it('finds where a keyboard trap held the ghost', () => {
    const real = realListenerRun();
    const trap = real.findings.find((f) => f.type === 'focus_trap')!;
    expect(trapPlace(real, trap)).toBe("the 'Protect your payment' dialog");
    // From the thought ("the 'Protect your payment' dialog") and from spoken text ("…, dialog.").
    expect(trapPlace(real, { ...trap, evidence: '', title: '' })).toBe("the 'Protect your payment' dialog");
    const spokenOnly: Run = { ...real, steps: real.steps.map((s) => ({ ...s, thought: '' })) };
    const atStep15 = { ...trap, step: 15, evidence: '', title: '' };
    expect(trapPlace(spokenOnly, atStep15)).toBe("the 'Protect your payment' dialog");
    // The sample names no dialog, but mentions one.
    const sample = listenerRun();
    expect(stuckPhrase(sample, sample.findings[1]!)).toBe('got trapped in a pop-up');
  });

  it('keeps the evidence to one readable sentence, with the full evidence in the details', () => {
    const real = realListenerRun();
    const [trap, button] = real.findings as [Run['findings'][0], Run['findings'][0]];
    expect(evidenceSentence(real, trap)).toBe('Keyboard focus stayed inside the dialog "Protect your payment".');
    // The button's evidence starts with markup and a CSS selector, so the plain table sentence is used.
    expect(evidenceSentence(real, button)).toBe('This button has no name, so a screen reader says only "button".');

    const notice = stuckNotice(real, stepOf(real, 20))!;
    expect(notice.lines).toEqual([
      'The Listener got trapped here and gave up.',
      'Keyboard trap: Keyboard focus is trapped in a dialog',
      'Keyboard focus stayed inside the dialog "Protect your payment".',
    ]);
    expect(notice.details).toEqual([{ label: 'Keyboard trap', title: trap.title, evidence: trap.evidence }]);
  });

  it('uses the table sentence for long, empty or path-laden evidence', () => {
    const real = realListenerRun();
    const button = real.findings[1]!;
    expect(evidenceSentence(real, { ...button, evidence: '' })).toBe(
      'This button has no name, so a screen reader says only "button".',
    );
    expect(evidenceSentence(real, { ...button, evidence: `${'word '.repeat(40)}end.` })).toBe(
      'This button has no name, so a screen reader says only "button".',
    );
    expect(evidenceSentence(real, { ...button, evidence: 'On page /bill the button is silent.' })).toBe(
      'This button has no name, so a screen reader says only "button".',
    );
    expect(evidenceSentence(real, { ...real.findings[0]!, evidence: '<div role=dialog>' })).toBe(
      "Keyboard focus got stuck in the 'Protect your payment' dialog, with no way out by keyboard.",
    );
  });
});

function renderWithReal(path: string) {
  return renderApp(path, memorySource(realAndSampleFiles()));
}

describe('screens with a real run (Req 24)', () => {
  it('Home: the Listener card is the real run at its trap, and the Bebe card says Sample run', async () => {
    renderWithReal('/');
    await screen.findByRole('heading', { level: 1 });
    const results = screen.getByRole('region', { name: 'What the ghosts found on Lantern Bills' });
    const [listener, bebe] = within(results).getAllByRole('article') as [HTMLElement, HTMLElement];
    const watch = within(listener).getByRole('link');
    expect(watch).toHaveAccessibleName('Watch it happen: The Listener at step 20');
    expect(watch).toHaveAttribute('href', `/run/${REAL}/step/20`);
    expect(within(listener).queryByText('Sample run')).not.toBeInTheDocument();
    expect(within(bebe).getByText('Sample run')).toBeInTheDocument();

    // The hidden Listener sample is in no list on Home.
    expect(document.querySelector(`a[href^="/run/${L}/"]`)).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /^Ghost Cam/ })).toHaveAttribute('href', `/run/${REAL}/step/20`);
  });

  it('Graveyard: the real run and the labelled Bebe sample, but not the Listener sample', async () => {
    renderWithReal('/graveyard');
    await screen.findByRole('heading', { level: 1, name: 'Graveyard' });
    const stones = screen.getAllByRole('article');
    expect(stones).toHaveLength(3);
    const samples = stones.filter((s) => within(s).queryByText('Sample run'));
    expect(samples).toHaveLength(1);
    expect(samples[0]).toHaveTextContent('Bebe');
  });

  it('Exorcise: the Listener sample is not offered as a run', async () => {
    renderWithReal('/exorcise');
    await screen.findByRole('heading', { level: 1, name: 'Exorcise' });
    const before = screen.getByLabelText('Before run');
    const values = within(before)
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(values).toEqual([REAL, B]);
    expect(within(before).getByRole('option', { name: /Bebe/ })).toHaveTextContent('Sample run');
    expect(screen.getByText(/No after run yet for The Listener/)).not.toHaveTextContent('only has sample runs');
  });

  it('Ghost Cam: a link that names the hidden sample still opens it, labelled', async () => {
    renderWithReal(`/run/${L}/step/9`);
    const summary = await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(summary.closest('[data-cam-area="summary"]')).toHaveTextContent('Sample run');
  });

  it('Séance Old_Link: a link that names the hidden sample still opens it', async () => {
    const { router } = renderWithReal(`/seance/${L}/where-stuck`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/run/${L}/step/9`));
    expect(router.state.location.search).toBe('?ask=where-stuck');
  });

  it('Ghost Cam: the real run has no Sample run label, and its Ask panel names the findings', async () => {
    renderWithReal(`/run/${REAL}/step/20?ask=where-stuck`);
    const summary = await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expect(summary.closest('[data-cam-area="summary"]')).not.toHaveTextContent('Sample run');
    const board = screen.getByRole('region', { name: 'The Listener answers: Where did you get stuck?' });
    expect(board).toHaveTextContent('At step 12 I found a button with no name.');
    expect(board).toHaveTextContent("At step 20 I got trapped in the 'Protect your payment' dialog.");
    expect(within(board).getByRole('link', { name: 'step 12' })).toHaveAttribute(
      'href',
      `/run/${REAL}/step/12?ask=where-stuck`,
    );
  });
});

describe('expanding the requirement and the notice (Req 10.29, 10.36)', () => {
  it('shows the requirement on one line and the full text on demand', async () => {
    const user = userEvent.setup();
    renderWithReal(`/run/${REAL}/step/20`);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    const row = document.querySelector<HTMLElement>('p[title^="Requirement:"]')!;
    const more = within(row).getByRole('button', { name: 'Full requirement' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(more.getAttribute('aria-controls')!)!;
    expect(panel).not.toBeVisible();
    expect(panel).toBeEmptyDOMElement();

    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', { name: 'Full requirement' });
    expect(region).toBe(panel);
    expect(region).toHaveTextContent(realListenerRun().mission.requirement);

    region.focus();
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
  });

  it('keeps the notice to one sentence of evidence and opens the full details on demand', async () => {
    const user = userEvent.setup();
    const { router } = renderWithReal(`/run/${REAL}/step/20`);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    const notice = screen.getByTestId('stuck-notice');
    expect(within(notice).getByText('Keyboard focus stayed inside the dialog "Protect your payment".')).toBeInTheDocument();
    expect(notice).not.toHaveTextContent('tabindex');

    const more = within(notice).getByRole('button', { name: 'Full details' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    const details = screen.getByRole('region', { name: 'Full details' });
    expect(details).toHaveTextContent('Keyboard trap: Keyboard focus is trapped in a dialog');
    expect(details).toHaveTextContent('2 visible, enabled controls were never reached');
    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();

    // Open again, then step back: the details close with the step.
    await user.click(more);
    await user.click(screen.getByRole('button', { name: 'Step back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/run/${REAL}/step/19`));
    expect(screen.queryByRole('region', { name: 'Full details' })).not.toBeInTheDocument();
  });
});

describe('axe with a real run (Req 18.10)', () => {
  // jsdom cannot compute colors; contrast is checked in the Playwright suite and the token contrast test.
  const run = () =>
    axe
      .run(document, { rules: { 'color-contrast': { enabled: false } } })
      .then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));

  it('has no violations on Home and on the Ghost Cam with both panels open', async () => {
    const user = userEvent.setup();
    const home = renderWithReal('/');
    await screen.findByRole('heading', { level: 1 });
    expect(await run()).toEqual([]);
    home.unmount();

    renderWithReal(`/run/${REAL}/step/20`);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    await user.click(screen.getByRole('button', { name: 'Full requirement' }));
    await user.click(screen.getByRole('button', { name: 'Full details' }));
    expect(await run()).toEqual([]);
  });
});
