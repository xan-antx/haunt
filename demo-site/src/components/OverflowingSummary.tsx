import { useTranslation } from 'react-i18next';
import styles from './OverflowingSummary.module.css';

export interface OverflowingSummaryProps {
  /** Formatted amount, e.g. "₹2,490.00". */
  amount: string;
}

/**
 * PROBLEM 5 (deliberate): at viewport widths of 640px or less the box has a fixed
 * width, overflow hidden and nowrap, so the end of the amount is clipped and
 * cannot be reached by scrolling or reflow. The behaviour lives in the CSS module.
 */
export function OverflowingSummary({ amount }: OverflowingSummaryProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.summary} aria-labelledby="payment-summary-heading">
      <h2 id="payment-summary-heading" className={styles.heading}>
        {t('summary.heading')}
      </h2>
      <p className={styles.label}>{t('summary.total')}</p>
      <p className={styles.amount} data-testid="summary-amount">
        {amount}
      </p>
    </section>
  );
}

export default OverflowingSummary;
