// Home: the Hero with the tour, what the ghosts found (results first), how Haunt works, haunted
// sites with recent walks, and any restless files.

import { Link } from 'react-router-dom';
import { CandleButton } from '../components/CandleButton';
import { HeroGhosts } from '../components/HeroGhosts';
import { GhostBadge, GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ResultBadge } from '../components/ResultBadge';
import { SummonGhost } from '../components/SummonGhost';
import { runFilePath } from '../components/RunErrorPanel';
import { MindTag } from '../components/MindTag';
import { OwnSiteCard } from '../components/OwnSiteCard';
import { AI_MIND_LABEL, isAiRun } from '../model/mind';
import { SampleTag } from '../components/SampleTag';
import { TOUR_START_ID, TOUR_UNAVAILABLE, useTour } from '../components/tour/Tour';
import { useAllRuns } from '../data/hooks';
import type { InvalidRun, Run } from '../data/types';
import { formatDate, plural } from '../model/format';
import { GHOST_ORDER, GHOSTS, moodFor, resultSentence } from '../model/ghosts';
import { SAMPLE_LABEL, isSample } from '../model/origin';
import { outcomeLine } from '../model/outcome';
import { originalSiteRuns } from '../model/fixedCopy';
import { groupHaunts, recentRuns, type Haunt } from '../model/haunts';
import { resultHeadline, resultsHeading, watchStep } from '../model/results';
import { displayGoal, displayName, siteAbout, siteLabel } from '../model/sites';
import { buildTour } from '../model/tour';
import { realWorldRuns, withoutRealWorld } from '../model/realWorld';
import { PLANTED_SITE, plantedStory, type PlantedStory } from '../model/planted';
import { repoFileUrl } from '../model/repo';
import { exorcisePath, graveyardPath, realWorldPath, restlessPath, siteKey, stepPath } from '../routes';
import { IndexErrorScreen } from './common';
import styles from './HomeScreen.module.css';

function HauntCard({ haunt }: { haunt: Haunt }) {
  return (
    <li className={styles.card}>
      <article aria-labelledby={`haunt-${haunt.siteKey}`} className={styles.cardInner}>
        <h2 id={`haunt-${haunt.siteKey}`} className={styles.cardTitle}>
          {displayName(haunt.siteName)}
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
                    <SampleTag run={latest} />
                    <MindTag run={latest} />
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
                              {isSample(run) && ` (${SAMPLE_LABEL})`}
                              {isAiRun(run) && ` (${AI_MIND_LABEL})`}
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
            Open the map of {displayName(haunt.siteName)} in the Graveyard
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
                <GhostBadge ghost={run.ghost} mood={moodFor(run.result)} /> <SampleTag run={run} /> <MindTag run={run} />
              </p>
              <p className={styles.meta}>
                <span>{siteLabel(run.site.name)}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={run.startedAt}>{date}</time>
              </p>
              <p>{outcomeLine(run)}</p>
              <p>
                <Link to={stepPath(run.key, 1)}>
                  Watch {name} in the Ghost Cam
                  <span className="visually-hidden">
                    {' '}
                    ({siteLabel(run.site.name)}, {date}
                    {isSample(run) && `, ${SAMPLE_LABEL}`})
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
          <p className={styles.resultTask}>Task: {displayGoal(run.mission)}</p>
          <p className={styles.resultHeadline}>{resultHeadline(run)}</p>
          <p className={styles.resultBadge}>
            <ResultBadge result={run.result} /> <SampleTag run={run} /> <MindTag run={run} />
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
/** The planted-problems story, in numbers that come from the run files (UI-17). */
function PlantedLine({ story }: { story: PlantedStory }) {
  const exorcisedEvidence = story.statuses.find((s) => s.exorcised)?.exorcised ?? null;
  const missed = story.notFound.map((p) => p.title);
  return (
    <p className={styles.plantedLine} data-testid="planted-line">
      <a href={repoFileUrl('.kiro/steering/demo-site.md')}>{story.planted} problems</a> were planted in Lantern Bills.
      The ghosts found{' '}
      <Link to={graveyardPath({ site: siteKey(PLANTED_SITE) })}>
        {story.found} of {story.planted}
      </Link>
      .{' '}
      {exorcisedEvidence ? (
        <>
          The fix exorcised{' '}
          <Link to={exorcisePath(exorcisedEvidence.before.key, exorcisedEvidence.after.key)}>
            {story.found > 1 && story.exorcised === story.found
              ? `all ${story.found}`
              : `${story.exorcised} of those ${story.found}`}
          </Link>
          .
        </>
      ) : (
        <>The fix has not been checked against any of them yet.</>
      )}
      {missed.length > 0 && (
        <>
          {' '}
          No ghost has reached {missed.join(' or ')}.
          {story.notFound.some((p) => p.id === 'card-errors') && (
            <> The mission pays with a valid card, so no card error ever appears.</>
          )}
        </>
      )}
    </p>
  );
}

function Results({ haunt, first, story }: { haunt: Haunt; first: boolean; story: PlantedStory | null }) {
  const headingId = `results-${haunt.siteKey}`;
  const about = siteAbout(haunt.siteName);
  return (
    <section aria-labelledby={headingId} className={styles.results}>
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
      {/* The tour's first stop highlights the cards, not the whole section: the section with the
          site sentence is taller than the room a short window leaves beside a callout. */}
      <ul className={styles.resultCards} data-tour={first ? 'results' : undefined}>
        {haunt.ghosts.map((summary) => (
          <ResultCard key={summary.ghost} run={summary.latest} />
        ))}
      </ul>
      {story && haunt.siteName === PLANTED_SITE && <PlantedLine story={story} />}
    </section>
  );
}

/** How_It_Works_Strip (Req 20.7). */
/** Three quiet cards where the result cards will be, the same height, so Home does not jump (UI-08). */
function ResultsSkeleton() {
  return (
    <section aria-labelledby="results-skeleton-heading" className={styles.results} aria-busy="true">
      <h2 id="results-skeleton-heading" className={styles.sectionTitle}>
        What the ghosts found
      </h2>
      <p role="status" className="muted">
        Summoning the runs…
      </p>
      <ul className={styles.resultCards} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.resultCard} ${styles.skeletonCard}`} />
        ))}
      </ul>
    </section>
  );
}

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
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;
  // While the runs load, the hero, the ghosts and How Haunt works are already on screen, and the
  // result cards hold their place with a quiet skeleton, so nothing jumps when the runs arrive (UI-08).
  const loading = state.status === 'loading';
  const runs = state.status === 'ready' ? state.runs : [];
  const invalid = state.status === 'ready' ? state.invalid : [];
  // Real-world runs (Memos) have their own screen, so the haunted sites and recent walks leave them out.
  const homeRuns = withoutRealWorld(runs);
  const hasRealWorld = realWorldRuns(runs).length > 0;
  const haunts = groupHaunts(homeRuns);
  // Results and their cards use only the original sites' runs. A fixed copy is its own site below.
  const resultHaunts = groupHaunts(originalSiteRuns(runs));
  const tourAvailable = buildTour(runs) !== null;
  const story = plantedStory(runs);

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
              {loading ? (
                <CandleButton id={TOUR_START_ID} lit={false} reason="The tour starts as soon as the runs have loaded.">
                  Take the 60-second tour
                </CandleButton>
              ) : tourAvailable ? (
                <CandleButton id={TOUR_START_ID} lit onClick={(event) => tour.start(runs, event.currentTarget)}>
                  Take the 60-second tour
                </CandleButton>
              ) : (
                <CandleButton id={TOUR_START_ID} lit={false} reason={TOUR_UNAVAILABLE}>
                  Take the 60-second tour
                </CandleButton>
              )}
              <SummonGhost />
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
      {loading && <ResultsSkeleton />}
      {resultHaunts.map((haunt, i) => (
        <Results key={haunt.siteKey} haunt={haunt} first={i === 0} story={story} />
      ))}

      <HowItWorks />

      <OwnSiteCard />

      {/* DOM order is reading and tab order: cards, then the side panel (Req 7.13, 18.1). */}
      <div className={styles.body}>
        {loading ? null : haunts.length === 0 ? (
          <section className="panel" aria-labelledby="empty-heading">
            <h2 id="empty-heading">No ghosts have walked here yet</h2>
            <p>This room is empty. Once a ghost has visited a site, what it found appears here.</p>
            <p>
              To send ghosts through a site of your own, read the <a href={repoFileUrl('README.md')}>README on GitHub</a>.
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
        {homeRuns.length > 0 && <RecentWalks runs={homeRuns} />}
      </div>

      {hasRealWorld && (
        <p className={styles.realWorldLink}>
          <Link to={realWorldPath()}>See the real-world haunt on Memos</Link>
        </p>
      )}

      <RestlessFiles invalid={invalid} />
    </>
  );
}
