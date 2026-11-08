import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
}

function getCheckbox() {
  return screen.getByRole('checkbox') as HTMLInputElement;
}

function getLearnMore() {
  return screen.getByText(i18n.t('modal.learnMore'));
}

function pressTab(shift: boolean) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift });
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
          for (const leaveUnchecked of toggles) {
            openModal();
            // Checked by default on every open, whatever happened before.
            expect(getCheckbox().checked).toBe(true);
            if (leaveUnchecked) fireEvent.click(getCheckbox());
            // Dismiss with the mouse-only close control, then reopen.
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
   * Feature: lantern-bills, Property 10: Keyboard Trap Cycling
   * Validates: Requirements 5.6
   */
  it('Feature: lantern-bills, Property 10: Keyboard Trap Cycling', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }), presses => {
        try {
          render(<Host />);
          openModal();
          const checkbox = getCheckbox();
          const learnMore = getLearnMore();
          const continueButton = screen.getByRole('button', { name: i18n.t('modal.continue') });
          const closeButton = screen.getByRole('button', {
            name: i18n.t('accessibility.closeDialog'),
          });

          expect(document.activeElement).toBe(checkbox);
          let expected: Element = checkbox;
          for (const shift of presses) {
            pressTab(shift);
            // With two focusable stops, Tab and Shift+Tab both move to the other one.
            expected = expected === checkbox ? learnMore : checkbox;
            expect(document.activeElement).toBe(expected);
            expect(document.activeElement).not.toBe(continueButton);
            expect(document.activeElement).not.toBe(closeButton);
          }
          // Continue and Close are not in the tab order.
          expect(continueButton).toHaveAttribute('tabindex', '-1');
          expect(closeButton).toHaveAttribute('tabindex', '-1');
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);
});
