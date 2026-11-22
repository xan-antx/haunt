import { cleanup, fireEvent, screen } from '@testing-library/react';
import fc from 'fast-check';
import i18n from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_BILL } from '../../types';
import { validateCardNumber, validateCVV, validateExpiry } from '../../utils/validation';
import {
  advance,
  fillAndSubmit,
  getContinueButton,
  renderAppAt,
} from '../helpers';
import {
  invalidPaymentDataArbitrary,
  successfulPaymentDataArbitrary,
  validPaymentDataArbitrary,
} from '../generators';

const RUN_TIMEOUT = 120_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('Payment flow properties', () => {
  /**
   * Feature: lantern-bills, Property 1: Valid Form Submission Triggers Modal
   * Validates: Requirements 2.4
   */
  it('Feature: lantern-bills, Property 1: Valid Form Submission Triggers Modal', async () => {
    await fc.assert(
      fc.asyncProperty(validPaymentDataArbitrary(), async data => {
        try {
          renderAppAt('/');
          fillAndSubmit(data);
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 2: Invalid Form Submission Shows Errors
   * Validates: Requirements 2.5
   */
  it('Feature: lantern-bills, Property 2: Invalid Form Submission Shows Errors', async () => {
    await fc.assert(
      fc.asyncProperty(invalidPaymentDataArbitrary(), async data => {
        try {
          renderAppAt('/');
          fillAndSubmit(data);

          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

          const cardOk = validateCardNumber(data.cardNumber).isValid;
          const expiryOk = validateExpiry(data.expiry).isValid;
          const cvvOk = validateCVV(data.cvv).isValid;
          expect(!!screen.queryByText(i18n.t('validation.cardNumber'))).toBe(!cardOk);
          expect(!!screen.queryByText(i18n.t('validation.expiry'))).toBe(!expiryOk);
          expect(!!screen.queryByText(i18n.t('validation.cvv'))).toBe(!cvvOk);
          expect(cardOk && expiryOk && cvvOk).toBe(false);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 3: Modal Focus Management
   * Validates: Requirements 2.6
   */
  it('Feature: lantern-bills, Property 3: Modal Focus Management', async () => {
    await fc.assert(
      fc.asyncProperty(validPaymentDataArbitrary(), async data => {
        try {
          renderAppAt('/');
          fillAndSubmit(data);
          const checkbox = screen.getByRole('checkbox');
          expect(document.activeElement).toBe(checkbox);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 4: Non-Failure Cards Succeed
   * Validates: Requirements 2.9, 2.12
   * Also checked in every supported language (2.12).
   */
  it('Feature: lantern-bills, Property 4: Non-Failure Cards Succeed', async () => {
    await fc.assert(
      fc.asyncProperty(
        successfulPaymentDataArbitrary(),
        fc.constantFrom('en', 'pa', 'hi'),
        async (data, lang) => {
          vi.useFakeTimers();
          try {
            renderAppAt(`/?lang=${lang}`);
            await i18n.changeLanguage(lang);
            fillAndSubmit(data);
            fireEvent.click(getContinueButton());
            await advance(800);

            const confirmation = document.querySelector('[data-haunt="payment-success"]');
            expect(confirmation).not.toBeNull();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
          } finally {
            cleanup();
            vi.useRealTimers();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 5: Total Calculation Correctness
   * Validates: Requirements 2.10, 2.11
   */
  it('Feature: lantern-bills, Property 5: Total Calculation Correctness', async () => {
    await fc.assert(
      fc.asyncProperty(successfulPaymentDataArbitrary(), fc.boolean(), async (data, addOn) => {
        vi.useFakeTimers();
        try {
          renderAppAt('/');
          fillAndSubmit(data);
          const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
          expect(checkbox.checked).toBe(true);
          if (!addOn) fireEvent.click(checkbox);
          fireEvent.click(getContinueButton());
          await advance(800);

          expect(screen.getByTestId('total-charged')).toHaveTextContent(
            addOn ? '₹2,589.00' : '₹2,490.00'
          );
        } finally {
          cleanup();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 6: Bill Data Invariance
   * Validates: Requirements 2.13
   */
  it('Feature: lantern-bills, Property 6: Bill Data Invariance', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async loads => {
        for (let i = 0; i < loads; i += 1) {
          try {
            renderAppAt('/');
            expect(screen.getByTestId('account-number')).toHaveTextContent(
              SAMPLE_BILL.accountNumber
            );
            expect(screen.getByTestId('account-number')).toHaveTextContent('ACC-2024-7891');
            expect(screen.getByTestId('amount-due')).toHaveTextContent('₹2,490.00');
          } finally {
            cleanup();
          }
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);
});
