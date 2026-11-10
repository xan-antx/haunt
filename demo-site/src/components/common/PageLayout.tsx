import { memo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CONTACT } from '../../data/billExtras';
import { SAMPLE_BILL } from '../../types';
import { LanternLogo } from './LanternLogo';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  /** Descriptive document title for the page. */
  title: string;
  children: ReactNode;
}

function Brand({ logoSize }: { logoSize: number }) {
  const { t } = useTranslation();
  return (
    <div className={styles.brandBlock}>
      <LanternLogo size={logoSize} className={styles.logo} />
      <div>
        <p className={styles.brand} lang="en">
          Lantern Bills
        </p>
        <p className={styles.tagline}>{t('header.tagline')}</p>
      </div>
    </div>
  );
}

// The header and footer take no props, so memo keeps them from re-rendering on every keystroke in the
// payment form. They still update when the language changes, through useTranslation.
const SiteHeader = memo(function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand logoSize={46} />
        <div className={styles.customer}>
          <p className={styles.greeting}>{t('header.greeting', { name: t('header.customerName') })}</p>
          <p className={styles.accountLine}>
            {t('header.accountLabel')}{' '}
            <span className={styles.accountNumber}>{SAMPLE_BILL.accountNumber}</span>
          </p>
        </div>
      </div>
    </header>
  );
});

const SiteFooter = memo(function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <Brand logoSize={38} />

        <div className={styles.footerColumns}>
          <div>
            <h2 className={styles.footerHeading}>{t('footer.careHeading')}</h2>
            <p className={styles.footerText}>{t('footer.careText', { email: CONTACT.careEmail })}</p>
            <p className={styles.footerText}>{t('footer.careHours')}</p>
          </div>
          <div>
            <h2 className={styles.footerHeading}>{t('footer.outageHeading')}</h2>
            <p className={styles.footerText}>{t('footer.outageText', { email: CONTACT.outageEmail })}</p>
          </div>
          <div>
            <h2 className={styles.footerHeading}>{t('footer.safetyHeading')}</h2>
            <p className={styles.footerText}>{t('footer.safetyText')}</p>
          </div>
        </div>

        <p className={styles.copyright}>
          &copy; 2026 <span lang="en">Lantern Bills</span>
        </p>
      </div>
    </footer>
  );
});

/** Shared header / main / footer landmarks and document title. */
export function PageLayout({ title, children }: PageLayoutProps) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export default PageLayout;
