// Spec Coverage: each mission's requirement, and whether each ghost's latest run completed it.

import { Link } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ResultBadge } from '../components/ResultBadge';
import { useAllRuns } from '../data/hooks';
import type { GhostId } from '../data/types';
import { buildCoverage, type GhostCoverage } from '../model/coverage';
import { formatDate } from '../model/format';
import { GHOSTS, GHOST_ORDER } from '../model/ghosts';
import { stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './CoverageScreen.module.css';

function NotYetHaunted() {
  return (
    <span className={styles.notYet}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 21 V10 a7 7 0 0 1 14 0 V21 l-2.3 -2 l-2.3 2 l-2.4 -2 l-2.4 2 l-2.3 -2 Z" />
      </svg>
      <span>Not yet haunted</span>
    </span>
  );
}

function CoverageCell({ ghost, coverage }: { ghost: GhostId; coverage: GhostCoverage }) {
  if (!coverage.latest) return <NotYetHaunted />;
  return (
    <>
      <ResultBadge result={coverage.latest.result} />
      <ul className={styles.runs}>
        {coverage.runs.map((run, i) => (
          <li key={run.key}>
            <Link to={stepPath(run.key, 1)}>
              {i === 0 ? 'Latest' : 'Earlier'} run by {GHOSTS[ghost].name}, {formatDate(run.startedAt)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CoverageScreen() {
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the missions" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;
  const missions = buildCoverage(state.runs);

  return (
    <>
      <ScreenHeading title="Spec Coverage">Spec Coverage</ScreenHeading>
      <ScreenIntro>Each row is one requirement, showing whether each ghost could complete it.</ScreenIntro>
      <p>If a ghost couldn't complete a requirement, people with the same needs probably can't either.</p>
      {missions.length === 0 ? (
        <p>No missions yet. Once a ghost has walked a mission, it appears here.</p>
      ) : (
        <table className={styles.table} role="table" data-tour="coverage-table">
          <caption className="visually-hidden">Which ghosts completed each mission</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                Mission
              </th>
              {GHOST_ORDER.map((g) => (
                <th key={g} scope="col" role="columnheader">
                  {GHOSTS[g].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {missions.map((m) => (
              <tr key={m.missionId} role="row">
                <th scope="row" role="rowheader" className={styles.mission}>
                  <span className={styles.requirement}>{m.requirement}</span>
                  <span className={styles.goal}>Goal: {m.goal}</span>
                  <span className={styles.id}>
                    Mission <code>{m.missionId}</code>
                  </span>
                  {m.requirementChanged && (
                    <span className={styles.changed}>
                      The requirement text changed between runs. This row shows the text from the most recent run.
                    </span>
                  )}
                </th>
                {GHOST_ORDER.map((g) => (
                  <td key={g} role="cell" data-label={GHOSTS[g].name}>
                    <CoverageCell ghost={g} coverage={m.perGhost[g]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
