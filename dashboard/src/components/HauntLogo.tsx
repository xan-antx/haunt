// The Haunt logo mark: a small lit candle. Decorative only; the wordmark text
// beside it in the header brand link gives the link its accessible name (Req 7.10, 7.11).

import styles from './HauntLogo.module.css';

export function HauntLogo({ className }: { className?: string }) {
  return (
    <svg
      className={[styles.mark, className ?? ''].filter(Boolean).join(' ')}
      data-haunt-logo=""
      viewBox="0 0 24 40"
      aria-hidden="true"
      focusable="false"
    >
      <path className={styles.flame} d="M12 2 C16 8 17 11 17 14 a5 5 0 0 1 -10 0 C7 11 9 7 12 2 Z" />
      <path className={styles.wick} d="M12 15 v4" />
      <rect className={styles.wax} x="7" y="19" width="10" height="19" rx="2" />
    </svg>
  );
}
