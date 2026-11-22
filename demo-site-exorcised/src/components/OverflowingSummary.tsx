import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { BILL_EXTRAS } from '../data/billExtras';
import { formatCurrency } from '../utils/currency';
import { formatNumber } from '../utils/format';
import styles from './OverflowingSummary.module.css';

export interface OverflowingSummaryProps {
  /** Formatted amount, e.g. "₹2,490.00". */
  amount: string;
}

/**
 * The payment summary: the two charges that make up the bill, then the total.
 *
 * PROBLEM 5 (deliberate): at viewport widths of 640px or less the box has a fixed
 * width, overflow hidden and nowrap, so the end of the total is clipped and
 * cannot be reached by scrolling or reflow. The charge lines above it wrap and stay
 * readable. The behaviour lives in the CSS module.
 */
// Memoised so typing in the payment form does not re-render it; it still follows language changes.
export const OverflowingSummary = memo(function OverflowingSummary({ amount }: OverflowingSummaryProps) {
  const { t } = useTranslation();
  const units = BILL_EXTRAS.usage[BILL_EXTRAS.usage.length - 1]?.units ?? 0;

  return (
    <section className={styles.summary} aria-labelledby="payment-summary-heading">
      <h2 id="payment-summary-heading" className={styles.heading}>
        {t('summary.heading')}
      </h2>
      <dl className={styles.breakdown}>
        <div className={styles.charge}>
          <dt>{t('summary.energyCharges', { units: formatNumber(units) })}</dt>
          <dd data-testid="summary-energy">{formatCurrency(BILL_EXTRAS.charges.energy)}</dd>
        </div>
        <div className={styles.charge}>
          <dt>{t('summary.fixedCharges')}</dt>
          <dd data-testid="summary-fixed">{formatCurrency(BILL_EXTRAS.charges.fixedAndGrid)}</dd>
        </div>
        <div className={styles.totalRow}>
          <dt className={styles.label}>{t('summary.total')}</dt>
          <dd className={styles.amount} data-testid="summary-amount">
            {amount}
          </dd>
        </div>
      </dl>
    </section>
  );
});

export default OverflowingSummary;
