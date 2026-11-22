import { fireEvent, render } from '@testing-library/react';
import i18n from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { UnlabeledPayButton } from '../UnlabeledPayButton';

function renderButton(onClick = vi.fn(), disabled = false) {
  const { container } = render(<UnlabeledPayButton onClick={onClick} disabled={disabled} />);
  const button = container.querySelector('button') as HTMLButtonElement;
  return { button, onClick };
}

describe('UnlabeledPayButton (Problem 1 fixed: accessible name)', () => {
  it('has the accessible name Pay now', () => {
    const { button } = renderButton();
    expect(button).toHaveAccessibleName('Pay now');
  });

  it('is labeled from the translation file', async () => {
    const { button } = renderButton();
    expect(button).toHaveAttribute('aria-label', i18n.t('accessibility.payButton'));

    await i18n.changeLanguage('pa');
    expect(renderButton().button).toHaveAccessibleName('ਭੁਗਤਾਨ ਕਰੋ');

    await i18n.changeLanguage('hi');
    expect(renderButton().button).toHaveAccessibleName('अभी भुगतान करें');
  });

  it('keeps the icon-only look', () => {
    const { button } = renderButton();
    expect(button.textContent?.trim()).toBe('');
  });

  it('contains only an icon (svg) hidden from assistive technology', () => {
    const { button } = renderButton();
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('is a submit button', () => {
    const { button } = renderButton();
    expect(button).toHaveAttribute('type', 'submit');
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
