import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrappingProtectionModal } from '../TrappingProtectionModal';

function setup(overrides: Partial<React.ComponentProps<typeof TrappingProtectionModal>> = {}) {
  const onContinue = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <TrappingProtectionModal
      isOpen
      onContinue={onContinue}
      onClose={onClose}
      amount={2490}
      {...overrides}
    />
  );
  return { onContinue, onClose, ...view };
}

const checkbox = () => screen.getByRole('checkbox') as HTMLInputElement;
const learnMore = () => screen.getByText('Learn more');
const continueControl = () => screen.getByRole('button', { name: 'Continue' });
const closeControl = () => screen.getByRole('button', { name: 'Close dialog' });

function pressTab(shiftKey = false) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey });
}

/** Renders the modal after focusing a separate opener button, as BillPage does. */
function setupWithOpener(overrides: Partial<React.ComponentProps<typeof TrappingProtectionModal>> = {}) {
  const opener = document.createElement('button');
  opener.textContent = 'Opener';
  document.body.appendChild(opener);
  opener.focus();
  const view = setup(overrides);
  return { opener, ...view };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.querySelectorAll(':scope > button').forEach(el => el.remove());
});

describe('TrappingProtectionModal (Problem 2 fixed: keyboard operable)', () => {
  it('renders nothing when closed', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a dialog with an accessible label and the required content', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Protect your payment');
    expect(screen.getByRole('heading', { name: 'Protect your payment' })).toBeInTheDocument();
    expect(checkbox()).toBeInTheDocument();
    expect(learnMore()).toBeInTheDocument();
    expect(continueControl()).toBeInTheDocument();
    expect(closeControl()).toBeInTheDocument();
  });

  it('moves focus to the checkbox on open', () => {
    setup();
    expect(document.activeElement).toBe(checkbox());
  });

  it('has the checkbox checked by default', () => {
    setup();
    expect(checkbox().checked).toBe(true);
  });

  it('Tab and Shift+Tab visit checkbox, Learn more, Continue and Close in order and wrap', async () => {
    const user = userEvent.setup();
    setup();
    const order = [checkbox(), learnMore(), continueControl(), closeControl()];
    expect(document.activeElement).toBe(order[0]);
    for (const expected of [order[1], order[2], order[3], order[0], order[1]]) {
      await user.tab();
      expect(document.activeElement).toBe(expected);
    }
    for (const expected of [order[0], order[3], order[2]]) {
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(expected);
    }
  });

  it('wraps from Close to the checkbox on Tab and from the checkbox to Close on Shift+Tab', () => {
    setup();
    closeControl().focus();
    pressTab(false);
    expect(document.activeElement).toBe(checkbox());
    pressTab(true);
    expect(document.activeElement).toBe(closeControl());
  });

  it('brings focus into the dialog if it is outside', () => {
    setupWithOpener();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    pressTab(false);
    expect(document.activeElement).toBe(checkbox());
  });

  it('Continue and Close are native buttons with no tabindex="-1"', () => {
    setup();
    for (const control of [continueControl(), closeControl()]) {
      expect(control.tagName).toBe('BUTTON');
      expect(control).not.toHaveAttribute('tabindex', '-1');
    }
  });

  it('closes on Escape', () => {
    const first = setup();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it('activates Close with Enter and Space', async () => {
    for (const key of ['{Enter}', ' ']) {
      const user = userEvent.setup();
      const { onClose, unmount } = setup();
      closeControl().focus();
      await user.keyboard(key);
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('activates Continue with Enter and Space', async () => {
    for (const key of ['{Enter}', ' ']) {
      const user = userEvent.setup();
      const { onContinue, unmount } = setup();
      continueControl().focus();
      await user.keyboard(key);
      expect(onContinue).toHaveBeenCalledWith(true);
      unmount();
    }
  });

  it('returns focus to the opener after Close click, Escape and isOpen=false', () => {
    const props = { onContinue: vi.fn(), onClose: vi.fn(), amount: 2490 };

    const a = setupWithOpener();
    fireEvent.click(closeControl());
    a.rerender(<TrappingProtectionModal isOpen={false} {...props} />);
    expect(document.activeElement).toBe(a.opener);
    a.unmount();

    const b = setupWithOpener();
    fireEvent.keyDown(document, { key: 'Escape' });
    b.rerender(<TrappingProtectionModal isOpen={false} {...props} />);
    expect(document.activeElement).toBe(b.opener);
    b.unmount();

    const c = setupWithOpener();
    c.rerender(<TrappingProtectionModal isOpen={false} {...props} />);
    expect(document.activeElement).toBe(c.opener);
  });

  it('returns focus to returnFocusRef when it differs from the active element', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const view = setupWithOpener({ returnFocusRef: { current: target } });
    view.rerender(
      <TrappingProtectionModal
        isOpen={false}
        onContinue={vi.fn()}
        onClose={vi.fn()}
        amount={2490}
        returnFocusRef={{ current: target }}
      />
    );
    expect(document.activeElement).toBe(target);
  });

  it('does not throw when the opener is removed before close', () => {
    const view = setupWithOpener();
    view.opener.remove();
    expect(() =>
      view.rerender(
        <TrappingProtectionModal isOpen={false} onContinue={vi.fn()} onClose={vi.fn()} amount={2490} />
      )
    ).not.toThrow();
  });

  it('does not close when the backdrop is clicked', () => {
    const { onClose } = setup();
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('expands the explanation in place without moving focus out of the modal', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    const explanation = screen.getByText(/covers you against technical failures/i);
    expect(explanation).not.toBeVisible();
    const before = window.location.href;

    learnMore().focus();
    fireEvent.click(learnMore());

    expect(explanation).toBeVisible();
    expect(window.location.href).toBe(before);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Close click calls onClose without continuing', () => {
    const { onClose, onContinue } = setup();
    fireEvent.click(closeControl());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('Continue click passes the checkbox state and shows a processing indicator for 800ms', async () => {
    vi.useFakeTimers();
    const { onContinue } = setup();
    // Hold the element: its accessible name changes while processing.
    const button = continueControl();
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledWith(true);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Processing payment...');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(button).toHaveTextContent('Continue');
  });

  it('passes false when the checkbox has been unchecked', () => {
    const { onContinue } = setup();
    fireEvent.click(checkbox());
    fireEvent.click(continueControl());
    expect(onContinue).toHaveBeenCalledWith(false);
  });

  it('resets the checkbox to checked after being closed and reopened', () => {
    const view = setup();
    fireEvent.click(checkbox());
    expect(checkbox().checked).toBe(false);
    view.rerender(
      <TrappingProtectionModal isOpen={false} onContinue={vi.fn()} onClose={vi.fn()} amount={2490} />
    );
    view.rerender(
      <TrappingProtectionModal isOpen onContinue={vi.fn()} onClose={vi.fn()} amount={2490} />
    );
    expect(checkbox().checked).toBe(true);
  });
});
