// The one Stuck_Notice slot on the Ghost Cam. The slot is always rendered at a fixed height,
// and is empty when the model returns null, so nothing around it moves (Req 10.30, 10.31).
// The third line is one readable sentence; "Full details" opens every finding at this step with
// its full evidence, over the content above the slot (Req 10.36). The parent keys this component
// by step, so the details close when the step changes.

import { useId, useRef, useState } from 'react';
import type { Run, Step } from '../data/types';
import { stuckNotice } from '../model/stuckNotice';
import { ExpandButton, ExpandPanel } from './Expand';
import styles from './StuckNotice.module.css';

export const FULL_DETAILS = 'Full details';

export function StuckNotice({ run, step }: { run: Run; step: Step }) {
  const notice = stuckNotice(run, step);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const hasDetails = notice !== null && notice.details.length > 0;

  return (
    <div className={styles.slot} data-cam-area="notice" data-testid="stuck-notice-slot">
      {notice && (
        <div
          className={`${styles.notice} ${notice.tone === 'warning' ? styles.warning : ''}`}
          data-testid="stuck-notice"
          data-tone={notice.tone}
          title={notice.fullText}
        >
          <div className={styles.text}>
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
          {hasDetails && (
            <ExpandButton
              open={open}
              controls={panelId}
              onToggle={() => setOpen(!open)}
              onClose={close}
              buttonRef={button}
              className={styles.more}
            >
              {FULL_DETAILS}
            </ExpandButton>
          )}
        </div>
      )}
      {notice && hasDetails && (
        <ExpandPanel id={panelId} open={open} label={FULL_DETAILS} placement="above" onClose={close}>
          {notice.details.map((detail, i) => (
            <div key={i} className={styles.detail}>
              <p>
                <strong>
                  {detail.label}: {detail.title}
                </strong>
              </p>
              <p>{detail.evidence}</p>
            </div>
          ))}
        </ExpandPanel>
      )}
    </div>
  );
}
