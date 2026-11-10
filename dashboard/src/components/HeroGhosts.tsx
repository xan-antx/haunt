// The three ghosts, shown in the Home hero: character, name and a respectful one-line description.

import { GhostCharacter } from './ghosts/Ghosts';
import { GHOST_ORDER, GHOSTS } from '../model/ghosts';
import styles from './HeroGhosts.module.css';

/** Seconds of float delay per ghost, so they drift out of step. */
const FLOAT_DELAYS = ['0s', '1.5s', '3s'] as const;

export function HeroGhosts() {
  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {GHOST_ORDER.map((id, index) => {
          const ghost = GHOSTS[id];
          return (
            <li
              key={id}
              className={styles.item}
              data-float="hero"
              style={{ '--float-delay': FLOAT_DELAYS[index] } as React.CSSProperties}
            >
              <GhostCharacter ghost={id} size={120} lively />
              <p className={styles.name} style={{ color: `var(${ghost.accentToken})` }}>
                {ghost.name}
              </p>
              <p className={styles.description}>{ghost.description}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
