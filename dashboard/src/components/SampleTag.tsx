// The Sample_Label (Req 24.2): visible text on every sample run the Dashboard shows, so nobody
// mistakes a sample for a real ghost visit. Renders nothing for a real run.

import type { Run } from '../data/types';
import { SAMPLE_LABEL, isSample } from '../model/origin';
import styles from './SampleTag.module.css';

export function SampleTag({ run, onBone = false, className }: { run: Run; onBone?: boolean; className?: string }) {
  if (!isSample(run)) return null;
  return (
    <span className={`${styles.tag} ${onBone ? styles.onBone : ''} ${className ?? ''}`} data-sample-tag="">
      {SAMPLE_LABEL}
    </span>
  );
}
