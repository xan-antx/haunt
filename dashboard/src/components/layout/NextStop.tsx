// The "Next stop" link at the bottom of every screen on the Guided_Path (Req 20.10, 20.11).
// Rendered once by Layout, after the screen, so it is always the last content in <main>.

import { Link, useLocation } from 'react-router-dom';
import { useAllRuns } from '../../data/hooks';
import { SCREENS, nextStop, screenDestinations, screenOfRoute } from '../../model/screens';
import { parseRoute } from '../../routes';
import { ScreenIcon } from '../ScreenIcon';
import styles from './NextStop.module.css';

export function NextStop() {
  const state = useAllRuns();
  const location = useLocation();
  if (state.status !== 'ready') return null;

  const current = screenOfRoute(parseRoute(location.pathname));
  if (current === null) return null;
  const next = nextStop(current, screenDestinations(state.runs));
  if (next === null) return null;
  const info = SCREENS[next.id];

  // The accessible name is all the visible text: "Next stop: Graveyard Every problem found" (WCAG 2.5.3).
  return (
    <nav aria-label="Guided path" className={styles.nextStop}>
      <Link to={next.to} className={styles.link}>
        <ScreenIcon screen={next.id} className={styles.icon} />
        <span className={styles.text}>
          <span className={styles.name}>
            <span className={styles.kicker}>Next stop:</span> {info.name}
          </span>
          <span className={styles.description}>
            {info.description ?? 'Back to the start'}
          </span>
        </span>
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>
      </Link>
    </nav>
  );
}
