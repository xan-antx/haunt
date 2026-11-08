// Home: haunted sites, the "Start here" moment, and any restless files.

import { Link } from 'react-router-dom';
import { CandleButton } from '../components/CandleButton';
import { HeroGhosts } from '../components/HeroGhosts';
import { GhostBadge, GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ResultBadge } from '../components/ResultBadge';
import { runFilePath } from '../components/RunErrorPanel';
import { useAllRuns } from '../data/hooks';
import type { InvalidRun, Run } from '../data/types';
import { formatDate, plural } from '../model/format';
import { GHOST_ORDER, GHOSTS, resultSentence } from '../model/ghosts';
import { outcomeLine } from '../model/outcome';
import {
  groupHaunts,
  recentRuns,
  startHereTarget,
  startHereUnavailableReason,
  type Haunt,
} from '../model/haunts';
import { mapPath, restlessPath, stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './HomeScreen.module.css';

function HauntCard({ haunt }: { haunt: Haunt }) {
  return (
    <li className={styles.card}>
      <article aria-labelledby={`haunt-${haunt.siteKey}`}>
        <h2 id={`haunt-${haunt.siteKey}`} className={styles.cardTitle}>
          {haunt.siteName}
        </h2>
        <p className={styles.meta}>
          <span>
            Last haunted <time dateTime={haunt.latestStartedAt}>{formatDate(haunt.latestStartedAt)}</time>
          </span>
          <span aria-hidden="true"> · </span>
          <span>{plural(haunt.findingCount, 'finding')}</span>
        </p>
        <ul className={styles.ghosts}>
          {haunt.ghosts.map((summary) => {
            const ghost = GHOSTS[summary.ghost];
            const latest = summary.latest;
            const earlier = summary.runs.slice(1);
            return (
              <li key={summary.ghost} className={styles.ghostRow}>
                <GhostCharacter ghost={summary.ghost} size={72} floating />
                <div className={styles.ghostText}>
                  <p className={styles.ghostName}>{ghost.name}</p>
                  <div className={styles.ghostResult}>
                    <p className={styles.outcome}>{outcomeLine(latest)}</p>
                    <ResultBadge result={latest.result} />
                  </div>
                  <p>
                    <Link to={stepPath(latest.key, 1)}>Watch {ghost.name} in the Ghost Cam</Link>
                  </p>
                  {earlier.length > 0 && (
                    <details>
                      <summary>{plural(earlier.length, 'earlier run')}</summary>
                      <ul>
                        {earlier.map((run) => (
                          <li key={run.key}>
                            <Link to={stepPath(run.key, 1)}>
                              {formatDate(run.startedAt)}: {resultSentence(run.ghost, run.result)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p>
          <Link to={mapPath(haunt.siteKey)} className={styles.mapLink}>
            Open the Haunted Map of {haunt.siteName}
          </Link>
        </p>
      </article>
    </li>
  );
}

function RecentWalks({ runs }: { runs: Run[] }) {
  const recent = recentRuns(runs, 6);
  return (
    <aside aria-labelledby="recent-heading" className={styles.recent}>
      <h2 id="recent-heading" className={styles.recentTitle}>
        Recent ghost walks
      </h2>
      <ul className={styles.recentList}>
        {recent.map((run) => {
          const name = GHOSTS[run.ghost].name;
          const date = formatDate(run.startedAt);
          return (
            <li key={run.key} className={styles.recentItem}>
              <p className={styles.recentGhost}>
                <GhostBadge ghost={run.ghost} />
              </p>
              <p className={styles.meta}>
                <span>{run.site.name}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={run.startedAt}>{date}</time>
              </p>
              <p>{outcomeLine(run)}</p>
              <p>
                <Link to={stepPath(run.key, 1)}>
                  Watch {name} in the Ghost Cam
                  <span className="visually-hidden">
                    {' '}
                    ({run.site.name}, {date})
                  </span>
                </Link>
              </p>
            </li>
          );
        })}
      </ul>
      <h3 className={styles.countsTitle}>Runs per ghost</h3>
      <ul className={styles.counts}>
        {GHOST_ORDER.map((ghost) => (
          <li key={ghost}>
            {GHOSTS[ghost].name}: {plural(runs.filter((r) => r.ghost === ghost).length, 'run')}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function RestlessFiles({ invalid }: { invalid: InvalidRun[] }) {
  if (invalid.length === 0) return null;
  return (
    <section aria-labelledby="restless-heading" className={styles.section}>
      <h2 id="restless-heading">Restless files</h2>
      <p>These run files could not be read, so they are left out of every screen.</p>
      <ul>
        {invalid.map((item) => (
          <li key={item.key}>
            <code>{runFilePath(item.folder)}</code>:{' '}
            <Link to={restlessPath(item.key)}>see {plural(item.errors.length, 'problem')} with this file</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeScreen() {
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const { runs, invalid } = state;
  const haunts = groupHaunts(runs);
  const start = startHereTarget(runs);

  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <ScreenHeading title="Home" className={styles.headline}>
              Haunt your app before your users do.
            </ScreenHeading>
            <p className={styles.tagline}>
              Three ghost users tried to get things done on our sites. Here is where they got stuck.
            </p>
            <div className={styles.actions}>
              {start ? (
                <CandleButton lit to={stepPath(start.runKey, start.step)}>
                  Start here
                </CandleButton>
              ) : (
                <CandleButton lit={false} reason={startHereUnavailableReason(runs)}>
                  Start here
                </CandleButton>
              )}
              <CandleButton lit={false} reason="Coming soon: live ghosts are not connected yet">
                Summon a live ghost
              </CandleButton>
            </div>
          </div>
          <HeroGhosts />
        </div>
      </div>

      {/* DOM order is reading and tab order: cards, then the side panel (Req 7.13, 18.1). */}
      <div className={styles.body}>
        {haunts.length === 0 ? (
          <section className="panel" aria-labelledby="empty-heading">
            <h2 id="empty-heading">No ghosts have walked here yet</h2>
            <p>
              Run files go in the <code>runs/</code> folder at the top of the project. Each run is a folder with a{' '}
              <code>run.json</code> file and its screenshots, at any depth (for example{' '}
              <code>runs/samples/listener-gave-up/run.json</code>).
            </p>
            <p>
              Then run <code>npm run dev</code> in <code>dashboard/</code> again to collect them.
            </p>
          </section>
        ) : (
          <section aria-label="Haunted sites" className={styles.sites}>
            <ul className={styles.cards}>
              {haunts.map((haunt) => (
                <HauntCard key={haunt.siteKey} haunt={haunt} />
              ))}
            </ul>
          </section>
        )}
        {runs.length > 0 && <RecentWalks runs={runs} />}
      </div>

      <RestlessFiles invalid={invalid} />
    </>
  );
}
