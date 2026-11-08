// Ghost Cam structure: one Stuck_Notice slot, a two-row Run_Summary, a collapsed Provenance_Panel,
// and one Control_Row (Req 10.15, 10.25, 10.29 to 10.33).

import axe from 'axe-core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RESULT_LABELS, resultSentence } from '../model/ghosts';
import * as derived from './fixtures/derived';
import { bebeRun, listenerRun } from './fixtures/samples';
import { memorySource, renderApp, sampleFiles } from './helpers';

const L = listenerRun();
const B = bebeRun();

const SAMPLES = [
  { label: 'The Listener', run: L, panel: 'What The Listener heard', step: 9 },
  { label: 'Bebe', run: B, panel: 'What Bebe was thinking', step: 6 },
] as const;

async function openCam(key: string, step: number) {
  const view = renderApp(`/run/${key}/step/${step}`);
  await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
  return view;
}

function follows(prev: Element, el: Element): boolean {
  return (prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: /Where this run came from/ });
}

function controlRow(): HTMLElement {
  const row = document.querySelector<HTMLElement>('[data-cam-area="controls"]');
  if (!row) throw new Error('no Control_Row');
  return row;
}

describe('Ghost Cam DOM order', () => {
  it.each(SAMPLES)('orders summary, screenshot, panel, notice slot, controls, timeline, provenance for $label', async ({ run, panel, step }) => {
    await openCam(run.key, step);
    const parts: Array<[string, Element]> = [
      ['Run_Summary', screen.getByRole('heading', { level: 1, name: /Ghost Cam/ })],
      ['screenshot', screen.getByRole('img', { name: /^(Screenshot of .* at step \d+|No screenshot for step \d+)$/ })],
      ['panel', screen.getByRole('heading', { name: panel })],
      ['Stuck_Notice slot', screen.getByTestId('stuck-notice-slot')],
      ['Control_Row', controlRow()],
      ['Timeline', screen.getByRole('region', { name: 'Timeline' })],
      ['Provenance_Panel', screen.getByRole('region', { name: 'Where this run came from' })],
    ];
    for (let i = 1; i < parts.length; i++) {
      expect(follows(parts[i - 1]![1], parts[i]![1]), `${parts[i]![0]} after ${parts[i - 1]![0]}`).toBe(true);
    }
  });
});

describe('Stuck_Notice', () => {
  it('shows one notice with both phrases at Listener step 9', async () => {
    await openCam(L.key, 9);
    const notices = screen.getAllByTestId('stuck-notice');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toHaveTextContent('got trapped here');
    expect(notices[0]).toHaveTextContent('and gave up.');
    expect(screen.getAllByTestId('stuck-notice-slot')).toHaveLength(1);
  });

  it.each(
    L.steps.map((s) => s.n),
  )('has one slot and at most one notice at Listener step %i', async (n) => {
    await openCam(L.key, n);
    expect(screen.getAllByTestId('stuck-notice-slot')).toHaveLength(1);
    expect(screen.queryAllByTestId('stuck-notice').length).toBeLessThanOrEqual(1);
  });

  it('keeps an empty slot at a step with no notice', async () => {
    await openCam(L.key, 1);
    const slot = screen.getByTestId('stuck-notice-slot');
    expect(slot).toBeInTheDocument();
    expect(slot).toBeEmptyDOMElement();
    expect(screen.queryByTestId('stuck-notice')).toBeNull();
  });

  it('keeps at most one notice at every Bebe step', async () => {
    for (const s of B.steps) {
      const { unmount } = await openCam(B.key, s.n);
      expect(screen.getAllByTestId('stuck-notice-slot')).toHaveLength(1);
      expect(screen.queryAllByTestId('stuck-notice').length).toBeLessThanOrEqual(1);
      unmount();
    }
  });
});

describe('Run_Summary', () => {
  it.each(SAMPLES)('gives each row a title equal to its full text for $label', async ({ run, step }) => {
    await openCam(run.key, step);
    const row1 = screen.getByRole('heading', { level: 1 });
    expect(row1).toHaveAttribute('title', `${run.ghost === 'listener' ? 'The Listener' : 'Bebe'}: ${run.mission.goal}`);
    expect(row1).toHaveTextContent(run.mission.goal);

    const row2 = document.querySelector<HTMLElement>('p[title^="Requirement:"]')!;
    expect(row2).not.toBeNull();
    expect(row2.getAttribute('title')).toBe(
      `Requirement: ${run.mission.requirement} ${RESULT_LABELS[run.result]} ${resultSentence(run.ghost, run.result)}.`,
    );
    expect(row2).toHaveTextContent(`Requirement: ${run.mission.requirement}`);
    expect(row2).toHaveTextContent(RESULT_LABELS[run.result]);
  });
});

describe('Provenance_Panel disclosure', () => {
  it('starts collapsed with a hidden body and a non-focusable command box', async () => {
    await openCam(L.key, 1);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    const body = document.getElementById(toggle().getAttribute('aria-controls')!)!;
    expect(body).toHaveAttribute('hidden');
    // Hidden content is out of the accessibility tree, so it cannot be tabbed to.
    expect(screen.queryByRole('region', { name: 'Reproduce command' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull();
    const box = within(body).getByRole('region', { name: 'Reproduce command', hidden: true });
    expect(box.closest('[hidden]')).not.toBeNull();
  });

  it('expands when the toggle is activated', async () => {
    await openCam(L.key, 1);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Reproduce command' })).toBeVisible();
  });

  it('collapses again when another run is opened', async () => {
    const { router } = await openCam(L.key, 1);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      await router.navigate(`/run/${B.key}/step/1`);
    });
    await screen.findByRole('heading', { name: /What Bebe was thinking/ });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Exorcise panels open', async () => {
    const after = { key: 'after', folder: 'x/after', origin: 'runs' as const };
    renderApp(
      `/exorcise/${L.key}/${after.key}`,
      memorySource([...sampleFiles(), { json: derived.listenerAfterFix(), meta: after }]),
    );
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /where this run came from/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Reproduce command, Before' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Reproduce command, After' })).toBeVisible();
  });
});

describe('Control_Row', () => {
  it('holds the playback controls and the Read aloud toggle for The Listener', async () => {
    await openCam(L.key, 9);
    const row = controlRow();
    const group = within(row).getByRole('group', { name: 'Playback' });
    expect(within(group).getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Read aloud \(approximation\)/ })).toBeInTheDocument();
    expect(within(row).getByText(/Step 9 of/)).toBeInTheDocument();
  });

  it('holds the playback controls but no Read aloud toggle for Bebe', async () => {
    await openCam(B.key, 6);
    const row = controlRow();
    expect(within(row).getByRole('group', { name: 'Playback' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Read aloud/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Read aloud/ })).toBeNull();
  });
});

describe('axe on the new structure', () => {
  it.each(SAMPLES)('has no violations for $label, collapsed and open', async ({ run, step }) => {
    await openCam(run.key, step);
    const check = async () => {
      // jsdom cannot compute colors; contrast is covered by the token contrast test.
      const results = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
      return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    expect(await check()).toEqual([]);
    fireEvent.click(toggle());
    expect(await check()).toEqual([]);
  });
});
