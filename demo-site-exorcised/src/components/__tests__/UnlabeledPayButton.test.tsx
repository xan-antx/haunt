import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnlabeledPayButton } from '../UnlabeledPayButton';

function renderButton(onClick = vi.fn(), disabled = false) {
  const { container } = render(<UnlabeledPayButton onClick={onClick} disabled={disabled} />);
  const button = container.querySelector('button') as HTMLButtonElement;
  return { button, onClick };
}

describe('UnlabeledPayButton (Problem 1: no accessible name)', () => {
  it('has an empty accessible name', () => {
    const { button } = renderButton();
    expect(button).toHaveAccessibleName('');
  });

  it('has no aria-label, aria-labelledby, or title', () => {
    const { button } = renderButton();
    expect(button).not.toHaveAttribute('aria-label');
    expect(button).not.toHaveAttribute('aria-labelledby');
    expect(button).not.toHaveAttribute('title');
    expect(button.querySelector('title')).toBeNull();
  });

  it('has no text content', () => {
    const { button } = renderButton();
    expect(button.textContent?.trim()).toBe('');
  });

  it('contains only an icon (svg) hidden from assistive technology', () => {
    const { button } = renderButton();
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('is keyboard focusable', () => {
    const { button } = renderButton();
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button).not.toHaveAttribute('tabindex', '-1');
  });

  it('is clickable', () => {
    const { button, onClick } = renderButton();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const { button, onClick } = renderButton(vi.fn(), true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
