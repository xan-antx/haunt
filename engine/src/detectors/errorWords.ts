/*
 * The error wording list (Requirement 10.5), used by the `unannounced_error` Detector.
 *
 * Text counts as error text when it matches one of the phrases below, or when it sits in an element whose
 * class or id contains `error` or `invalid`. The phrases are in English, Punjabi and Hindi. Lantern Bills
 * shows its card errors as English fallbacks such as "Invalid card number", also on the Punjabi and Hindi
 * pages, so the English list matters most; the other two are there for sites that translate their messages.
 *
 * Matching rules:
 *   - Text and phrases are NFC-normalised first. Gurmukhi letters such as ਜ਼ and ਸ਼ and Devanagari letters
 *     such as फ़ can be typed in a composed or a decomposed form, and NFC makes both forms equal.
 *   - Matching is case-insensitive and Unicode-aware, and whitespace is collapsed.
 *   - English phrases use word boundaries. Gurmukhi and Devanagari phrases are plain substrings, because
 *     `\b` only knows ASCII letters. A phrase that starts with `^` must open the text.
 *
 * Deliberately not in the list: words that are normal on a page with no problem ("Pay this bill",
 * "Card Number", "Total Amount").
 */

/**
 * Regular expression source for the class or id test: the text `error` or `invalid`, case-insensitive
 * (so `errorText`, `form-error`, `is-invalid` and `InvalidField` all match). The page-side script of the
 * Detector builds its own `RegExp` from this source, so the rule lives in one place.
 */
export const ERROR_CLASS_ID_SOURCE = 'error|invalid';

const CLASS_ID_PATTERN = new RegExp(ERROR_CLASS_ID_SOURCE, 'i');

/** English phrases. Word boundaries keep "expired" from matching "expiry". */
const ENGLISH_PHRASES: readonly string[] = [
  String.raw`\binvalid\b`,
  String.raw`\bnot valid\b`,
  String.raw`\berrors?\b`,
  String.raw`\bincorrect(ly)?\b`,
  String.raw`\bwrong\b`,
  String.raw`\brequired\b`,
  // "failed" and "failure" only. "fails" is left out on purpose: the Protection modal's benefit text
  // ("Get a refund if your payment fails due to a technical issue") describes a feature, not an error.
  String.raw`\b(failed|failure)\b`,
  String.raw`\bdeclined\b`,
  String.raw`\bexpired\b`,
  String.raw`\btry again\b`,
  String.raw`\bmust (be|enter|provide|select|choose|agree|accept|check|fill|not)\b`,
  String.raw`\b(cannot|can't|can not) be (empty|blank)\b`,
  String.raw`\bdoes(n't| not) match\b`,
  String.raw`\btoo (short|long)\b`,
  String.raw`^please (enter|provide|check|choose|select|fill|try|correct|re-?enter|use|re-?type)\b`,
];

/** Punjabi (Gurmukhi) phrases. */
const PUNJABI_PHRASES: readonly string[] = [
  'ਗਲਤ', // wrong (also the start of ਗਲਤੀ, error)
  'ਅਵੈਧ', // invalid
  'ਲੋੜੀਂਦ', // required (ਲੋੜੀਂਦਾ, ਲੋੜੀਂਦੀ, ਲੋੜੀਂਦੇ)
  'ਲਾਜ਼ਮੀ', // mandatory
  'ਅਸਫਲ', // failed
  'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼', // try again
  '^ਕਿਰਪਾ ਕਰਕੇ', // please ...
];

/** Hindi (Devanagari) phrases. */
const HINDI_PHRASES: readonly string[] = [
  'गलत', // wrong
  'अमान्य', // invalid
  'अवैध', // invalid (illegal)
  'त्रुटि', // error
  'आवश्यक', // required
  'अनिवार्य', // mandatory
  'विफल', // failed
  'दोबारा प्रयास', // try again
  '^कृपया', // please ...
];

/** Every phrase of the wording list as a case-insensitive Unicode regular expression, NFC-normalised. */
export const ERROR_WORD_PATTERNS: readonly RegExp[] = [...ENGLISH_PHRASES, ...PUNJABI_PHRASES, ...HINDI_PHRASES].map(
  (phrase) => new RegExp(phrase.normalize('NFC'), 'iu'),
);

/** NFC-normalises, collapses whitespace and trims. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** `true` when the text matches the error wording list in English, Punjabi or Hindi. */
export function looksLikeErrorText(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized === '') return false;
  return ERROR_WORD_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** `true` when the class or the id contains `error` or `invalid`, in any letter case. */
export function elementLooksLikeError(className: string | null | undefined, id: string | null | undefined): boolean {
  return CLASS_ID_PATTERN.test(className ?? '') || CLASS_ID_PATTERN.test(id ?? '');
}
