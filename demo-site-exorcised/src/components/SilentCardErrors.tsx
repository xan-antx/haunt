import type { CardValidationErrors } from '../types';
import styles from './SilentCardErrors.module.css';

export type { CardValidationErrors };

export interface SilentCardErrorsProps {
  errors: CardValidationErrors;
}

/** Ids of the error elements; the card inputs point to them with aria-describedby. */
export const CARD_ERROR_IDS = {
  cardNumber: 'card-number-error',
  expiry: 'card-expiry-error',
  cvv: 'card-cvv-error',
} as const;

/**
 * Card validation errors. Each message sits in a role="alert" element, so a screen reader
 * announces it when it appears, and has an id the matching input references with
 * aria-describedby (set by the page through FormField).
 */
export function SilentCardErrors({ errors }: SilentCardErrorsProps) {
  return (
    <div className={styles.errors}>
      {errors.cardNumber ? (
        <div id={CARD_ERROR_IDS.cardNumber} role="alert" className={styles.errorText}>
          {errors.cardNumber}
        </div>
      ) : null}
      {errors.expiry ? (
        <div id={CARD_ERROR_IDS.expiry} role="alert" className={styles.errorText}>
          {errors.expiry}
        </div>
      ) : null}
      {errors.cvv ? (
        <div id={CARD_ERROR_IDS.cvv} role="alert" className={styles.errorText}>
          {errors.cvv}
        </div>
      ) : null}
    </div>
  );
}

export default SilentCardErrors;
