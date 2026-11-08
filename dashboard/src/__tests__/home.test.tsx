import axe from 'axe-core';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RESULT_LABELS } from '../model/ghosts';
import { renderApp } from './helpers';

async function renderHome() {
  renderApp('/');
  return screen.findByRole('heading', { level: 1 });
}

function hauntCards(): HTMLElement[] {
  const sites = screen.getByRole('region', { name: 'Haunted sites' });
  return within(sites).getAllByRole('article');
}

/** The ghost rows of a haunt card: the direct children of its first list. */
function ghostRows(card: HTMLElement): HTMLElement[] {
  const list = card.querySelector('ul');
  if (!list) throw new Error('haunt card has no ghost list');
  return Array.from(list.children) as HTMLElement[];
}

describe('Home screen', () => {
  it('has exactly one h1, named "Haunt"', async () => {
    await renderHome();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName('Haunt');
  });

  it('shows the word "Haunt" once in the hero', async () => {
    const h1 = await renderHome();
    const hero = h1.parentElement!;
    // Count per text node: textContent joins adjacent elements ("HauntThree…") and hides word boundaries.
    const walker = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      count += node.textContent?.match(/\bHaunt\b/g)?.length ?? 0;
    }
    expect(count).toBe(1);
    expect(h1).toContainElement(within(h1).getByText('Haunt'));
  });

  it('uses h2 for haunt card titles and no h3 card titles', async () => {
    await renderHome();
    const cards = hauntCards();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const title = within(card).getByRole('heading', { level: 2 });
      expect(card).toHaveAccessibleName(title.textContent!);
      expect(within(card).queryAllByRole('heading', { level: 3 })).toEqual([]);
    }
  });

  it('shows the sample Outcome_Lines beside their badges', async () => {
    await renderHome();
    const rows = hauntCards().flatMap(ghostRows);
    const listener = rows.find((row) => within(row).queryByText('The Listener', { selector: 'p' }))!;
    const bebe = rows.find((row) => within(row).queryByText('Bebe', { selector: 'p' }))!;
    expect(within(listener).getByText('Trapped by a keyboard trap at step 9')).toBeInTheDocument();
    expect(within(listener).getByText('Gave up')).toBeInTheDocument();
    expect(within(bebe).getByText('Made it through in 6 steps')).toBeInTheDocument();
    expect(within(bebe).getByText('Completed')).toBeInTheDocument();
  });

  it('gives every Outcome_Line text that differs from its badge', async () => {
    await renderHome();
    const rows = hauntCards().flatMap(ghostRows);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const [badge] = Object.values(RESULT_LABELS).flatMap((label) =>
        within(row).queryAllByText(label, { selector: 'span > span' }),
      );
      if (!badge) throw new Error('ghost row has no result badge');
      const outcome = badge.parentElement!.previousElementSibling as HTMLElement;
      expect(outcome.tagName).toBe('P');
      expect(outcome.textContent?.trim()).not.toBe('');
      expect(outcome.textContent?.trim()).not.toBe(badge.textContent?.trim());
    }
  });

  it('has a "Recent ghost walks" h2 inside an aside', async () => {
    await renderHome();
    const heading = screen.getByRole('heading', { level: 2, name: 'Recent ghost walks' });
    expect(heading.closest('aside')).not.toBeNull();
    const aside = screen.getByRole('complementary', { name: 'Recent ghost walks' });
    expect(aside).toContainElement(heading);
  });

  it('has no axe violations', async () => {
    await renderHome();
    // jsdom cannot compute colors; contrast is checked in the Playwright suite and the token contrast test.
    const results = await axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
      [],
    );
  });
});
