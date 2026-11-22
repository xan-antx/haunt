import fc from 'fast-check';
import type { PaymentFormData } from '../types';

/** The one card number that always fails payment. */
export const FAILURE_CARD = '4000000000000002';

/** A string of decimal digits with a length in [minLength, maxLength]. */
export function digitStringArbitrary(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength, maxLength })
    .map(digits => digits.join(''));
}

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`;
}

/** MM/YY strings that are strictly after the current month (1 to 60 months ahead). */
export function futureExpiryArbitrary(): fc.Arbitrary<string> {
  return fc.integer({ min: 1, max: 60 }).map(monthsAhead => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthsAhead);
    return formatExpiry(date.getMonth() + 1, date.getFullYear());
  });
}

/** MM/YY strings for months that are already over (2 to 60 months back). */
export function pastExpiryArbitrary(): fc.Arbitrary<string> {
  return fc.integer({ min: 2, max: 60 }).map(monthsBack => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - monthsBack);
    return formatExpiry(date.getMonth() + 1, date.getFullYear());
  });
}

/** Expiry strings that fail validation: past dates, invalid months, or wrong format. */
export function invalidExpiryArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    pastExpiryArbitrary(),
    // Invalid month (00 or 13-99) with a valid-looking year
    fc
      .tuple(
        fc.oneof(fc.constant(0), fc.integer({ min: 13, max: 99 })),
        fc.integer({ min: 30, max: 99 })
      )
      .map(([month, year]) => `${String(month).padStart(2, '0')}/${year}`),
    // Wrong format entirely
    fc.constantFrom('', '1/30', '0130', '13/2030', 'ab/cd', '12-30', '12/3')
  );
}

export function validCardNumberArbitrary(): fc.Arbitrary<string> {
  return digitStringArbitrary(13, 19);
}

/** Card numbers with fewer than 13 digits, or containing a non-digit character. */
export function invalidCardNumberArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    digitStringArbitrary(0, 12),
    fc
      .tuple(digitStringArbitrary(13, 19), fc.constantFrom('a', 'x', 'Z', '-', '#', '.'), fc.nat())
      .map(([digits, bad, at]) => {
        const index = at % (digits.length + 1);
        return digits.slice(0, index) + bad + digits.slice(index);
      })
  );
}

export function validCvvArbitrary(): fc.Arbitrary<string> {
  return digitStringArbitrary(3, 3);
}

/** CVVs that are too short, too long, or contain a non-digit. */
export function invalidCvvArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    digitStringArbitrary(0, 2),
    digitStringArbitrary(4, 6),
    fc
      .tuple(digitStringArbitrary(2, 2), fc.constantFrom('a', 'x', '-', '#'))
      .map(([digits, bad]) => digits + bad)
  );
}

export function cardholderNameArbitrary(): fc.Arbitrary<string> {
  return fc
    .stringMatching(/^[A-Za-z][A-Za-z ]{0,24}$/)
    .filter(name => name.trim().length > 0);
}

/** Fully valid payment form data (card number may be any 13-19 digits). */
export function validPaymentDataArbitrary(): fc.Arbitrary<PaymentFormData> {
  return fc.record({
    cardNumber: validCardNumberArbitrary(),
    expiry: futureExpiryArbitrary(),
    cvv: validCvvArbitrary(),
    cardholderName: cardholderNameArbitrary(),
  });
}

/** Valid payment data whose card number is not the magic failure card. */
export function successfulPaymentDataArbitrary(): fc.Arbitrary<PaymentFormData> {
  return validPaymentDataArbitrary().filter(data => data.cardNumber !== FAILURE_CARD);
}

/** Payment data where at least one of card number, expiry or CVV is invalid. */
export function invalidPaymentDataArbitrary(): fc.Arbitrary<PaymentFormData> {
  const valid = validPaymentDataArbitrary();
  return fc.oneof(
    fc.tuple(valid, invalidCardNumberArbitrary()).map(([data, cardNumber]) => ({ ...data, cardNumber })),
    fc.tuple(valid, invalidExpiryArbitrary()).map(([data, expiry]) => ({ ...data, expiry })),
    fc.tuple(valid, invalidCvvArbitrary()).map(([data, cvv]) => ({ ...data, cvv }))
  );
}

/** Viewport widths at or below the 640px clipping breakpoint. */
export function narrowViewportArbitrary(): fc.Arbitrary<number> {
  return fc.integer({ min: 320, max: 640 });
}

/** Browser language tags: supported (with and without region) and unsupported. */
export function browserLanguageArbitrary(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constantFrom('en', 'en-US', 'en-GB'),
    fc.constantFrom('pa', 'pa-IN'),
    fc.constantFrom('hi', 'hi-IN'),
    fc.constantFrom('fr', 'de-DE', 'es', 'ja', 'zh-CN', 'pt-BR', 'ar', 'ta-IN', 'bn-IN', 'ru')
  );
}
