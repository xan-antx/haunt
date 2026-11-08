import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '../components/common/PageLayout';
import { useLanguage } from '../hooks/useLanguage';
import styles from './Pages.module.css';

export function AutopayPage() {
  const { t } = useTranslation();
  useLanguage();

  return (
    <PageLayout title={`${t('autopay.heading')} - Lantern Bills`}>
      <h1 className={styles.pageHeading}>{t('autopay.heading')}</h1>
      <p className={styles.paragraph}>{t('autopay.comingSoon')}</p>
      <p className={styles.paragraph}>{t('autopay.description')}</p>
      <Link to="/" className={styles.backLink}>
        {t('autopay.backToBill')}
      </Link>
    </PageLayout>
  );
}

export default AutopayPage;
