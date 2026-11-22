import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import i18n from 'i18next';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TrappingProtectionModal } from '../../components/TrappingProtectionModal';

const RUN_TIMEOUT = 120_000;

/** Hosts the modal with an "Open" opener, as BillPage does. */
function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <TrappingProtectionModal
        isOpen={open}
        onContinue={() => undefined}
        onClose={() => setOpen(false)}
        amount={2490}
      />
    </>
  );
}

function openModal() {
  const opener = screen.getByRole('button', { name: 'Open' });
  // Focus the opener first, as a real click or key press would.
  opener.focus();
  fireEvent.click(opener);
}

function getCheckbox() {
  return screen.getByRole('checkbox') as HTMLInputElement;
}

function getLearnMore() {
  return screen.getByText(i18n.t('modal.learnMore'));
}


describe('Modal properties', () => {
  /**
   * Feature: lantern-bills, Property 9: Checkbox Default State
   * Validates: Requirements 5.4, 5.5
   */
  it('Feature: lantern-bills, Property 9: Checkbox Default State', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }), toggles => {
        try {
          render(<Host />);
          for (const tick of toggles) {
            openModal();
            // Unchecked by default on every open, whatever happened before.
            expect(getCheckbox().checked).toBe(false);
            if (tick) fireEvent.click(getCheckbox());
            // Dismiss with the close control, then reopen.
            fireEvent.click(screen.getByRole('button', { name: i18n.t('accessibility.closeDialog') }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          }
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 10: Keyboard Order and Wrap
   * Tab and Shift+Tab move through checkbox, Learn more, Continue and Close, wrapping at the ends.
   * Validates: Requirements 5.6, exorcised-payment-a11y-fix 2.2
   */
  it('Feature: lantern-bills, Property 10: Keyboard Order and Wrap', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), async presses => {
        try {
          const user = userEvent.setup();
          render(<Host />);
          openModal();
          const continueButton = screen.getByRole('button', { name: i18n.t('modal.continue') });
          const closeButton = screen.getByRole('button', {
            name: i18n.t('accessibility.closeDialog'),
          });
          const stops = [getCheckbox(), getLearnMore(), continueButton, closeButton];

          expect(document.activeElement).toBe(stops[0]);
          let index = 0;
          for (const shift of presses) {
            await user.tab({ shift });
            index = (index + (shift ? stops.length - 1 : 1)) % stops.length;
            expect(document.activeElement).toBe(stops[index]);
          }
          // Continue and Close are in the tab order.
          expect(continueButton).not.toHaveAttribute('tabindex', '-1');
          expect(closeButton).not.toHaveAttribute('tabindex', '-1');
        } finally {
          cleanup();
        }
      }),
      { numRuns: 25 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: exorcised-payment-a11y-fix, Property: Escape closes from any stop
   * Validates: Requirements 2.4, 2.5
   */
  it('Escape closes from any stop and focus returns to the opener', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { maxLength: 12 }), async presses => {
        try {
          const user = userEvent.setup();
          render(<Host />);
          openModal();
          for (const shift of presses) await user.tab({ shift });
          await user.keyboard('{Escape}');
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
          expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
        } finally {
          cleanup();
        }
      }),
      { numRuns: 25 }
    );
  }, RUN_TIMEOUT);
});
