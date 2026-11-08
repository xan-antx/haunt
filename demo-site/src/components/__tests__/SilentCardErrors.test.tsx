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

describe('SilentCardErrors (Problem 3: errors visible but not announced)', () => {
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

  it('has no role="alert" or any live region', () => {
    const { container } = render(<SilentCardErrors errors={ALL_ERRORS} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[role]')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[aria-atomic]')).toBeNull();
  });

  it('has no aria-describedby, aria-invalid or ids that could be linked', () => {
    const { container } = render(<SilentCardErrors errors={ALL_ERRORS} />);
    expect(container.querySelector('[aria-describedby]')).toBeNull();
    expect(container.querySelector('[aria-invalid]')).toBeNull();
    expect(container.querySelector('[id]')).toBeNull();
  });

  describe('in the payment form', () => {
    function blurWith(id: string, value: string) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.focus();
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      return input;
    }

    it('leaves invalid card inputs without aria-invalid or aria-describedby, and announces nothing', () => {
      renderAppAt('/');
      openPaymentForm();
      const inputs = [
        blurWith('card-number', '12'),
        blurWith('card-expiry', '01/20'),
        blurWith('card-cvv', '1'),
      ];

      expect(screen.getByText(ALL_ERRORS.cardNumber)).toBeVisible();
      expect(screen.getByText(ALL_ERRORS.expiry)).toBeVisible();
      expect(screen.getByText(ALL_ERRORS.cvv)).toBeVisible();

      for (const input of inputs) {
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(input).not.toHaveAttribute('aria-describedby');
      }
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.querySelector('[aria-live]')).toBeNull();
    });
  });
});
