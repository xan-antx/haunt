import type { ReactNode } from 'react';
import styles from './Button.module.css';

export interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  /** Use when children is not text (e.g. an icon). */
  ariaLabel?: string;
  type?: 'button' | 'submit';
}

/** Generic accessible button. Not used for the pay button. */
export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  ariaLabel,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${styles.button} ${variant === 'primary' ? styles.primary : styles.secondary}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export default Button;
