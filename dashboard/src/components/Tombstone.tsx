// One finding, drawn as a bone tombstone.

import { Link } from 'react-router-dom';
import { GHOSTS } from '../model/ghosts';
import type { TombstoneData } from '../model/graveyard';
import { stepPath } from '../routes';
import { GhostBadge } from './ghosts/Ghosts';
import styles from './Tombstone.module.css';

export function Tombstone({ data }: { data: TombstoneData }) {
  const { run, finding, label } = data;
  const ghost = GHOSTS[run.ghost];
  return (
    <article className={styles.tombstone}>
      <h2 className={styles.label}>{label}</h2>
      <GhostBadge ghost={run.ghost} onBone />
      <p className={styles.title}>{finding.title}</p>
      <p className={styles.evidence}>{finding.evidence}</p>
      <p className={styles.meta}>
        Step {finding.step} · {run.site.name}
      </p>
      <Link className={styles.link} to={stepPath(run.key, finding.step)}>
        Watch {ghost.name} at step {finding.step}
      </Link>
    </article>
  );
}
