import { describe, expect, it } from 'vitest';
import { elementLooksLikeError, ERROR_CLASS_ID_SOURCE, looksLikeErrorText, normalizeText } from '../src/detectors/errorWords.ts';

/**
 * Unit tests for the error wording list.
 * **Validates: Requirements 10.5**
 */

describe('looksLikeErrorText: English', () => {
  it.each([
    'Invalid card number',
    'Invalid expiry date',
    'Enter a valid 3-digit CVV. It is incorrect',
    'An error occurred',
    'Card number is required',
    'Payment failed',
    'Your card was declined',
    'Something went wrong',
    'This card has expired',
    'Expiry date must be in the future',
    'That is not valid',
    'Please try again',
    'Please enter your name',
    'Name cannot be empty',
  ])('accepts %j', (text) => {
    expect(looksLikeErrorText(text)).toBe(true);
  });

  it('ignores letter case and extra whitespace', () => {
    expect(looksLikeErrorText('  INVALID   CARD\n NUMBER ')).toBe(true);
    expect(looksLikeErrorText('iNvAlId')).toBe(true);
  });
});

describe('looksLikeErrorText: Punjabi', () => {
  it.each([
    'ਗਲਤ ਕਾਰਡ ਨੰਬਰ',
    'ਗਲਤੀ ਆਈ ਹੈ',
    'ਅਵੈਧ ਕਾਰਡ ਨੰਬਰ',
    'ਕਾਰਡ ਨੰਬਰ ਲੋੜੀਂਦਾ ਹੈ',
    'ਇਹ ਖੇਤਰ ਲਾਜ਼ਮੀ ਹੈ',
    'ਭੁਗਤਾਨ ਅਸਫਲ ਹੋਇਆ',
    'ਕਿਰਪਾ ਕਰਕੇ ਕਾਰਡ ਨੰਬਰ ਭਰੋ',
    'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ',
  ])('accepts %j', (text) => {
    expect(looksLikeErrorText(text)).toBe(true);
  });

  it('treats composed and decomposed letters alike (NFC)', () => {
    // ਲਾਜ਼ਮੀ with ਜ਼ as one code point (U+0A5B) and as ਜ + nukta (U+0A1C U+0A3C).
    const composed = '\u0A32\u0A3E\u0A5B\u0A2E\u0A40';
    const decomposed = '\u0A32\u0A3E\u0A1C\u0A3C\u0A2E\u0A40';
    expect(composed).not.toBe(decomposed);
    expect(looksLikeErrorText(`ਇਹ ਖੇਤਰ ${composed} ਹੈ`)).toBe(true);
    expect(looksLikeErrorText(`ਇਹ ਖੇਤਰ ${decomposed} ਹੈ`)).toBe(true);
  });
});

describe('looksLikeErrorText: Hindi', () => {
  it.each([
    'गलत कार्ड नंबर',
    'अमान्य कार्ड नंबर',
    'अवैध तारीख',
    'त्रुटि हुई',
    'कार्ड नंबर आवश्यक है',
    'यह फ़ील्ड अनिवार्य है',
    'भुगतान विफल रहा',
    'कृपया कार्ड नंबर दर्ज करें',
    'दोबारा प्रयास करें',
  ])('accepts %j', (text) => {
    expect(looksLikeErrorText(text)).toBe(true);
  });
});

describe('looksLikeErrorText: text that is not an error', () => {
  it.each([
    'Pay this bill',
    'Card number',
    'Expiry date',
    'Your Electricity Bill',
    'Total Amount: ₹2,589.00',
    'Set up autopay',
    'Lantern Bills',
    'Get a refund if your payment fails due to a technical issue.',
    'ਤੁਹਾਡਾ ਬਿਜਲੀ ਬਿੱਲ',
    'ਕੁੱਲ ਰਕਮ',
    'आपका बिजली बिल',
    'कुल राशि',
    '',
    '   ',
  ])('rejects %j', (text) => {
    expect(looksLikeErrorText(text)).toBe(false);
  });

  it('does not take "expiry" for "expired", or a phrase in the middle of a sentence for "Please ..."', () => {
    expect(looksLikeErrorText('Expiry Date (MM/YY)')).toBe(false);
    expect(looksLikeErrorText('Thank you, please enjoy your stay')).toBe(false);
    expect(looksLikeErrorText('धन्यवाद, कृपया')).toBe(false);
  });
});

describe('elementLooksLikeError', () => {
  it.each([
    ['errorText', undefined],
    ['_errorText_1x2y3', ''],
    ['form-error', null],
    ['is-invalid', ''],
    ['', 'card-error'],
    [undefined, 'InvalidField'],
    ['ERROR', ''],
    ['field has-Error', ''],
  ])('accepts class %j and id %j', (className, id) => {
    expect(elementLooksLikeError(className, id)).toBe(true);
  });

  it.each([
    ['', ''],
    [undefined, undefined],
    [null, null],
    ['note valid', 'card'],
    ['summary', 'amount'],
  ])('rejects class %j and id %j', (className, id) => {
    expect(elementLooksLikeError(className, id)).toBe(false);
  });
});

describe('helpers', () => {
  it('normalises to NFC and collapses whitespace', () => {
    expect(normalizeText('  a \n\t b  ')).toBe('a b');
    expect(normalizeText('e\u0301')).toBe('\u00e9');
  });

  it('shares the class and id rule with the page-side script', () => {
    expect(new RegExp(ERROR_CLASS_ID_SOURCE, 'i').test('errorText')).toBe(true);
  });
});
