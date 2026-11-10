/**
 * Mission pattern matching.
 *
 * Patterns are case-insensitive Unicode regular expressions (flags `iu`).
 * They are matched against NFC-normalised text with collapsed whitespace.
 * Languages are tried in the order the caller gives, with English as the
 * fallback, and the result says which language matched.
 *
 * This module is pure: no I/O, no dependency on the mission loader.
 */

export type PatternLang = 'en' | 'pa' | 'hi';

/** Pattern sources per language. `en` is required; `pa` and `hi` are optional. */
export interface PatternSet {
  en: readonly string[];
  pa?: readonly string[];
  hi?: readonly string[];
}

export interface PatternMatch {
  /** The language whose pattern matched. */
  lang: PatternLang;
  /** The pattern source that matched. */
  pattern: string;
}

/** The language used last when the caller's order does not already include it. */
export const FALLBACK_LANG: PatternLang = 'en';

/**
 * NFC-normalise, turn every run of Unicode whitespace into one space, and trim.
 * Different Unicode spellings of the same Punjabi or Hindi text then compare equal.
 */
export function normaliseText(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

const compiled = new Map<string, RegExp>();

/**
 * Compile one pattern source with flags `iu`. The source is NFC-normalised so it
 * lines up with normalised text. Throws a SyntaxError for an invalid pattern.
 */
export function compilePattern(source: string): RegExp {
  const normalisedSource = source.normalize('NFC');
  let re = compiled.get(normalisedSource);
  if (!re) {
    re = new RegExp(normalisedSource, 'iu');
    compiled.set(normalisedSource, re);
  }
  return re;
}

/** Returns an error message when `source` is not a valid `iu` pattern, otherwise `null`. */
export function patternError(source: string): string | null {
  try {
    compilePattern(source);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The languages to try: the caller's order without duplicates, then `en` if it
 * was not listed.
 */
export function languageOrder(langs: readonly PatternLang[]): PatternLang[] {
  const order: PatternLang[] = [];
  for (const lang of [...langs, FALLBACK_LANG]) {
    if (!order.includes(lang)) order.push(lang);
  }
  return order;
}

/**
 * Tries each language in `langs` order (then `en`) and returns the first pattern
 * that matches `text`, with the language it came from. Returns `null` when
 * nothing matches. Languages the set does not define are skipped.
 */
export function matchPatterns(
  text: string,
  patterns: PatternSet,
  langs: readonly PatternLang[] = [],
): PatternMatch | null {
  const subject = normaliseText(text);
  for (const lang of languageOrder(langs)) {
    const sources = patterns[lang];
    if (!sources) continue;
    for (const source of sources) {
      if (compilePattern(source).test(subject)) return { lang, pattern: source };
    }
  }
  return null;
}

/** True when any pattern in any tried language matches `text`. */
export function matchesAnyPattern(
  text: string,
  patterns: PatternSet,
  langs: readonly PatternLang[] = [],
): boolean {
  return matchPatterns(text, patterns, langs) !== null;
}
