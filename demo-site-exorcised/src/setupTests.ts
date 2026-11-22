import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach } from 'vitest';
import en from '../public/locales/en/translation.json';
import hi from '../public/locales/hi/translation.json';
import pa from '../public/locales/pa/translation.json';

// Synchronous, fixed-language i18n for tests: no HTTP backend, no browser detection.
// Missing pa/hi keys fall back to English exactly as in the running app.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pa: { translation: pa },
    hi: { translation: hi },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'pa', 'hi'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  initAsync: false,
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  document.documentElement.lang = '';
  document.title = '';
});
