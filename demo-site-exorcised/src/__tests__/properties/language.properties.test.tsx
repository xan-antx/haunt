import { cleanup, fireEvent, screen } from '@testing-library/react';
import fc from 'fast-check';
import i18n, { createInstance } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../public/locales/en/translation.json';
import hi from '../../../public/locales/hi/translation.json';
import pa from '../../../public/locales/pa/translation.json';
import { initI18n } from '../../i18n/initI18n';
import { browserLanguageArbitrary } from '../generators';
import { fillPaymentForm, openPaymentForm, renderAppAt, submitPaymentForm } from '../helpers';

const RUN_TIMEOUT = 120_000;
const SUPPORTED = ['en', 'pa', 'hi'] as const;
const FILES = { en, pa, hi } as const;

type Lang = (typeof SUPPORTED)[number];

function expectedFor(tag: string): Lang {
  const base = tag.split('-')[0]?.toLowerCase() ?? '';
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Lang) : 'en';
}

function setNavigatorLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(window.navigator, 'language', {
    value: languages[0],
    configurable: true,
  });
}

/** Serve the real locale files in place of the HTTP backend's network request. */
function stubLocaleFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /\/locales\/([a-z]+)\/translation\.json/.exec(url);
      const file = match ? FILES[match[1] as Lang] : undefined;
      if (!file) return new Response('Not found', { status: 404 });
      return new Response(JSON.stringify(file), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

/**
 * Initialise a fresh i18next instance with the app's real settings (src/i18n/initI18n.ts),
 * for a given URL query string and browser languages.
 */
async function loadRealI18n(search: string, languages: string[]) {
  stubLocaleFetch();
  setNavigatorLanguages(languages);
  window.history.replaceState({}, '', `/${search}`);
  const instance = createInstance();
  await initI18n(instance, { bindReact: false });
  return instance;
}

afterEach(() => {
  // Remove the own-property overrides so jsdom's defaults apply again.
  Reflect.deleteProperty(window.navigator, 'languages');
  Reflect.deleteProperty(window.navigator, 'language');
  vi.unstubAllGlobals();
});

describe('Language properties', () => {
  /**
   * Feature: lantern-bills, Property 7: Language Detection and Fallback
   * Validates: Requirements 3.2, 3.3, 3.4
   */
  it('Feature: lantern-bills, Property 7: Language Detection and Fallback', async () => {
    await fc.assert(
      fc.asyncProperty(browserLanguageArbitrary(), async tag => {
        const instance = await loadRealI18n('', [tag]);
        const expected = expectedFor(tag);
        expect(instance.resolvedLanguage).toBe(expected);
        expect(instance.t('billDetails.heading')).toBe(FILES[expected].billDetails.heading);
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 8: URL Language Override
   * Validates: Requirements 3.6, 3.7
   */
  it('Feature: lantern-bills, Property 8: URL Language Override (valid values)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SUPPORTED),
        browserLanguageArbitrary(),
        async (param, browserTag) => {
          const instance = await loadRealI18n(`?lang=${param}`, [browserTag]);
          expect(instance.resolvedLanguage).toBe(param);
          expect(instance.t('billDetails.heading')).toBe(FILES[param].billDetails.heading);
        }
      ),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  it('Feature: lantern-bills, Property 8: URL Language Override (invalid values ignored)', async () => {
    // "Invalid" means the primary language subtag is not en, pa or hi.
    const invalidParam = fc
      .string({ minLength: 1, maxLength: 12 })
      .filter(s => !/^(en|pa|hi)/i.test(s.trim()) && s.trim().toLowerCase() !== 'cimode');

    await fc.assert(
      fc.asyncProperty(invalidParam, browserLanguageArbitrary(), async (param, browserTag) => {
        const instance = await loadRealI18n(`?lang=${encodeURIComponent(param)}`, [browserTag]);
        expect(instance.resolvedLanguage).toBe(expectedFor(browserTag));
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 15: Missing Translation Fallback
   * Validates: Requirements 9.4, 9.5, 9.6, 9.7, 9.8
   */
  it('Feature: lantern-bills, Property 15: Missing Translation Fallback', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('pa', 'hi'), async lang => {
        const file = FILES[lang as 'pa' | 'hi'];
        try {
          renderAppAt('/');
          await i18n.changeLanguage(lang);

          // Everything that has a translation is shown in the selected language...
          expect(
            await screen.findByRole('heading', { level: 1, name: file.billDetails.heading })
          ).toBeInTheDocument();

          // ...but the Pay button text is missing from pa/hi, so it falls back to English.
          expect(screen.getByRole('button', { name: en.payBillButton })).toBeInTheDocument();
          expect(screen.queryByText(file.billDetails.accountNumber)).toBeInTheDocument();

          // Card validation errors also fall back to English.
          openPaymentForm();
          fillPaymentForm({ cardNumber: '1', expiry: '01/20', cvv: '1', cardholderName: 'A' });
          submitPaymentForm();
          expect(screen.getByText(en.validation.cardNumber)).toBeInTheDocument();
          expect(screen.getByText(en.validation.expiry)).toBeInTheDocument();
          expect(screen.getByText(en.validation.cvv)).toBeInTheDocument();

          // The modal content is in the selected language.
          fillPaymentForm({
            cardNumber: '4111111111111111',
            expiry: '12/99',
            cvv: '123',
            cardholderName: 'A',
          });
          submitPaymentForm();
          const dialog = screen.getByRole('dialog');
          expect(dialog).toHaveAccessibleName(file.modal.protectHeading);
          expect(screen.getByText(file.modal.addOnText)).toBeInTheDocument();
          expect(screen.getByText(file.modal.learnMore)).toBeInTheDocument();
          expect(screen.getByRole('button', { name: file.modal.continue })).toBeInTheDocument();
          fireEvent.keyDown(document, { key: 'Escape' });
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);
});
