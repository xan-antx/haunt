/// <reference types="node" />
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GHOSTS, RESULT_LABELS } from '../model/ghosts';
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
  it('has exactly one h1, the Tagline', async () => {
    await renderHome();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/^Haunt your app before your users do\.$/);
  });

  it('keeps the logo out of the Hero and only in the header brand link', async () => {
    const h1 = await renderHome();
    const hero = h1.parentElement!;
    expect(hero.querySelector('[data-haunt-logo]')).toBeNull();
    const onlyHaunt = within(hero)
      .queryAllByRole('heading')
      .filter((h) => h.textContent?.trim() === 'Haunt');
    expect(onlyHaunt).toEqual([]);

    const logos = document.querySelectorAll('[data-haunt-logo]');
    expect(logos).toHaveLength(1);
    const brand = screen.getByRole('banner').querySelector('a[href$="/"]') as HTMLElement;
    expect(brand).toHaveAccessibleName('Haunt');
    expect(brand).toContainElement(logos[0] as HTMLElement);
  });

  it('renders the Hero_Ghosts in order, with visible names and decorative SVGs, after the h1', async () => {
    const h1 = await renderHome();
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-float="hero"]'));
    expect(items).toHaveLength(3);
    const list = items[0]!.parentElement as HTMLElement;
    expect(list.tagName).toBe('UL');
    expect(Array.from(list.children)).toEqual(items);
    items.forEach((li) => expect(li.tagName).toBe('LI'));

    const expected = [GHOSTS.listener, GHOSTS.phantom, GHOSTS.bebe];
    expected.forEach((ghost, i) => {
      const item = items[i]!;
      const name = within(item).getByText(ghost.name, { selector: 'p' });
      expect(name).toBeVisible();
      expect(within(item).getByText(ghost.description)).toBeInTheDocument();
      const svg = item.querySelector('svg') as SVGElement;
      expect(svg).not.toBeNull();
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(item.style.getPropertyValue('--float-delay')).toBe(['0s', '1.5s', '3s'][i]);
    });

    // DOM order: h1 comes before the ghosts, and the ghosts sit in the same Hero as the h1.
    expect(h1.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h1.closest('div')!.parentElement).toContainElement(list);
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

/** Returns the text between the braces opened at `open` (index of "{"). */
function blockAt(css: string, open: number): { body: string; end: number } {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), end: i };
  }
  throw new Error('unbalanced braces');
}

describe('Hero float CSS', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'motion.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('defines the float keyframes only inside a prefers-reduced-motion: no-preference block', () => {
    const blocks: string[] = [];
    const re = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const { body, end } = blockAt(css, m.index + m[0].length - 1);
      blocks.push(body);
      re.lastIndex = end;
    }
    const all = (css.match(/@keyframes\s+haunt-hero-float/g) ?? []).length;
    const inside = blocks.reduce((n, b) => n + (b.match(/@keyframes\s+haunt-hero-float/g) ?? []).length, 0);
    expect(all).toBe(1);
    expect(inside).toBe(1);
    // The animation that uses it is also gated.
    expect(blocks.some((b) => /\[data-float=['"]hero['"]\][^{]*\{[^}]*haunt-hero-float/.test(b))).toBe(true);
    expect(blocks.some((b) => /animation-delay:\s*var\(--float-delay,\s*0s\)/.test(b))).toBe(true);
  });

  it('keeps the vertical travel at most 12 px', () => {
    const start = css.indexOf('@keyframes haunt-hero-float');
    const { body } = blockAt(css, css.indexOf('{', start));
    const offsets = [...body.matchAll(/translateY\(\s*(-?[\d.]+)(?:px)?\s*\)/g)].map((x) => Number(x[1]));
    expect(offsets.length).toBeGreaterThan(1);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThanOrEqual(12);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThanOrEqual(12);
  });
});
