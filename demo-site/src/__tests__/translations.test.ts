import { describe, expect, it } from 'vitest';
import en from '../../public/locales/en/translation.json';
import hi from '../../public/locales/hi/translation.json';
import pa from '../../public/locales/pa/translation.json';

/** Flatten nested translation objects into dotted key paths. */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, path)
      : [path];
  });
}

/** Keys deliberately missing from pa and hi (Problem 6). */
const MISSING = [
  'payBillButton',
  'validation.cardNumber',
  'validation.expiry',
  'validation.cvv',
] as const;

const enKeys = flatten(en);

describe('Translation files (Problem 6: incomplete pa/hi)', () => {
  it('en contains every key required by the design', () => {
    const required = [
      'pageTitle',
      'payBillButton',
      'billDetails.heading',
      'billDetails.accountNumber',
      'billDetails.amountDue',
      'paymentForm.heading',
      'paymentForm.cardNumber',
      'paymentForm.expiry',
      'paymentForm.cvv',
      'paymentForm.cardholderName',
      'validation.cardNumber',
      'validation.expiry',
      'validation.cvv',
      'modal.protectHeading',
      'modal.addOnText',
      'modal.learnMore',
      'modal.continue',
      'modal.close',
      'payment.failed',
      'confirmation.heading',
      'confirmation.charged',
      'autopay.heading',
      'autopay.comingSoon',
      'autopay.backToBill',
      'banner.alt',
      'summary.total',
      'autopayLink',
    ];
    for (const key of required) {
      expect(enKeys, `en is missing ${key}`).toContain(key);
    }
  });

  it('en has a non-empty string for every key', () => {
    for (const key of enKeys) {
      const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], en);
      expect(typeof value).toBe('string');
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  for (const [name, file] of [
    ['pa', pa],
    ['hi', hi],
  ] as const) {
    describe(name, () => {
      const keys = flatten(file);

      it('lacks the Pay button text and the card validation messages', () => {
        for (const missing of MISSING) {
          expect(keys, `${name} should not define ${missing}`).not.toContain(missing);
        }
      });

      it('defines every other key that en defines', () => {
        const expected = enKeys.filter(key => !(MISSING as readonly string[]).includes(key));
        expect([...keys].sort()).toEqual([...expected].sort());
      });

      it('does not define keys that en lacks', () => {
        for (const key of keys) {
          expect(enKeys).toContain(key);
        }
      });
    });
  }
});
