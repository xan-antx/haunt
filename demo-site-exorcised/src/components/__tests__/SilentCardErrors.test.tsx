import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderAppAt, openPaymentForm } from '../../__tests__/helpers';
import { SilentCardErrors } from '../SilentCardErrors';
import { fireEvent } from '@testing-library/react';

const ALL_ERRORS = {
  cardNumber: 'Please enter a valid card number',
  expiry: 'Please enter a valid expiry date',
  cvv: 'Please enter a valid CVV',
};

describe('SilentCardErrors (Problem 3 fixed: errors announced and linked)', () => {
  it('renders nothing visible when there are no errors', () => {
    const { container } = render(<SilentCardErrors errors={{}} />);
    expect(container.textContent).toBe('');
  });

  it('shows each error message in the DOM', () => {
    render(<SilentCardErrors errors={ALL_ERRORS} />);
    expect(screen.getByText(ALL_ERRORS.cardNumber)).toBeVisible();
    expect(screen.getByText(ALL_ERRORS.expiry)).toBeVisible();
    expect(screen.getByText(ALL_ERRORS.cvv)).toBeVisible();
  });

  it('shows multiple simultaneous errors as separate elements', () => {
    render(<SilentCardErrors errors={ALL_ERRORS} />);
    const nodes = [ALL_ERRORS.cardNumber, ALL_ERRORS.expiry, ALL_ERRORS.cvv].map(text =>
      screen.getByText(text)
    );
    expect(new Set(nodes).size).toBe(3);
  });

  it('announces each error: every message sits in its own role="alert" element', () => {
    render(<SilentCardErrors errors={ALL_ERRORS} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.map(alert => alert.textContent)).toEqual([
      ALL_ERRORS.cardNumber,
      ALL_ERRORS.expiry,
      ALL_ERRORS.cvv,
    ]);
  });

  it('gives each error an id that the matching input can reference', () => {
    const { container } = render(<SilentCardErrors errors={ALL_ERRORS} />);
    expect(container.querySelector('#card-number-error')).toHaveTextContent(ALL_ERRORS.cardNumber);
    expect(container.querySelector('#card-expiry-error')).toHaveTextContent(ALL_ERRORS.expiry);
    expect(container.querySelector('#card-cvv-error')).toHaveTextContent(ALL_ERRORS.cvv);
  });

  it('renders no alert when there are no errors', () => {
    render(<SilentCardErrors errors={{}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('in the payment form', () => {
    function blurWith(id: string, value: string) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.focus();
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      return input;
    }

    const FIELDS = [
      { id: 'card-number', errorId: 'card-number-error', bad: '12', good: '4111111111111111', message: ALL_ERRORS.cardNumber },
      { id: 'card-expiry', errorId: 'card-expiry-error', bad: '01/20', good: '12/99', message: ALL_ERRORS.expiry },
      { id: 'card-cvv', errorId: 'card-cvv-error', bad: '1', good: '123', message: ALL_ERRORS.cvv },
    ];

    it('announces invalid card fields and links each input to its error with aria-describedby', () => {
      renderAppAt('/');
      openPaymentForm();
      const inputs = FIELDS.map(field => blurWith(field.id, field.bad));

      FIELDS.forEach((field, i) => {
        const input = inputs[i];
        const error = screen.getByText(field.message);
        expect(error).toBeVisible();
        expect(error).toHaveAttribute('role', 'alert');
        expect(error).toHaveAttribute('id', field.errorId);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('aria-describedby', field.errorId);
        expect(input).toHaveAccessibleDescription(field.message);
      });
      expect(screen.getAllByRole('alert')).toHaveLength(3);
    });

    it('removes the alert, aria-invalid and aria-describedby once a field is valid', () => {
      renderAppAt('/');
      openPaymentForm();
      for (const field of FIELDS) {
        const input = blurWith(field.id, field.bad);
        expect(input).toHaveAttribute('aria-describedby', field.errorId);
        blurWith(field.id, field.good);
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(input).not.toHaveAttribute('aria-describedby');
        expect(screen.queryByText(field.message)).toBeNull();
      }
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('leaves valid, untouched card inputs without aria-invalid or aria-describedby', () => {
      renderAppAt('/');
      openPaymentForm();
      for (const field of FIELDS) {
        const input = document.getElementById(field.id) as HTMLInputElement;
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(input).not.toHaveAttribute('aria-describedby');
      }
    });
  });
});
