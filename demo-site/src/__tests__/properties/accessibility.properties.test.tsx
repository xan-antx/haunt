import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import i18n from 'i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fillPaymentForm, openPaymentForm, renderAppAt } from '../helpers';

const RUN_TIMEOUT = 180_000;
const LANGS = ['en', 'pa', 'hi'] as const;
const ROUTES = ['/', '/autopay', '/confirmation'] as const;

beforeAll(() => {
  // Testing Library awaits a setTimeout(0) unless it sees Jest's fake timers; this shim lets
  // it advance Vitest's fake clock instead, so user-event does not hang under fake timers.
  vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- Property 16: keyboard interaction equivalence --------------------------------------

type Activation = 'click' | 'enter' | 'space';

interface Scenario {
  name: string;
  /** Keys that natively activate this kind of element. */
  keys: ReadonlyArray<'enter' | 'space'>;
  /** Render, prepare state and return the element to activate. */
  setup: () => Promise<HTMLElement>;
  /** A serialisable snapshot of the observable outcome. */
  observe: () => string;
}

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

const scenarios: Scenario[] = [
  {
    name: 'Pay this bill button',
    keys: ['enter', 'space'],
    setup: async () => {
      renderAppAt('/');
      return screen.getByRole('button', { name: i18n.t('payBillButton') });
    },
    observe: () => `form=${!!document.getElementById('card-number')}`,
  },
  {
    name: 'Submit (icon) button',
    keys: ['enter', 'space'],
    setup: async () => {
      renderAppAt('/');
      openPaymentForm();
      fillPaymentForm({
        cardNumber: '4111111111111111',
        expiry: '12/99',
        cvv: '123',
        cardholderName: 'Asha',
      });
      return document.querySelector('form button[type="submit"]') as HTMLElement;
    },
    observe: () => `dialog=${!!screen.queryByRole('dialog')}`,
  },
  {
    name: 'Autopay link',
    keys: ['enter'],
    setup: async () => {
      renderAppAt('/');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      return screen.getByRole('link', { name: i18n.t('autopayLink') });
    },
    observe: () => `path=${window.location.pathname}`,
  },
  {
    name: 'Back to bill link',
    keys: ['enter'],
    setup: async () => {
      renderAppAt('/autopay');
      return screen.getByRole('link', { name: i18n.t('autopay.backToBill') });
    },
    observe: () => `path=${window.location.pathname}`,
  },
  {
    name: 'Add-on checkbox (modal)',
    keys: ['space'],
    setup: async () => {
      renderAppAt('/');
      openPaymentForm();
      fillPaymentForm({
        cardNumber: '4111111111111111',
        expiry: '12/99',
        cvv: '123',
        cardholderName: 'Asha',
      });
      (document.querySelector('form button[type="submit"]') as HTMLElement).click();
      await flush();
      return screen.getByRole('checkbox');
    },
    observe: () => `checked=${(screen.getByRole('checkbox') as HTMLInputElement).checked}`,
  },
  {
    name: 'Learn more link (modal)',
    keys: ['enter', 'space'],
    setup: async () => {
      renderAppAt('/');
      openPaymentForm();
      fillPaymentForm({
        cardNumber: '4111111111111111',
        expiry: '12/99',
        cvv: '123',
        cardholderName: 'Asha',
      });
      (document.querySelector('form button[type="submit"]') as HTMLElement).click();
      await flush();
      return screen.getByText(i18n.t('modal.learnMore'));
    },
    observe: () => `expanded=${screen.getByText(i18n.t('modal.learnMoreExpanded')).hidden === false}`,
  },
];

async function activate(target: HTMLElement, how: Activation) {
  // delay: null skips user-event's internal timers, which would otherwise stall under fake timers.
  const user = userEvent.setup({ delay: null });
  if (how === 'click') {
    await user.click(target);
    return;
  }
  act(() => target.focus());
  await user.keyboard(how === 'enter' ? '{Enter}' : ' ');
}

async function outcomeOf(scenario: Scenario, how: Activation): Promise<{ before: string; after: string }> {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  try {
    await i18n.changeLanguage('en');
    const target = await scenario.setup();
    const before = scenario.observe();
    await activate(target, how);
    await flush();
    return { before, after: scenario.observe() };
  } finally {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  }
}

describe('Accessibility properties', () => {
  /**
   * Feature: lantern-bills, Property 16: Keyboard Interaction Equivalence
   * Validates: Requirements 10.5
   * Buttons and checkboxes: Enter/Space. Links: Enter (Space never activates a native link).
   * Continue and Close in the modal are excluded by requirement.
   */
  it('Feature: lantern-bills, Property 16: Keyboard Interaction Equivalence', async () => {
    const cases = fc.constantFrom(...scenarios).chain(scenario =>
      fc.constantFrom(...scenario.keys).map(key => ({ scenario, key }))
    );

    await fc.assert(
      fc.asyncProperty(cases, async ({ scenario, key }) => {
        const byClick = await outcomeOf(scenario, 'click');
        const byKey = await outcomeOf(scenario, key);
        // The click really does something...
        expect(byClick.after).not.toBe(byClick.before);
        // ...and the keyboard produces exactly the same result.
        expect(byKey.after).toBe(byClick.after);
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 17: Single H1 Per Page
   * Validates: Requirements 10.7
   */
  it('Feature: lantern-bills, Property 17: Single H1 Per Page', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ROUTES),
        fc.constantFrom(...LANGS),
        fc.boolean(),
        async (route, lang, openForm) => {
          try {
            await i18n.changeLanguage(lang);
            renderAppAt(route);
            if (route === '/' && openForm) openPaymentForm();
            expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
            // Major sections use h2, never a second h1.
            expect(document.querySelectorAll('h1')).toHaveLength(1);
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 18: Descriptive Page Titles
   * Validates: Requirements 10.10
   */
  it('Feature: lantern-bills, Property 18: Descriptive Page Titles', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...LANGS), async lang => {
        const titles: string[] = [];
        for (const route of ROUTES) {
          try {
            await i18n.changeLanguage(lang);
            renderAppAt(route);
            await waitFor(() => expect(document.title).not.toBe(''));
            titles.push(document.title);
          } finally {
            cleanup();
          }
        }
        for (const title of titles) {
          expect(title.trim().length).toBeGreaterThan(8);
          expect(title).not.toMatch(/^(vite|react|untitled|document)/i);
        }
        // Each page identifies itself: no two pages share a title.
        expect(new Set(titles).size).toBe(ROUTES.length);
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 19: HTML Lang Attribute Synchronization
   * Validates: Requirements 10.11
   */
  it('Feature: lantern-bills, Property 19: HTML Lang Attribute Synchronization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ROUTES),
        fc.array(fc.constantFrom(...LANGS), { minLength: 1, maxLength: 4 }),
        async (route, sequence) => {
          try {
            // Each iteration starts from English, independent of earlier iterations.
            await i18n.changeLanguage('en');
            renderAppAt(route);
            await waitFor(() => expect(document.documentElement.lang).toBe('en'));
            for (const lang of sequence) {
              await act(async () => {
                await i18n.changeLanguage(lang);
              });
              await waitFor(() => expect(document.documentElement.lang).toBe(lang));
            }
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  it('applies the ?lang= parameter to the html lang attribute on load', async () => {
    for (const lang of LANGS) {
      renderAppAt(`/?lang=${lang}`);
      await waitFor(() => expect(document.documentElement.lang).toBe(lang));
      cleanup();
    }
  });
});
