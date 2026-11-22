// The AI_Mind_Label: visible text on an AI run, next to where the run is named. Renders nothing
// for a scripted run. Same dashed-outline look as the Sample_Label, so it reads without color.

import type { Run } from '../data/types';
import { AI_MIND_LABEL, isAiRun } from '../model/mind';
import styles from './SampleTag.module.css';

export function MindTag({ run, className }: { run: Run; className?: string }) {
  if (!isAiRun(run)) return null;
  return (
    <span className={`${styles.tag} ${className ?? ''}`} data-mind-tag="">
      {AI_MIND_LABEL}
    </span>
  );
}
