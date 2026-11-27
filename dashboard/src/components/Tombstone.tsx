// One finding, drawn as a bone tombstone.

import { Link } from 'react-router-dom';
import { GHOSTS, moodFor } from '../model/ghosts';
import { epitaph, type TombstoneData } from '../model/graveyard';
import { siteLabel } from '../model/sites';
import { stepPath } from '../routes';
import { GhostBadge } from './ghosts/Ghosts';
import { SampleTag } from './SampleTag';
import styles from './Tombstone.module.css';

export function Tombstone({ data }: { data: TombstoneData }) {
  const { run, finding, label } = data;
  const ghost = GHOSTS[run.ghost];
  return (
    <article className={styles.tombstone}>
      <h2 className={styles.label}>{label}</h2>
      <GhostBadge ghost={run.ghost} mood={moodFor(run.result)} onBone />
      <SampleTag run={run} onBone />
      <p className={styles.title}>{epitaph(finding)}</p>
      <details className={styles.details}>
        <summary>Full details</summary>
        <p className={styles.evidence}>
          <strong>{finding.title}.</strong> {finding.evidence}
        </p>
      </details>
      <p className={styles.meta}>
        Step {finding.step} · {siteLabel(run.site.name)}
      </p>
      <Link className={styles.link} to={stepPath(run.key, finding.step)}>
        Watch {ghost.name} at step {finding.step}
      </Link>
    </article>
  );
}
