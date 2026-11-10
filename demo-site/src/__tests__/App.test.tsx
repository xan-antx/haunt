import { act, fireEvent, screen } from '@testing-library/react';
import i18n from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advance,
  fillAndSubmit,
  fillPaymentForm,
  getContinueButton,
  openPaymentForm,
  renderAppAt,
  submitPaymentForm,
} from './helpers';

const VALID = {
  cardNumber: '4111111111111111',
  expiry: '12/99',
  cvv: '123',
  cardholderName: 'Asha Kaur',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('App smoke test', () => {
  it('displays the bill page with account number, amount due and Pay this bill button', () => {
    renderAppAt('/');
    expect(screen.getByTestId('account-number')).toHaveTextContent('ACC-2024-7891');
    expect(screen.getByTestId('amount-due')).toHaveTextContent('₹2,490.00');
    expect(screen.getByRole('button', { name: 'Pay this bill' })).toBeInTheDocument();
  });

  it('has header, main and footer landmarks and a document title', () => {
    renderAppAt('/');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(document.title).toMatch(/Lantern Bills/);
  });

  it('shows the payment form only after Pay this bill is clicked', () => {
    renderAppAt('/');
    expect(document.getElementById('card-number')).toBeNull();
    openPaymentForm();
    for (const id of ['card-number', 'card-expiry', 'card-cvv', 'cardholder-name']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.querySelector('form button[type="submit"]')).not.toBeNull();
  });
});

describe('End-to-end payment flow', () => {
  it('pays ₹2,589.00 with the add-on checked (default)', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    fillAndSubmit(VALID);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(getContinueButton());
    await advance(800);

    expect(window.location.pathname).toBe('/confirmation');
    expect(screen.getByRole('heading', { level: 1, name: 'Payment received' })).toBeInTheDocument();
    expect(document.querySelector('[data-haunt="payment-success"]')).not.toBeNull();
    expect(screen.getByTestId('total-charged')).toHaveTextContent('₹2,589.00');
  });

  it('pays ₹2,490.00 with the add-on unchecked', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    fillAndSubmit(VALID);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(getContinueButton());
    await advance(800);

    expect(screen.getByTestId('total-charged')).toHaveTextContent('₹2,490.00');
    expect(document.querySelector('[data-haunt="payment-success"]')).not.toBeNull();
  });

  it('does not complete before 800ms', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    fillAndSubmit(VALID);
    fireEvent.click(getContinueButton());

    await advance(799);
    expect(window.location.pathname).toBe('/');
    await advance(1);
    expect(window.location.pathname).toBe('/confirmation');
  });

  it('fails the magic card 4000000000000002 with a role="alert" message after 800ms', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    fillAndSubmit({ ...VALID, cardNumber: '4000000000000002' });
    fireEvent.click(getContinueButton());

    await advance(799);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advance(1);

    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed. Please try a different card.');
    expect(window.location.pathname).toBe('/');
    expect(document.querySelector('[data-haunt="payment-success"]')).toBeNull();
  });

  it('closing the modal with the mouse does not process the payment', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    fillAndSubmit(VALID);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    await advance(2000);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('shows errors and no modal when the form is invalid', () => {
    renderAppAt('/');
    openPaymentForm();
    fillPaymentForm({ cardNumber: '12', expiry: '01/20', cvv: '1', cardholderName: '' });
    submitPaymentForm();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Please enter a valid card number')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid expiry date')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid CVV')).toBeInTheDocument();
  });

  it('keeps the confirmation marker in every supported language', async () => {
    for (const lang of ['en', 'pa', 'hi']) {
      vi.useFakeTimers();
      renderAppAt('/');
      await act(async () => {
        await i18n.changeLanguage(lang);
      });
      fillAndSubmit(VALID);
      fireEvent.click(getContinueButton());
      await advance(800);
      expect(document.querySelector('[data-haunt="payment-success"]')).not.toBeNull();
      vi.useRealTimers();
      document.body.innerHTML = '';
    }
  });
});

describe('Autopay navigation', () => {
  it('shows the Autopay link only after the banner loads, then navigates there and back', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    expect(screen.queryByRole('link', { name: 'Set up autopay' })).not.toBeInTheDocument();

    await advance(1500);
    fireEvent.click(screen.getByRole('link', { name: 'Set up autopay' }));

    // Router navigation is synchronous inside act, so no waiting is needed.
    expect(window.location.pathname).toBe('/autopay');
    expect(screen.getByRole('heading', { level: 1, name: 'Set up autopay' })).toBeInTheDocument();
    expect(screen.getByText('Autopay coming soon')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Back to bill' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByTestId('account-number')).toHaveTextContent('ACC-2024-7891');
  });
});
