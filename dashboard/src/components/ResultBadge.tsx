// A run result as an icon plus text. Failures use the red fill with white text and a light border.

import type { RunResult } from '../data/types';
import { RESULT_LABELS } from '../model/ghosts';
import styles from './ResultBadge.module.css';

export function ResultIcon({ result }: { result: RunResult }) {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {result === 'succeeded' && <path d="M4 10.5 L8.5 15 L16 5.5" />}
      {result === 'gave_up' && (
        <>
          {/* a snuffed candle: wax with a slanted cut and no flame */}
          <path d="M7 18 V9 L13 7 V18 Z" />
          <path d="M10 5 c-1.5 -1.5 1.5 -2.5 0 -4" />
        </>
      )}
      {result === 'error' && (
        <>
          <path d="M10 2 L18.5 17 H1.5 Z" />
          <path d="M10 8 V12 M10 14.5 V14.6" />
        </>
      )}
    </svg>
  );
}

export function ResultBadge({ result, label }: { result: RunResult; label?: string }) {
  const tone = result === 'succeeded' ? styles.success : styles.failure;
  return (
    <span className={`${styles.badge} ${tone}`}>
      <ResultIcon result={result} />
      <span>{label ?? RESULT_LABELS[result]}</span>
    </span>
  );
}
