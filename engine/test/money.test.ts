import { describe, expect, it } from 'vitest';
import {
  amountAboveBill,
  isTotalLabel,
  nearestPrecedingLabel,
  preTickedEvidence,
  totalEvidence,
  totalLabelOf,
} from '../src/detectors/darkPattern.ts';
import { findAmounts, firstAmount, formatAmount } from '../src/detectors/money.ts';

/**
 * Unit tests for amount parsing (`money.ts`) and the pure parts of the `dark_pattern` Detector.
 * **Validates: Requirements 19.3, 19.4**
 */

describe('findAmounts', () => {
  it('reads rupee amounts with Western and Indian grouping', () => {
    expect(findAmounts('Amount due ₹2,490.00 today').map((a) => [a.currency, a.minor, a.text])).toEqual([
      ['INR', 249000, '₹2,490.00'],
    ]);
    expect(firstAmount('₹1,00,000')?.minor).toBe(10_000_000);
    expect(firstAmount('₹12,34,567.5')?.minor).toBe(123_456_750);
    expect(firstAmount('₹1,234,567')?.minor).toBe(123_456_700);
    expect(firstAmount('₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ')?.minor).toBe(9900);
  });

  it('reads Rs., INR, $, € and £, with or without a space', () => {
    const found = findAmounts('Rs. 99, Rs 5, INR 2,490, $3.50, €10 and £1,000.25');
    expect(found.map((a) => [a.currency, a.minor])).toEqual([
      ['INR', 9900],
      ['INR', 500],
      ['INR', 249000],
      ['USD', 350],
      ['EUR', 1000],
      ['GBP', 100025],
    ]);
    expect(found[0]!.text).toBe('Rs. 99');
  });

  it('finds amounts in order with their positions, and ignores numbers without a currency', () => {
    const text = 'Total Amount: ₹2,589.00 (bill 2490, add-on ₹99)';
    const found = findAmounts(text);
    expect(found.map((a) => a.text)).toEqual(['₹2,589.00', '₹99']);
    expect(text.slice(found[1]!.index)).toBe('₹99)');
  });

  it('rejects numbers that run on and words that only contain "rs"', () => {
    expect(findAmounts('₹2,490.005')).toEqual([]);
    expect(findAmounts('₹1,234,5678')).toEqual([]);
    expect(findAmounts('hrs 20')).toEqual([]);
    expect(firstAmount('₹2,490.00.')?.text).toBe('₹2,490.00');
  });
});

describe('formatAmount', () => {
  it('uses Indian grouping for rupees and Western grouping otherwise', () => {
    expect(formatAmount('INR', 9900)).toBe('₹99.00');
    expect(formatAmount('INR', 258900)).toBe('₹2,589.00');
    expect(formatAmount('INR', 1_234_567_05)).toBe('₹12,34,567.05');
    expect(formatAmount('USD', 1_234_567_00)).toBe('$1,234,567.00');
  });
});

describe('total labels', () => {
  it('recognises total in English, Punjabi and Hindi', () => {
    expect(isTotalLabel('Total Amount:')).toBe(true);
    expect(isTotalLabel('ਕੁੱਲ ਲਿਆ ਗਿਆ')).toBe(true);
    expect(isTotalLabel('कुल राशि')).toBe(true);
    expect(isTotalLabel('Energy charges')).toBe(false);
  });

  it('takes the nearest preceding label after any earlier amount', () => {
    expect(nearestPrecedingLabel('Total due ₹2,490.00 Fee:')).toBe('Fee:');
    expect(nearestPrecedingLabel('Total Amount:')).toBe('Total Amount:');
  });

  it('uses the element text, then the dt or label before it, then the text before it in the block', () => {
    expect(totalLabelOf({ text: 'Total ₹10', prevLabel: null, preceding: '' })).toBe('Total ₹10');
    expect(totalLabelOf({ text: '₹10', prevLabel: 'ਕੁੱਲ ਲਿਆ ਗਿਆ', preceding: '' })).toBe('ਕੁੱਲ ਲਿਆ ਗਿਆ');
    expect(totalLabelOf({ text: '₹10', prevLabel: null, preceding: 'Total Amount:' })).toBe('Total Amount:');
    expect(totalLabelOf({ text: '₹10', prevLabel: null, preceding: 'Total ₹5 Fee' })).toBeNull();
  });

  it('compares only amounts in the bill currency that are higher than the bill', () => {
    const bill = firstAmount('₹2,490.00')!;
    expect(amountAboveBill('₹2,589.00', bill)?.text).toBe('₹2,589.00');
    expect(amountAboveBill('₹2,490.00', bill)).toBeNull();
    expect(amountAboveBill('$5,000', bill)).toBeNull();
  });
});

describe('dark_pattern evidence', () => {
  it('states the option, its price and that Bebe did not tick it', () => {
    expect(
      preTickedEvidence({ label: '₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ', price: '₹99', path: '/', firstStep: 11, outside: false }),
    ).toBe('The paid option "₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ" (₹99) was already ticked when it appeared on / at Step 11. Bebe did not tick it.');
  });

  it('states the total, the bill, where the bill came from and the difference', () => {
    const evidence = totalEvidence({
      shown: firstAmount('₹2,589.00')!,
      label: 'Total Amount:',
      path: '/',
      bill: firstAmount('₹2,490.00')!,
      billPath: '/',
      outside: true,
    });
    expect(evidence).toBe(
      'The total says ₹2,589.00 ("Total Amount:" ₹2,589.00, on /) but the bill was ₹2,490.00 (₹99.00 more). ' +
        'The bill amount is the first amount on the first page (/), read at Step 1. It was outside the visible part of the screen.',
    );
  });
});
