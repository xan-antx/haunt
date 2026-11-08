// Ghost Cam DOM order is the reading order at every size (Req 10.25, 10.26):
// Run_Summary, screenshot (or Placeholder), panel, controls, timeline, Provenance_Panel.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

const CASES = [
  { label: 'The Listener at step 9', path: '/run/2026-11-03-listener-pay-bill/step/9', panel: 'What The Listener heard' },
  { label: 'Bebe at step 6', path: '/run/2026-11-03-bebe-pay-bill/step/6', panel: 'What Bebe was thinking' },
] as const;

const SHOT = /^(Screenshot of .* at step \d+|No screenshot for step \d+)$/;

function expectInOrder(elements: Array<[string, Element]>) {
  for (let i = 1; i < elements.length; i++) {
    const [prevName, prev] = elements[i - 1]!;
    const [name, el] = elements[i]!;
    const follows = (prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows, `${name} should come after ${prevName}`).toBe(true);
  }
}

function orderedParts(panelHeading: string): Array<[string, Element]> {
  return [
    ['Run_Summary', screen.getByRole('heading', { level: 1, name: /Ghost Cam/ })],
    ['screenshot', screen.getByRole('img', { name: SHOT })],
    ['panel', screen.getByRole('heading', { name: panelHeading })],
    ['controls', screen.getByRole('button', { name: 'Play' })],
    ['timeline', screen.getByRole('region', { name: 'Timeline' })],
    ['Provenance_Panel', screen.getByRole('region', { name: 'Where this run came from' })],
    ['Reproduce command', screen.getByRole('region', { name: 'Reproduce command' })],
  ];
}

describe('Ghost Cam DOM order', () => {
  it.each(CASES)('follows the reading order for $label', async ({ path, panel }) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    expectInOrder(orderedParts(panel));
  });

  it.each(CASES)('keeps the order when the Placeholder replaces the screenshot for $label', async ({ path, panel }) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    const img = document.querySelector('[data-cam-area="shot"] img');
    if (img) fireEvent.error(img);
    expect(screen.getByRole('img', { name: /^No screenshot for step \d+$/ })).toBeInTheDocument();
    expectInOrder(orderedParts(panel));
  });

  it.each(CASES)('puts each part in its grid area, in area order, for $label', async ({ path, panel }) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1, name: /Ghost Cam/ });
    const areas = Array.from(document.querySelectorAll('[data-cam-area]'));
    expect(areas.map((a) => a.getAttribute('data-cam-area'))).toEqual([
      'summary',
      'shot',
      'panel',
      'controls',
      'timeline',
      'rest',
    ]);
    const parts = orderedParts(panel);
    const expectedArea = ['summary', 'shot', 'panel', 'controls', 'timeline', 'rest', 'rest'];
    parts.forEach(([, el], i) => {
      expect(el.closest('[data-cam-area]')?.getAttribute('data-cam-area')).toBe(expectedArea[i]);
    });
  });
});
