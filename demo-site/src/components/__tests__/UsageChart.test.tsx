import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BILL_EXTRAS } from '../../data/billExtras';
import { UsageChart } from '../UsageChart';

// Vitest stubs CSS imports, so read the real source file (tests run from demo-site/).
const css = readFileSync(resolve(process.cwd(), 'src/components/UsageChart.module.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

function rule(selector: string): string {
  const match = new RegExp(`(^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`${selector} not found`);
  return match[2] ?? '';
}

function bars(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.bar')];
}

describe('UsageChart', () => {
  it('draws every bar from zero, exactly proportional to its units', () => {
    const { container } = render(<UsageChart usage={BILL_EXTRAS.usage} />);
    const max = Math.max(...BILL_EXTRAS.usage.map(entry => entry.units));
    const drawn = bars(container);
    expect(drawn).toHaveLength(BILL_EXTRAS.usage.length);

    BILL_EXTRAS.usage.forEach((entry, index) => {
      const height = parseFloat(drawn[index]?.style.height ?? '');
      expect(height).toBeCloseTo((entry.units / max) * 100, 6);
    });
  });

  it('makes 356 and 468 units clearly different', () => {
    const { container } = render(<UsageChart usage={BILL_EXTRAS.usage} />);
    const heightOf = (units: number) => {
      const index = BILL_EXTRAS.usage.findIndex(entry => entry.units === units);
      return parseFloat(bars(container)[index]?.style.height ?? '');
    };
    expect(heightOf(468)).toBe(100);
    expect(heightOf(356) / heightOf(468)).toBeCloseTo(356 / 468, 6);
  });

  it('uses a fixed track height with no offset, so percentages are of one shared baseline', () => {
    expect(rule('.track')).toMatch(/height:\s*10rem/);
    expect(rule('.track')).not.toMatch(/padding/);
    expect(rule('.bar')).not.toMatch(/min-height|margin|padding/);
  });

  it('keeps one plain sentence per month for screen readers', () => {
    render(<UsageChart usage={BILL_EXTRAS.usage} />);
    for (const sentence of [
      'May 2026: 402 units',
      'June 2026: 468 units',
      'July 2026: 451 units',
      'August 2026: 397 units',
      'September 2026: 372 units',
      'October 2026: 356 units, on this bill',
    ]) {
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
  });
});
