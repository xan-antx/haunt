import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BackArrowIcon } from '../components/common/BackArrowIcon';
import { PageLayout } from '../components/common/PageLayout';
import { useLanguage, useLanguageSearch } from '../hooks/useLanguage';
import styles from './Pages.module.css';

/** A calendar page with a small lantern on it (decorative). */
function CalendarIcon() {
  return (
    <svg className={styles.statusIcon} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      <rect x="5" y="9" width="38" height="34" rx="7" fill="#e9ecfa" stroke="#2d3a8c" strokeWidth="2.5" />
      <path d="M5 18h38" stroke="#2d3a8c" strokeWidth="2.5" />
      <path d="M15 5v8M33 5v8" stroke="#2d3a8c" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="18.5" y="23" width="11" height="14" rx="4" fill="#f4a62a" stroke="#c46d12" strokeWidth="1.5" />
      <path d="M24 26.5c2 2.4 2.2 4.2 0 6c-2.2-1.8-2-3.6 0-6z" fill="#fff6d8" />
    </svg>
  );
}

export function AutopayPage() {
  const { t } = useTranslation();
  useLanguage();
  const languageSearch = useLanguageSearch();

  return (
    <PageLayout title={`${t('autopay.heading')} - Lantern Bills`}>
      <h1 className={styles.pageHeading}>{t('autopay.heading')}</h1>
      <div className={`${styles.section} ${styles.statusCard}`}>
        <div className={styles.statusTop}>
          <CalendarIcon />
          <div>
            <p className={`${styles.paragraph} ${styles.lead}`}>{t('autopay.comingSoon')}</p>
            <p className={styles.paragraph}>{t('autopay.description')}</p>
          </div>
        </div>
        <Link to={{ pathname: '/', search: languageSearch }} className={styles.backLink}>
          <BackArrowIcon />
          {t('autopay.backToBill')}
        </Link>
      </div>
    </PageLayout>
  );
}

export default AutopayPage;
