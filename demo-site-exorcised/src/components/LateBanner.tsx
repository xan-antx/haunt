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
 * The banner image appears 1500ms after the page renders. Its space is reserved from the start
 * (width and height attributes plus an aspect ratio and minimum height in the CSS module), so
 * content below it does not move when it arrives.
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
      className={styles.banner}
      src={src}
      width={1200}
      height={300}
      alt={src ? t('banner.alt') : ''}
    />
  );
}

export default LateBanner;
