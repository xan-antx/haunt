import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/common/PageLayout';
import { useLanguage } from '../hooks/useLanguage';
import { SAMPLE_BILL } from '../types';
import { formatCurrency } from '../utils/currency';
import styles from './Pages.module.css';

interface ConfirmationState {
  totalCharged?: number;
  addOnIncluded?: boolean;
}

export function ConfirmationPage() {
  const { t } = useTranslation();
  useLanguage();
  const location = useLocation();
  const state = (location.state ?? {}) as ConfirmationState;
  const totalCharged = state.totalCharged ?? SAMPLE_BILL.amountDue;

  return (
    <PageLayout title={`${t('confirmation.heading')} - Lantern Bills`}>
      <h1 className={styles.pageHeading}>{t('confirmation.heading')}</h1>
      <section
        className={`${styles.section} ${styles.success}`}
        data-haunt="payment-success"
        aria-labelledby="confirmation-summary-heading"
      >
        <h2 id="confirmation-summary-heading" className={styles.sectionHeading}>
          {t('confirmation.success')}
        </h2>
        <dl className={styles.detailsList}>
          <dt>{t('confirmation.charged')}</dt>
          <dd data-testid="total-charged">{formatCurrency(totalCharged)}</dd>
        </dl>
        <p className={styles.paragraph}>{t('confirmation.thankYou')}</p>
      </section>
      <Link to="/" className={styles.backLink}>
        {t('confirmation.backToBill')}
      </Link>
    </PageLayout>
  );
}

export default ConfirmationPage;
