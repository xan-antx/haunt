import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { vi } from 'vitest';
import { App } from '../App';
import type { PaymentFormData } from '../types';

/** Render the whole app at a path (BrowserRouter reads window.location). */
export function renderAppAt(path = '/') {
  window.history.pushState({}, '', path);
  return render(<App />);
}

/** Click the Pay this bill button to reveal the payment form. */
export function openPaymentForm() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('payBillButton') }));
}

function setValue(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) throw new Error(`Input #${id} not found`);
  fireEvent.change(input, { target: { value } });
}

export function fillPaymentForm(data: PaymentFormData) {
  setValue('card-number', data.cardNumber);
  setValue('card-expiry', data.expiry);
  setValue('card-cvv', data.cvv);
  setValue('cardholder-name', data.cardholderName);
}

/** The icon-only submit button (it has no accessible name, so query by type). */
export function getSubmitButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
  if (!button) throw new Error('Submit button not found');
  return button;
}

export function submitPaymentForm() {
  fireEvent.click(getSubmitButton());
}

export function getContinueButton(): HTMLElement {
  return screen.getByRole('button', { name: i18n.t('modal.continue') });
}

/** Open the form, fill it and submit. */
export function fillAndSubmit(data: PaymentFormData) {
  openPaymentForm();
  fillPaymentForm(data);
  submitPaymentForm();
}

/** Advance fake timers (payment processing delay) inside act. */
export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
