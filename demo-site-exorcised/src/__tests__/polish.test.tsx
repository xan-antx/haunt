import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../public/locales/en/translation.json';
import hi from '../../public/locales/hi/translation.json';
import pa from '../../public/locales/pa/translation.json';
import { advance, fillAndSubmit, getContinueButton, renderAppAt } from './helpers';

const VALID = {
  cardNumber: '4111111111111111',
  expiry: '12/99',
  cvv: '123',
  cardholderName: 'Asha Kaur',
};

const OPTIONS = [
  { lang: 'en', label: 'English' },
  { lang: 'pa', label: 'ਪੰਜਾਬੀ' },
  { lang: 'hi', label: 'हिन्दी' },
] as const;

afterEach(() => {
  vi.useRealTimers();
});

function languageNav() {
  return screen.getByRole('navigation', { name: en.header.languageNav });
}

describe('Bill page labels and wording', () => {
  it('uses sentence case for the bill labels', () => {
    renderAppAt('/');
    for (const label of ['Amount due', 'Due date', 'Account number', 'Billing period', 'Units used']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your electricity bill' })).toBeInTheDocument();
  });

  it('shows the plain offer text and its terms once the banner loads', async () => {
    vi.useFakeTimers();
    renderAppAt('/');
    await advance(1500);
    expect(screen.getByText('5% cashback when you pay by autopay')).toBeInTheDocument();
    expect(screen.getByText('Up to ₹150 a month, until 31 December 2026.')).toBeInTheDocument();
  });
});

describe('Autopay status and help card', () => {
  it('shows the autopay status, the due date and how to get help', () => {
    renderAppAt('/');
    const card = screen.getByRole('region', { name: 'Autopay status and help' });
    expect(within(card).getByText('Autopay is off')).toBeInTheDocument();
    expect(
      within(card).getByText('You pay each bill yourself. Pay this one by 15 November 2026.')
    ).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'care@lanternbills.example' })).toHaveAttribute(
      'href',
      'mailto:care@lanternbills.example'
    );
    expect(within(card).getByText('Monday to Saturday, 9 am to 6 pm')).toBeInTheDocument();
  });

  it('adds no autopay link and no image before the banner loads', () => {
    vi.useFakeTimers();
    renderAppAt('/');
    expect(screen.queryByRole('link', { name: /autopay/i })).not.toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
});

describe('Language switcher', () => {
  it('is a named navigation landmark in the header with one link per language', () => {
    renderAppAt('/');
    const nav = languageNav();
    expect(within(screen.getByRole('banner')).getByRole('navigation')).toBe(nav);
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(OPTIONS.map(option => option.label));
    for (const option of OPTIONS) {
      const link = within(nav).getByRole('link', { name: option.label });
      expect(link).toHaveAttribute('lang', option.lang);
      expect(link).toHaveAttribute('hreflang', option.lang);
      expect(link.getAttribute('href')).toBe(`/?lang=${option.lang}`);
    }
    expect(within(nav).getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: 'ਪੰਜਾਬੀ' })).not.toHaveAttribute('aria-current');
  });

  it('changes the language like ?lang= does and keeps the choice in the address', async () => {
    renderAppAt('/');
    fireEvent.click(within(languageNav()).getByRole('link', { name: 'ਪੰਜਾਬੀ' }));

    expect(window.location.search).toBe('?lang=pa');
    expect(await screen.findByRole('heading', { level: 1, name: pa.billDetails.heading })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('pa'));
    // The deliberate gap stays: the Pay button text has no Punjabi translation.
    expect(screen.getByRole('button', { name: en.payBillButton })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: pa.header.languageNav });
    expect(within(nav).getByRole('link', { name: 'ਪੰਜਾਬੀ' })).toHaveAttribute('aria-current', 'true');
    // Every option keeps its own-language label on a Punjabi page.
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(
      OPTIONS.map(option => option.label)
    );
  });

  it('works from the keyboard: Tab to an option and press Enter', async () => {
    const user = userEvent.setup();
    renderAppAt('/');
    const hindi = within(languageNav()).getByRole('link', { name: 'हिन्दी' });

    for (let presses = 0; presses < 20 && document.activeElement !== hindi; presses += 1) {
      await user.tab();
    }
    expect(hindi).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(window.location.search).toBe('?lang=hi');
    expect(await screen.findByRole('heading', { level: 1, name: hi.billDetails.heading })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('hi'));
  });

  it('carries ?lang= to the Autopay page and back', async () => {
    vi.useFakeTimers();
    renderAppAt('/?lang=pa');
    await advance(1500);

    fireEvent.click(screen.getByRole('link', { name: pa.autopayLink }));
    expect(window.location.pathname).toBe('/autopay');
    expect(window.location.search).toBe('?lang=pa');

    fireEvent.click(screen.getByRole('link', { name: pa.autopay.backToBill }));
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?lang=pa');
  });

  it('carries ?lang= to the confirmation, and switching there keeps the amount paid', async () => {
    vi.useFakeTimers();
    renderAppAt('/?lang=hi');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fillAndSubmit(VALID);
    fireEvent.click(getContinueButton());
    await advance(800);

    expect(window.location.pathname).toBe('/confirmation');
    expect(window.location.search).toBe('?lang=hi');
    expect(screen.getByTestId('total-charged')).toHaveTextContent('₹2,589.00');

    fireEvent.click(screen.getByRole('link', { name: 'English' }));
    await advance(0);
    expect(window.location.search).toBe('?lang=en');
    expect(screen.getByRole('heading', { level: 1, name: en.confirmation.heading })).toBeInTheDocument();
    expect(screen.getByTestId('total-charged')).toHaveTextContent('₹2,589.00');
    expect(document.querySelector('[data-haunt="payment-success"]')).not.toBeNull();
  });
});
