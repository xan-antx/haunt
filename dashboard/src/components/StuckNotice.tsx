// The one Stuck_Notice slot on the Ghost Cam. The slot is always rendered at a fixed height,
// and is empty when the model returns null, so nothing around it moves (Req 10.30, 10.31).

import type { Run, Step } from '../data/types';
import { stuckNotice } from '../model/stuckNotice';
import styles from './StuckNotice.module.css';

export function StuckNotice({ run, step }: { run: Run; step: Step }) {
  const notice = stuckNotice(run, step);
  return (
    <div className={styles.slot} data-cam-area="notice" data-testid="stuck-notice-slot">
      {notice && (
        <div
          className={`${styles.notice} ${notice.tone === 'warning' ? styles.warning : ''}`}
          data-testid="stuck-notice"
          data-tone={notice.tone}
          title={notice.fullText}
        >
          {notice.lines.map((line, i) => (
            <p key={i} className={i === 0 ? styles.lead : undefined} title={line}>
              {notice.tone === 'warning' && (
                <span className={styles.warningIcon} aria-hidden="true">
                  ⚠{' '}
                </span>
              )}
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
