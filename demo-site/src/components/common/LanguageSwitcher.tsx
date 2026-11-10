import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toSupportedLanguage, withLanguage } from '../../hooks/useLanguage';
import type { SupportedLanguage } from '../../types';
import styles from './LanguageSwitcher.module.css';

/** Each option is always written in its own language, whatever language the page is in. */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ lang: SupportedLanguage; label: string }> = [
  { lang: 'en', label: 'English' },
  { lang: 'pa', label: 'ਪੰਜਾਬੀ' },
  { lang: 'hi', label: 'हिन्दी' },
];

/**
 * English | ਪੰਜਾਬੀ | हिन्दी. Each option is an ordinary link to the current page with ?lang= set, so it
 * works with Tab and Enter, changes the language exactly as ?lang= does (useLanguage follows the
 * address), keeps the choice in the address and lets the Back button undo it. The page state (the
 * amount on the confirmation page) is carried along. The current language has aria-current, and is
 * shown bold and underlined, not by colour alone. The dividers are borders, so nothing extra is read out.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const current = toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language);

  return (
    <nav className={styles.languages} aria-label={t('header.languageNav')}>
      <ul className={styles.list}>
        {LANGUAGE_OPTIONS.map(option => {
          const isCurrent = option.lang === current;
          return (
            <li key={option.lang} className={styles.item}>
              <Link
                to={{ pathname: location.pathname, search: withLanguage(location.search, option.lang) }}
                state={location.state}
                lang={option.lang}
                hrefLang={option.lang}
                aria-current={isCurrent ? 'true' : undefined}
                className={isCurrent ? `${styles.option} ${styles.current}` : styles.option}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default LanguageSwitcher;
