import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonthlyUsage } from '../data/billExtras';
import { formatMonthYear, formatNumber, formatShortMonth } from '../utils/format';
import styles from './UsageChart.module.css';

export interface UsageChartProps {
  /** Oldest first; the last entry is the month on this bill. */
  usage: readonly MonthlyUsage[];
}

/**
 * A small bar chart of units used per month, built from an ordered list so it reflows with zoom.
 * Each item has one plain sentence for screen readers ("October 2026: 356 units, on this bill");
 * the drawn bars and short labels repeat it visually and are hidden from assistive technology.
 * Memoised so typing in the payment form does not re-render it; it still follows language changes.
 */
export const UsageChart = memo(function UsageChart({ usage }: UsageChartProps) {
  const { t } = useTranslation();
  const max = Math.max(...usage.map(entry => entry.units), 1);
  const total = usage.reduce((sum, entry) => sum + entry.units, 0);
  const average = usage.length > 0 ? Math.round(total / usage.length) : 0;
  const lastIndex = usage.length - 1;

  return (
    <div className={styles.usage}>
      <h3 id="usage-heading" className={styles.heading}>
        {t('usage.heading')}
      </h3>
      <ol className={styles.chart} aria-labelledby="usage-heading">
        {usage.map((entry, index) => {
          const current = index === lastIndex;
          const value = formatNumber(entry.units);
          const sentence = t(current ? 'usage.itemCurrent' : 'usage.item', {
            month: formatMonthYear(t, entry.month),
            value,
          });
          return (
            <li key={entry.month} className={current ? `${styles.item} ${styles.current}` : styles.item}>
              <span className="visually-hidden">{sentence}</span>
              <span className={styles.visual} aria-hidden="true">
                <span className={styles.value}>{value}</span>
                <span className={styles.track}>
                  <span className={styles.bar} style={{ height: `${(entry.units / max) * 100}%` }} />
                </span>
                <span className={styles.month}>{formatShortMonth(t, entry.month)}</span>
                <span className={styles.marker}>{current ? t('usage.thisBill') : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.average}>{t('usage.average', { value: formatNumber(average) })}</p>
    </div>
  );
});

export default UsageChart;
