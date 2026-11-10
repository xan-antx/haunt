import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import type { SupportedLanguage } from '../types';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'pa', 'hi'];

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Reduce a language tag such as "pa-IN" to its base language ("pa").
 * Falls back to English when the base language is not supported.
 */
export function toSupportedLanguage(tag: string | null | undefined): SupportedLanguage {
  const base = (tag ?? '').split('-')[0]?.toLowerCase();
  return isSupportedLanguage(base) ? base : 'en';
}

/** A query string with `lang` set to `lang` and every other parameter kept, e.g. "?lang=pa". */
export function withLanguage(search: string, lang: SupportedLanguage): string {
  const params = new URLSearchParams(search);
  params.set('lang', lang);
  return `?${params.toString()}`;
}

/**
 * The language part of the current address ("?lang=pa"), ready to carry onto an internal link,
 * so the chosen language stays in the address from page to page. Empty when there is no valid ?lang=.
 */
export function useLanguageSearch(): string {
  const { search } = useLocation();
  const param = new URLSearchParams(search).get('lang');
  return isSupportedLanguage(param) ? `?lang=${param}` : '';
}

/**
 * Manages language selection from the ?lang= query parameter and keeps
 * <html lang> in sync with the displayed language. It follows the address, so a
 * link that changes ?lang= (the language switcher) changes the language too.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { search } = useLocation();
  const displayed = toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    // A valid ?lang= value overrides browser detection; invalid values are ignored.
    const param = new URLSearchParams(search).get('lang');
    if (isSupportedLanguage(param) && toSupportedLanguage(i18n.language) !== param) {
      void i18n.changeLanguage(param);
    }
  }, [i18n, search]);

  useEffect(() => {
    document.documentElement.lang = displayed;
  }, [displayed]);

  const changeLanguage = useCallback(
    (lng: SupportedLanguage) => i18n.changeLanguage(lng),
    [i18n]
  );

  return {
    currentLanguage: displayed,
    changeLanguage,
  };
}
