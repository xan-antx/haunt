import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BackArrowIcon } from '../components/common/BackArrowIcon';
import { PageLayout } from '../components/common/PageLayout';
import { useLanguage, useLanguageSearch } from '../hooks/useLanguage';
import { SAMPLE_BILL } from '../types';
import { formatCurrency } from '../utils/currency';
import styles from './Pages.module.css';

interface ConfirmationState {
  totalCharged?: number;
  addOnIncluded?: boolean;
}

/** A green tick in a circle (decorative; the heading says the payment was received). */
function SuccessIcon() {
  return (
    <svg className={styles.statusIcon} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="#e7f4ea" stroke="#1b6e2d" strokeWidth="2.5" />
      <path d="M14.5 24.5l6.5 6.5 12.5-13" fill="none" stroke="#1b6e2d" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ConfirmationPage() {
  const { t } = useTranslation();
  useLanguage();
  const languageSearch = useLanguageSearch();
  const location = useLocation();
  const state = (location.state ?? {}) as ConfirmationState;
  const totalCharged = state.totalCharged ?? SAMPLE_BILL.amountDue;

  return (
    <PageLayout title={`${t('confirmation.heading')} - Lantern Bills`}>
      <h1 className={styles.pageHeading}>{t('confirmation.heading')}</h1>
      <section
        className={`${styles.section} ${styles.success} ${styles.statusCard}`}
        data-haunt="payment-success"
        aria-labelledby="confirmation-summary-heading"
      >
        <div className={styles.statusTop}>
          <SuccessIcon />
          <h2 id="confirmation-summary-heading" className={styles.sectionHeading}>
            {t('confirmation.success')}
          </h2>
        </div>
        <dl className={styles.detailsList}>
          <dt>{t('confirmation.charged')}</dt>
          <dd data-testid="total-charged" className={styles.charged}>
            {formatCurrency(totalCharged)}
          </dd>
        </dl>
        <p className={styles.paragraph}>{t('confirmation.thankYou')}</p>
      </section>
      <Link to={{ pathname: '/', search: languageSearch }} className={styles.backLink}>
        <BackArrowIcon />
        {t('confirmation.backToBill')}
      </Link>
    </PageLayout>
  );
}

export default ConfirmationPage;
