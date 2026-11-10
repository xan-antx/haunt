// Home: the Hero with the tour, what the ghosts found (results first), how Haunt works, haunted
// sites with recent walks, and any restless files.

import { Link } from 'react-router-dom';
import { CandleButton } from '../components/CandleButton';
import { HeroGhosts } from '../components/HeroGhosts';
import { GhostBadge, GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ResultBadge } from '../components/ResultBadge';
import { runFilePath } from '../components/RunErrorPanel';
import { TOUR_START_ID, TOUR_UNAVAILABLE, useTour } from '../components/tour/Tour';
import { useAllRuns } from '../data/hooks';
import type { InvalidRun, Run } from '../data/types';
import { formatDate, plural } from '../model/format';
import { GHOST_ORDER, GHOSTS, moodFor, resultSentence } from '../model/ghosts';
import { outcomeLine } from '../model/outcome';
import { groupHaunts, recentRuns, type Haunt } from '../model/haunts';
import { resultHeadline, resultsHeading, watchStep } from '../model/results';
import { siteAbout } from '../model/sites';
import { buildTour } from '../model/tour';
import { graveyardPath, restlessPath, stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './HomeScreen.module.css';

function HauntCard({ haunt }: { haunt: Haunt }) {
  return (
    <li className={styles.card}>
      <article aria-labelledby={`haunt-${haunt.siteKey}`} className={styles.cardInner}>
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
                <GhostCharacter
                  ghost={summary.ghost}
                  size={80}
                  mood={moodFor(latest.result)}
                  floating
                />
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
          <Link to={graveyardPath({ site: haunt.siteKey, view: 'map' })} className={styles.mapLink}>
            Open the map of {haunt.siteName} in the Graveyard
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
                <GhostBadge ghost={run.ghost} mood={moodFor(run.result)} />
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

const HOW_STEPS = [
  'A ghost tries a real task on your site',
  'It records everything it sees and hears',
  'You see exactly where it got stuck',
  'You fix your code, and the next run shows if the problem is gone',
] as const;

/** One Result_Card: what happened to one ghost, in plain words, with one main action (Req 21.3–21.6). */
function ResultCard({ run }: { run: Run }) {
  const ghost = GHOSTS[run.ghost];
  const step = watchStep(run);
  const headingId = `result-${run.key}`;
  return (
    <li className={styles.resultCard}>
      <article aria-labelledby={headingId} className={styles.resultInner}>
        <GhostCharacter
          ghost={run.ghost}
          size={96}
          mood={moodFor(run.result)}
          className={styles.resultGhost}
        />
        <div className={styles.resultText}>
          <h3 id={headingId} className={styles.resultName}>
            {ghost.name}
          </h3>
          <p className={styles.resultTask}>Task: {run.mission.goal}</p>
          <p className={styles.resultHeadline}>{resultHeadline(run)}</p>
          <p className={styles.resultBadge}>
            <ResultBadge result={run.result} />
          </p>
          {step === null ? (
            <CandleButton lit={false} reason="This run has no steps, so there is nothing to watch.">
              Watch it happen
            </CandleButton>
          ) : (
            <CandleButton lit to={stepPath(run.key, step)} label={`Watch it happen: ${ghost.name} at step ${step}`}>
              Watch it happen
            </CandleButton>
          )}
        </div>
      </article>
    </li>
  );
}

/** Results_Section: one per Haunt, right after the Hero (Req 21.1, 21.2, 21.7). */
function Results({ haunt, first }: { haunt: Haunt; first: boolean }) {
  const headingId = `results-${haunt.siteKey}`;
  const about = siteAbout(haunt.siteName);
  return (
    <section aria-labelledby={headingId} className={styles.results} data-tour={first ? 'results' : undefined}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {resultsHeading(haunt.siteName)}
      </h2>
      {/* What the tested site is, for a first-time visitor (Req 21.9). */}
      {about && (
        <div className={styles.siteAbout}>
          <p className={styles.siteDescription}>{about.description}</p>
          {about.tryLink && (
            <p>
              <a href={about.tryLink.href}>{about.tryLink.label}</a>
            </p>
          )}
        </div>
      )}
      <ul className={styles.resultCards}>
        {haunt.ghosts.map((summary) => (
          <ResultCard key={summary.ghost} run={summary.latest} />
        ))}
      </ul>
    </section>
  );
}

/** How_It_Works_Strip (Req 20.7). */
function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className={styles.how}>
      <h2 id="how-heading" className={styles.sectionTitle}>
        How Haunt works
      </h2>
      <ol className={styles.howSteps}>
        {HOW_STEPS.map((text, i) => (
          <li key={text} className={styles.howStep}>
            <span className={styles.howNumber} aria-hidden="true">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RestlessFiles({ invalid }: { invalid: InvalidRun[] }) {
  if (invalid.length === 0) return null;
  return (
    <section aria-labelledby="restless-heading" className={styles.section}>
      <h2 id="restless-heading">Restless files</h2>
      <p>The dashboard can't read these run files, so it leaves them out of every screen.</p>
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
  const tour = useTour();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const { runs, invalid } = state;
  const haunts = groupHaunts(runs);
  const tourAvailable = buildTour(runs) !== null;

  return (
    <>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <ScreenHeading title="Home" className={styles.headline}>
              Haunt your app before your users do.
            </ScreenHeading>
            <ScreenIntro className={styles.tagline}>
              Haunt's ghost users try real tasks on your app, and this dashboard shows where each one got stuck.
            </ScreenIntro>
            <div className={styles.actions}>
              {tourAvailable ? (
                <CandleButton id={TOUR_START_ID} lit onClick={(event) => tour.start(runs, event.currentTarget)}>
                  Take the 60-second tour
                </CandleButton>
              ) : (
                <CandleButton id={TOUR_START_ID} lit={false} reason={TOUR_UNAVAILABLE}>
                  Take the 60-second tour
                </CandleButton>
              )}
              <CandleButton
                lit={false}
                reason="Coming soon. For now, this dashboard shows runs the ghosts already recorded."
              >
                Summon a live ghost
              </CandleButton>
            </div>
            {tourAvailable && (
              <p className={styles.tourNote}>
                The tour points out each part of the dashboard, and you can leave it at any time with Escape or Skip.
              </p>
            )}
          </div>
          <HeroGhosts />
        </div>
      </div>

      {/* Results first, right after the Hero (Req 7.28, 21.1). */}
      {haunts.map((haunt, i) => (
        <Results key={haunt.siteKey} haunt={haunt} first={i === 0} />
      ))}

      <HowItWorks />

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
