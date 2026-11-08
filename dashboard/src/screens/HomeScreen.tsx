// Home: haunted sites, the "Start here" moment, and any restless files.

import { Link } from 'react-router-dom';
import { CandleButton } from '../components/CandleButton';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ResultBadge } from '../components/ResultBadge';
import { runFilePath } from '../components/RunErrorPanel';
import { useAllRuns } from '../data/hooks';
import type { InvalidRun } from '../data/types';
import { formatDate, plural } from '../model/format';
import { GHOSTS, resultSentence } from '../model/ghosts';
import { groupHaunts, startHereTarget, startHereUnavailableReason, type Haunt } from '../model/haunts';
import { mapPath, restlessPath, stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './HomeScreen.module.css';

function HauntCard({ haunt }: { haunt: Haunt }) {
  return (
    <li className={styles.card}>
      <article aria-labelledby={`haunt-${haunt.siteKey}`}>
        <h3 id={`haunt-${haunt.siteKey}`} className={styles.cardTitle}>
          {haunt.siteName}
        </h3>
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
                  <p className={styles.ghostResult}>
                    <span>{resultSentence(summary.ghost, latest.result)}.</span>{' '}
                    <ResultBadge result={latest.result} />
                  </p>
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
        <ScreenHeading title="Home" className={styles.title}>
          Haunt
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
        <section aria-labelledby="haunts-heading" className={styles.section}>
          <h2 id="haunts-heading" className="visually-hidden">
            Haunted sites
          </h2>
          <ul className={styles.cards}>
            {haunts.map((haunt) => (
              <HauntCard key={haunt.siteKey} haunt={haunt} />
            ))}
          </ul>
        </section>
      )}

      <RestlessFiles invalid={invalid} />
    </>
  );
}
