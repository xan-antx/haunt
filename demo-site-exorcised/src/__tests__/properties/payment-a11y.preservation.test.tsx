import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import i18n from 'i18next';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrappingProtectionModal } from '../../components/TrappingProtectionModal';
import { UnlabeledPayButton } from '../../components/UnlabeledPayButton';
import { calculateTotal, formatCurrency } from '../../utils/currency';

/**
 * Feature: exorcised-payment-a11y-fix, Property 2: Preservation
 * Everything outside the bug condition behaves as before.
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

const RUN_TIMEOUT = 120_000;
const AMOUNT = 2490;

function Host({ onContinue }: { onContinue: (addOn: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <TrappingProtectionModal
        isOpen={open}
        onContinue={onContinue}
        onClose={() => setOpen(false)}
        amount={AMOUNT}
      />
    </>
  );
}

const openModal = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }));
const getCheckbox = () => screen.getByRole('checkbox') as HTMLInputElement;
const getClose = () => screen.getByRole('button', { name: i18n.t('accessibility.closeDialog') });
const getContinue = () => screen.getByRole('button', { name: i18n.t('modal.continue') });

afterEach(() => {
  vi.useRealTimers();
});

describe('Preservation: payment accessibility fix', () => {
  it('the dialog is role=dialog, aria-modal, named, focused on the checkbox and unchecked on every open', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }), toggles => {
        try {
          render(<Host onContinue={() => undefined} />);
          for (const tick of toggles) {
            openModal();
            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAccessibleName(i18n.t('modal.protectHeading'));
            expect(document.activeElement).toBe(getCheckbox());
            expect(getCheckbox().checked).toBe(false);
            if (tick) fireEvent.click(getCheckbox());
            fireEvent.click(getClose());
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          }
        } finally {
          cleanup();
        }
      }),
      { numRuns: 50 }
    );
  }, RUN_TIMEOUT);

  it('the total tracks the checkbox', () => {
    fc.assert(
      fc.property(fc.array(fc.constant(null), { minLength: 1, maxLength: 8 }), clicks => {
        try {
          render(<Host onContinue={() => undefined} />);
          openModal();
          let checked = false;
          for (let i = 0; i < clicks.length; i += 1) {
            fireEvent.click(getCheckbox());
            checked = !checked;
            const expected = formatCurrency(calculateTotal(AMOUNT, checked));
            expect(screen.getByRole('dialog')).toHaveTextContent(expected);
          }
        } finally {
          cleanup();
        }
      }),
      { numRuns: 50 }
    );
  }, RUN_TIMEOUT);

  it('a mouse click on Continue passes the checkbox state and shows the 800 ms indicator', async () => {
    vi.useFakeTimers();
    for (const addOn of [false, true]) {
      const onContinue = vi.fn();
      const { unmount } = render(<Host onContinue={onContinue} />);
      openModal();
      if (addOn) fireEvent.click(getCheckbox());
      const button = getContinue();
      fireEvent.click(button);
      expect(onContinue).toHaveBeenCalledWith(addOn);
      expect(button).toHaveAttribute('aria-busy', 'true');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(799);
      });
      expect(button).toHaveAttribute('aria-busy', 'true');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(button).toHaveAttribute('aria-busy', 'false');
      unmount();
    }
  });

  it('backdrop clicks never close the dialog', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), count => {
        try {
          render(<Host onContinue={() => undefined} />);
          openModal();
          const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
          for (let i = 0; i < count; i += 1) fireEvent.click(backdrop);
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        } finally {
          cleanup();
        }
      }),
      { numRuns: 30 }
    );
  }, RUN_TIMEOUT);

  it('Learn more toggles with click and Space without leaving the dialog', () => {
    render(<Host onContinue={() => undefined} />);
    openModal();
    const link = screen.getByText(i18n.t('modal.learnMore'));
    expect(link).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(link);
    expect(link).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(link, { key: ' ' });
    expect(link).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('the pay button submits, is type=submit, keeps its icon and respects disabled', () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<UnlabeledPayButton onClick={onClick} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button).toHaveAttribute('type', 'submit');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.textContent?.trim()).toBe('');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<UnlabeledPayButton onClick={onClick} disabled />);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('pa and hi show their own text for payBillButton and the card validation keys, not English', async () => {
    const keys = ['payBillButton', 'validation.cardNumber', 'validation.expiry', 'validation.cvv'];
    const english = keys.map(key => i18n.t(key, { lng: 'en' }));
    for (const lng of ['pa', 'hi']) {
      await i18n.changeLanguage(lng);
      const own = keys.map(key => i18n.t(key));
      own.forEach((text, i) => expect(text).not.toBe(english[i]));
      expect(own).toEqual(keys.map(key => i18n.t(key, { lng })));
    }
  });
});
