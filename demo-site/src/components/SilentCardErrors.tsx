import type { CardValidationErrors } from '../types';
import styles from './SilentCardErrors.module.css';

export type { CardValidationErrors };

export interface SilentCardErrorsProps {
  errors: CardValidationErrors;
}

/**
 * PROBLEM 3 (deliberate): card validation errors are visible but never announced.
 * Plain elements with red text. No role="alert", no aria-live, no aria-describedby
 * link from the inputs, and no aria-invalid on the inputs. Do not add any.
 */
export function SilentCardErrors({ errors }: SilentCardErrorsProps) {
  return (
    <div className={styles.errors}>
      {errors.cardNumber ? <div className={styles.errorText}>{errors.cardNumber}</div> : null}
      {errors.expiry ? <div className={styles.errorText}>{errors.expiry}</div> : null}
      {errors.cvv ? <div className={styles.errorText}>{errors.cvv}</div> : null}
    </div>
  );
}

export default SilentCardErrors;
