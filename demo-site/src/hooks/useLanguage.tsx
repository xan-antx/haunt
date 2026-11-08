import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

/**
 * Manages language selection from the ?lang= query parameter and keeps
 * <html lang> in sync with the displayed language.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const displayed = toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    // A valid ?lang= value overrides browser detection; invalid values are ignored.
    const param = new URLSearchParams(window.location.search).get('lang');
    if (isSupportedLanguage(param) && toSupportedLanguage(i18n.language) !== param) {
      void i18n.changeLanguage(param);
    }
  }, [i18n]);

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
