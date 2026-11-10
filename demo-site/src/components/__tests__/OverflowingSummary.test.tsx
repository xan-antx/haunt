import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BILL_EXTRAS } from '../../data/billExtras';
import { SAMPLE_BILL } from '../../types';
import { OverflowingSummary } from '../OverflowingSummary';

// Vitest stubs CSS imports, so read the real source file (tests run from demo-site/).
const css = readFileSync(
  resolve(process.cwd(), 'src/components/OverflowingSummary.module.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');

function block(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`"${header}" not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('Unbalanced braces');
}

const narrow = block(css, '@media (max-width: 640px)');
const narrowSummary = block(narrow, '.summary');
const narrowAmount = block(narrow, '.amount');
const wide = block(css, '@media (min-width: 641px)');

describe('OverflowingSummary (Problem 5: clips at narrow viewports)', () => {
  it('renders the full amount text in the DOM', () => {
    render(<OverflowingSummary amount="₹2,490.00" />);
    expect(screen.getByTestId('summary-amount')).toHaveTextContent('₹2,490.00');
  });

  it('applies a fixed 180px width, hidden overflow and no wrapping at 640px and below', () => {
    expect(narrowSummary).toMatch(/width:\s*180px/);
    expect(narrowSummary).toMatch(/overflow:\s*hidden/);
    expect(narrowSummary).toMatch(/white-space:\s*nowrap/);
    expect(narrowAmount).toMatch(/white-space:\s*nowrap/);
    expect(narrowAmount).toMatch(/overflow:\s*hidden/);
  });

  it('uses a large font so the last characters overflow the box', () => {
    const size = /font-size:\s*([\d.]+)rem/.exec(narrowAmount)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(2.25);
  });

  it('provides no way to scroll or reflow the cut-off content', () => {
    // No scroll overflow anywhere in the stylesheet, and no wrapping on the amount.
    expect(css).not.toMatch(/overflow(-[xy])?:\s*(auto|scroll)/);
    expect(narrowAmount).not.toMatch(/white-space:\s*(normal|wrap|pre-wrap)/);
    expect(narrowAmount).not.toMatch(/word-break|overflow-wrap|text-overflow/);
  });

  it('keeps the heading and label wrappable so only the total is affected', () => {
    expect(block(narrow, '.heading')).toMatch(/white-space:\s*normal/);
  });

  it('shows the charges that make up the bill, then the total', () => {
    render(<OverflowingSummary amount="₹2,490.00" />);
    expect(screen.getByText('Energy charges (356 units)')).toBeInTheDocument();
    expect(screen.getByTestId('summary-energy')).toHaveTextContent('₹2,310.00');
    expect(screen.getByText('Fixed and grid charges')).toBeInTheDocument();
    expect(screen.getByTestId('summary-fixed')).toHaveTextContent('₹180.00');
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('has charges that add up to the amount due', () => {
    const { energy, fixedAndGrid } = BILL_EXTRAS.charges;
    expect(energy + fixedAndGrid).toBe(SAMPLE_BILL.amountDue);
  });

  it('keeps the charge lines wrappable at 640px and below, so only the total is clipped', () => {
    expect(block(narrow, '.breakdown')).toMatch(/white-space:\s*normal/);
  });

  it('does not clip above the breakpoint', () => {
    const wideSummary = block(wide, '.summary');
    expect(wideSummary).toMatch(/width:\s*auto/);
    expect(wideSummary).not.toMatch(/overflow:\s*hidden/);
  });
});
