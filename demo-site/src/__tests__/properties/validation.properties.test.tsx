import { cleanup, fireEvent, screen } from '@testing-library/react';
import fc from 'fast-check';
import i18n from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import {
  futureExpiryArbitrary,
  invalidCardNumberArbitrary,
  invalidCvvArbitrary,
  invalidExpiryArbitrary,
  validCardNumberArbitrary,
  validCvvArbitrary,
} from '../generators';
import { openPaymentForm, renderAppAt } from '../helpers';

const RUN_TIMEOUT = 120_000;

type CardField = 'cardNumber' | 'expiry' | 'cvv';

const FIELD_IDS: Record<CardField, string> = {
  cardNumber: 'card-number',
  expiry: 'card-expiry',
  cvv: 'card-cvv',
};

const INVALID: Record<CardField, fc.Arbitrary<string>> = {
  cardNumber: invalidCardNumberArbitrary(),
  expiry: invalidExpiryArbitrary(),
  cvv: invalidCvvArbitrary(),
};

const VALID: Record<CardField, fc.Arbitrary<string>> = {
  cardNumber: validCardNumberArbitrary(),
  expiry: futureExpiryArbitrary(),
  cvv: validCvvArbitrary(),
};

function getInput(field: CardField): HTMLInputElement {
  return document.getElementById(FIELD_IDS[field]) as HTMLInputElement;
}

function typeAndBlur(field: CardField, value: string) {
  const input = getInput(field);
  input.focus();
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function errorText(field: CardField): string {
  return i18n.t(`validation.${field}`);
}

describe('Validation error properties', () => {
  /**
   * Feature: lantern-bills, Property 11: Field Validation Error Display
   * Validates: Requirements 6.1, 6.2, 6.3
   *
   * The requirement is "within 100 ms of the field losing focus". Wall-clock time in jsdom depends on how
   * busy the machine is, so this test does not read a clock. It proves the stronger fact that makes any
   * delay impossible: the error is on the page in the same update as the blur, with no timer involved.
   *   - Every timer is faked and none is advanced, so no time passes after the blur.
   *   - The blur schedules no timer (no setTimeout, no debounce) that could show the error later.
   *   - The message is found immediately with a plain query, with no waiting or polling.
   * An error that needs no timer and no wait cannot take noticeable time in a real browser.
   */
  it('Feature: lantern-bills, Property 11: Field Validation Error Display', async () => {
    const cases = fc
      .constantFrom<CardField>('cardNumber', 'expiry', 'cvv')
      .chain(field => INVALID[field].map(value => ({ field, value })));

    await fc.assert(
      fc.asyncProperty(cases, async ({ field, value }) => {
        vi.useFakeTimers();
        try {
          renderAppAt('/');
          openPaymentForm();

          const input = getInput(field);
          input.focus();
          fireEvent.change(input, { target: { value } });
          // No error before the field loses focus.
          expect(screen.queryByText(errorText(field))).not.toBeInTheDocument();

          const timersBefore = vi.getTimerCount();
          fireEvent.blur(input);

          // Same update: the error is already there, with no timer advanced and none waited for.
          const message = screen.getByText(errorText(field));
          expect(message).toBeVisible();
          // Nothing was queued to show it later (a debounce or setTimeout would add a timer).
          expect(vi.getTimerCount()).toBe(timersBefore);
        } finally {
          cleanup();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 12: Multiple Simultaneous Errors
   * Validates: Requirements 6.8
   */
  it('Feature: lantern-bills, Property 12: Multiple Simultaneous Errors', async () => {
    const fields: CardField[] = ['cardNumber', 'expiry', 'cvv'];
    const scenario = fc
      .subarray(fields, { minLength: 2 })
      .chain(invalidFields =>
        fc
          .tuple(
            ...fields.map(field =>
              invalidFields.includes(field) ? INVALID[field] : VALID[field]
            )
          )
          .map(values => ({ invalidFields, values }))
      );

    await fc.assert(
      fc.asyncProperty(scenario, async ({ invalidFields, values }) => {
        try {
          renderAppAt('/');
          openPaymentForm();
          fields.forEach((field, index) => typeAndBlur(field, values[index] ?? ''));

          for (const field of fields) {
            const matches = screen.queryAllByText(errorText(field));
            if (invalidFields.includes(field)) {
              // Each invalid field shows its own distinct message, all at once.
              expect(matches).toHaveLength(1);
            } else {
              expect(matches).toHaveLength(0);
            }
          }
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);
});
