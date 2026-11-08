import { act, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => {
  vi.useRealTimers();
});

describe('TrappingProtectionModal (Problem 2: keyboard trap, mouse-only controls)', () => {
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

  it('Tab never reaches the Continue or Close controls', () => {
    setup();
    const seen = new Set<Element | null>();
    for (let i = 0; i < 12; i += 1) {
      seen.add(document.activeElement);
      pressTab(false);
    }
    for (let i = 0; i < 12; i += 1) {
      seen.add(document.activeElement);
      pressTab(true);
    }
    expect(seen).toEqual(new Set([checkbox(), learnMore()]));
    expect(seen.has(continueControl())).toBe(false);
    expect(seen.has(closeControl())).toBe(false);
  });

  it('pulls focus back into the modal even if it was on a mouse-only control', () => {
    setup();
    closeControl().focus();
    pressTab(false);
    expect([checkbox(), learnMore()]).toContain(document.activeElement);
  });

  it('marks Continue and Close with tabindex="-1"', () => {
    setup();
    expect(continueControl()).toHaveAttribute('tabindex', '-1');
    expect(closeControl()).toHaveAttribute('tabindex', '-1');
  });

  it('does not close on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
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
