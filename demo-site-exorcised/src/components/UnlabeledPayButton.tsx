import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './UnlabeledPayButton.module.css';

export interface UnlabeledPayButtonProps {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

/**
 * Icon-only submit button. It is labeled from `accessibility.payButton` in the translation files,
 * so screen readers announce a localized name. The icon stays hidden from assistive technology.
 */
export function UnlabeledPayButton({ onClick, disabled = false }: UnlabeledPayButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      className={styles.button}
      aria-label={t('accessibility.payButton')}
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
