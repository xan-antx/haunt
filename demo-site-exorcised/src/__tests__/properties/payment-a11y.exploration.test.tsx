import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TrappingProtectionModal } from '../../components/TrappingProtectionModal';
import { UnlabeledPayButton } from '../../components/UnlabeledPayButton';

/**
 * Feature: exorcised-payment-a11y-fix, Property 1: Bug Condition
 * Pay button name, dialog keyboard operation and focus return.
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

/** Hosts the modal with an "Open" opener, as BillPage does. */
function Host({
  onContinue = () => undefined,
  onCloseSpy,
}: {
  onContinue?: (addOn: boolean) => void;
  onCloseSpy?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <TrappingProtectionModal
        isOpen={open}
        onContinue={onContinue}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
        amount={2490}
      />
    </>
  );
}

const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement;
const learnMore = () => screen.getByText(i18n.t('modal.learnMore'));
const continueControl = () => screen.getByRole('button', { name: i18n.t('modal.continue') });
const closeControl = () =>
  screen.getByRole('button', { name: i18n.t('accessibility.closeDialog') });

async function openFromOpener(user: ReturnType<typeof userEvent.setup>) {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  await user.keyboard('{Enter}');
  return opener;
}

describe('Exploration: payment accessibility bug condition', () => {
  it('pay button has the accessible name "Pay now"', () => {
    const { container } = render(<UnlabeledPayButton onClick={() => undefined} />);
    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button).toHaveAccessibleName(i18n.t('accessibility.payButton'));
    expect(screen.getByRole('button', { name: 'Pay now' })).toBe(button);
  });

  it('Tab visits Learn more, Continue, Close, then wraps to the checkbox', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openFromOpener(user);
    expect(document.activeElement).toBe(checkbox());
    await user.tab();
    expect(document.activeElement).toBe(learnMore());
    await user.tab();
    expect(document.activeElement).toBe(continueControl());
    await user.tab();
    expect(document.activeElement).toBe(closeControl());
    await user.tab();
    expect(document.activeElement).toBe(checkbox());
  });

  it('Shift+Tab from the checkbox wraps to Close', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openFromOpener(user);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(closeControl());
  });

  it('Enter and Space on focused Continue call onContinue(true)', async () => {
    for (const key of ['{Enter}', ' ']) {
      const user = userEvent.setup();
      const onContinue = vi.fn();
      const { unmount } = render(<Host onContinue={onContinue} />);
      await openFromOpener(user);
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(continueControl());
      await user.keyboard(key);
      expect(onContinue).toHaveBeenCalledWith(true);
      unmount();
    }
  });

  it('Enter and Space on focused Close call onClose', async () => {
    for (const key of ['{Enter}', ' ']) {
      const user = userEvent.setup();
      const onCloseSpy = vi.fn();
      const { unmount } = render(<Host onCloseSpy={onCloseSpy} />);
      await openFromOpener(user);
      await user.tab();
      await user.tab();
      await user.tab();
      expect(document.activeElement).toBe(closeControl());
      await user.keyboard(key);
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('Escape calls onClose and closes the dialog', async () => {
    const user = userEvent.setup();
    const onCloseSpy = vi.fn();
    render(<Host onCloseSpy={onCloseSpy} />);
    await openFromOpener(user);
    await user.keyboard('{Escape}');
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the opener after Close, Escape and isOpen=false', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const opener = await openFromOpener(user);
    await user.click(closeControl());
    expect(document.activeElement).toBe(opener);

    await openFromOpener(user);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus to the opener when isOpen becomes false', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const props = { onContinue: vi.fn(), onClose: vi.fn(), amount: 2490 };
    const view = render(<TrappingProtectionModal isOpen {...props} />);
    expect(document.activeElement).toBe(checkbox());
    view.rerender(<TrappingProtectionModal isOpen={false} {...props} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
