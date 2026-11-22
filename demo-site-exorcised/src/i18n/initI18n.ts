import type { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * Wire up and initialise an i18next instance with the app's settings.
 * Returns a promise that resolves once the detected language's translation file has loaded.
 * No side effects on import: the app initialises the global instance in ./config,
 * and tests call this with a fresh instance and `bindReact: false`.
 */
export function initI18n(instance: I18nInstance, options: { bindReact?: boolean } = {}) {
  const { bindReact = true } = options;

  instance
    .use(HttpBackend) // Load translations from /public/locales
    .use(LanguageDetector); // Detect ?lang= first, then browser language
  if (bindReact) {
    instance.use(initReactI18next); // Pass i18n to react-i18next
  }

  return instance.init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'pa', 'hi'],
    // Region codes (en-US, pa-IN) resolve to their base language
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['querystring', 'navigator'],
      lookupQuerystring: 'lang',
      caches: [],
    },
    backend: {
      loadPath: `${import.meta.env.BASE_URL}locales/{{lng}}/translation.json`,
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });
}
