// Playback controls and the timeline. Unavailable controls stay focusable (aria-disabled),
// so keyboard focus is never lost when playback reaches an end.

import type { Finding, Step } from '../../data/types';
import { plainFindingType } from '../../model/findingLabels';
import styles from './GhostCam.module.css';

function Icon({ name }: { name: 'back' | 'forward' | 'play' | 'pause' }) {
  return (
    <svg className={styles.controlIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {name === 'back' && <path d="M14 4 L6 10 L14 16 Z M5 4 V16" />}
      {name === 'forward' && <path d="M6 4 L14 10 L6 16 Z M15 4 V16" />}
      {name === 'play' && <path d="M6 3 L16 10 L6 17 Z" />}
      {name === 'pause' && <path d="M5 3 H8.5 V17 H5 Z M11.5 3 H15 V17 H11.5 Z" />}
    </svg>
  );
}

export interface ControlsProps {
  playing: boolean;
  atFirst: boolean;
  atLast: boolean;
  onTogglePlay: () => void;
  onBack: () => void;
  onForward: () => void;
}

export function Controls({ playing, atFirst, atLast, onTogglePlay, onBack, onForward }: ControlsProps) {
  return (
    <div className={styles.controls} role="group" aria-label="Playback">
      <button
        type="button"
        className="button"
        aria-disabled={atFirst ? 'true' : undefined}
        onClick={() => {
          if (!atFirst) onBack();
        }}
      >
        <Icon name="back" />
        Step back
      </button>
      <button type="button" className="button" aria-pressed={playing} onClick={onTogglePlay}>
        <Icon name={playing ? 'pause' : 'play'} />
        Play
      </button>
      <button
        type="button"
        className="button"
        aria-disabled={atLast ? 'true' : undefined}
        onClick={() => {
          if (!atLast) onForward();
        }}
      >
        Step forward
        <Icon name="forward" />
      </button>
    </div>
  );
}

export function Timeline({
  steps,
  findings,
  current,
  onSelect,
}: {
  steps: Step[];
  findings: Finding[];
  current: number;
  onSelect: (n: number) => void;
}) {
  return (
    <section aria-labelledby="timeline-heading" className={styles.timelineWrap}>
      <h2 id="timeline-heading" className={styles.sectionHeading}>
        Timeline
      </h2>
      <ol className={styles.timeline}>
        {steps.map((step) => {
          const stepFindings = findings.filter((f) => f.step === step.n);
          const labels = [...new Set(stepFindings.map((f) => plainFindingType(f.type)))];
          const name = labels.length > 0 ? `Step ${step.n}, finding: ${labels.join(', ')}` : `Step ${step.n}`;
          const isCurrent = step.n === current;
          return (
            <li key={step.n} className={styles.timelineItem}>
              <button
                type="button"
                className={[styles.mark, labels.length ? styles.findingMark : '', isCurrent ? styles.currentMark : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-label={name}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onSelect(step.n)}
              >
                {labels.length > 0 && (
                  <svg className={styles.miniTombstone} viewBox="0 0 16 20" aria-hidden="true" focusable="false">
                    <path d="M2 19 V8 a6 6 0 0 1 12 0 V19 Z" />
                  </svg>
                )}
                <span aria-hidden="true">{step.n}</span>
              </button>
              {labels.length > 0 && (
                <span className={styles.markLabel} aria-hidden="true">
                  {labels.join(', ')}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
