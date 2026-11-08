import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import bannerUrl from '../assets/banner.svg';
import styles from './LateBanner.module.css';

export const BANNER_DELAY_MS = 1500;

export interface LateBannerProps {
  /** Called once the banner src has been set (after the 1500ms delay). */
  onLoaded?: () => void;
}

/**
 * PROBLEM 4 (deliberate): the banner image appears 1500ms after the page renders
 * and reserves no space beforehand, so content below it jumps down.
 * No width/height attributes, no min-height before load, no aspect-ratio, no placeholder.
 */
export function LateBanner({ onLoaded }: LateBannerProps) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSrc(bannerUrl);
      onLoaded?.();
    }, BANNER_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <img
      className={src ? `${styles.banner} ${styles.loaded}` : styles.banner}
      src={src}
      alt={src ? t('banner.alt') : ''}
    />
  );
}

export default LateBanner;
