// Spec Coverage: each mission's requirement, and whether each ghost's latest run completed it.

import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExpandButton, ExpandPanel } from '../components/Expand';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ResultBadge } from '../components/ResultBadge';
import { useAllRuns } from '../data/hooks';
import type { GhostId } from '../data/types';
import { buildCoverage, groupCoverageBySite, type GhostCoverage, type MissionCoverage } from '../model/coverage';
import { formatDate } from '../model/format';
import { GHOSTS, GHOST_ORDER } from '../model/ghosts';
import { SAMPLE_LABEL, isSample } from '../model/origin';
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
              {isSample(run) && ` (${SAMPLE_LABEL})`}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A requirement's plain title, with its full EARS text behind "Full requirement" and a link to its file. */
function MissionCell({ mission }: { mission: MissionCoverage }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div className={styles.missionBox}>
      <span className={styles.requirement}>{mission.title}</span>
      <span className={styles.links}>
        <ExpandButton open={open} controls={panelId} onToggle={() => setOpen(!open)} onClose={close} buttonRef={button}>
          Full requirement
        </ExpandButton>
        {mission.requirementLink && (
          <a href={mission.requirementLink}>
            Requirement file on GitHub<span className="visually-hidden"> for {mission.title}</span>
          </a>
        )}
      </span>
      <ExpandPanel id={panelId} open={open} label={`Full requirement: ${mission.title}`} placement="below" onClose={close}>
        <p>{mission.requirement}</p>
      </ExpandPanel>
      {mission.requirementChanged && (
        <span className={styles.changed}>
          The requirement text changed between runs. This row shows the text from the most recent run.
        </span>
      )}
    </div>
  );
}

export function CoverageScreen() {
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the missions" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;
  const sites = groupCoverageBySite(buildCoverage(state.runs));
  const missions = sites.flatMap((s) => s.rows);

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
          {sites.map((site) => (
            <tbody role="rowgroup" key={site.siteName} data-site={site.site}>
              <tr role="row">
                <th scope="rowgroup" role="rowheader" colSpan={1 + GHOST_ORDER.length} className={styles.siteRow}>
                  {site.site}
                </th>
              </tr>
              {site.rows.map((m) => (
                <tr key={`${m.siteName}:${m.missionId}`} role="row">
                  <th scope="row" role="rowheader" className={styles.mission}>
                    <MissionCell mission={m} />
                  </th>
                  {GHOST_ORDER.map((g) => (
                    <td key={g} role="cell" data-label={GHOSTS[g].name}>
                      <CoverageCell ghost={g} coverage={m.perGhost[g]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </>
  );
}
