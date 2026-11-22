import { describe, expect, it } from 'vitest';
import { calculateTotal, formatCurrency } from '../currency';

describe('formatCurrency', () => {
  it('formats the sample bill amount', () => {
    expect(formatCurrency(2490)).toBe('₹2,490.00');
  });

  it('formats the amount with the add-on', () => {
    expect(formatCurrency(2589)).toBe('₹2,589.00');
  });

  it('always shows two decimals', () => {
    expect(formatCurrency(99)).toBe('₹99.00');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('groups thousands with commas', () => {
    expect(formatCurrency(1234567.5)).toBe('₹1,234,567.50');
  });
});

describe('calculateTotal', () => {
  it('returns the bill amount without the add-on', () => {
    expect(calculateTotal(2490, false)).toBe(2490);
  });

  it('adds ₹99 when the add-on is included', () => {
    expect(calculateTotal(2490, true)).toBe(2589);
  });
});
