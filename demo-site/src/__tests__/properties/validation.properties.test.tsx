import { cleanup, fireEvent, screen } from '@testing-library/react';
import fc from 'fast-check';
import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
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
   * The error is in the DOM synchronously after blur, which is well within 100ms.
   */
  it('Feature: lantern-bills, Property 11: Field Validation Error Display', async () => {
    const cases = fc
      .constantFrom<CardField>('cardNumber', 'expiry', 'cvv')
      .chain(field => INVALID[field].map(value => ({ field, value })));

    await fc.assert(
      fc.asyncProperty(cases, async ({ field, value }) => {
        try {
          renderAppAt('/');
          openPaymentForm();

          const start = performance.now();
          typeAndBlur(field, value);
          const message = screen.getByText(errorText(field));
          const elapsed = performance.now() - start;

          expect(message).toBeVisible();
          expect(elapsed).toBeLessThan(100);
        } finally {
          cleanup();
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
