import styles from './UnlabeledPayButton.module.css';

export interface UnlabeledPayButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * PROBLEM 1 (deliberate): icon-only submit button with no accessible name.
 * No aria-label, aria-labelledby, title or text content. Do not add any.
 */
export function UnlabeledPayButton({ onClick, disabled = false }: UnlabeledPayButtonProps) {
  return (
    <button
      type="submit"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

export default UnlabeledPayButton;
