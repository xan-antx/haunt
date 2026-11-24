// The real-world screen: Haunt's visits to Memos, an open-source site that Haunt did not build.
// It shows up to two result cards, one for each mind (scripted and AI), and keeps them apart from
// the Lantern Bills results.

import { MindTag } from '../components/MindTag';
import { CandleButton } from '../components/CandleButton';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ResultBadge } from '../components/ResultBadge';
import { useAllRuns } from '../data/hooks';
import type { Run } from '../data/types';
import { plainFindingType } from '../model/findingLabels';
import { plural } from '../model/format';
import { ghostName, moodFor } from '../model/ghosts';
import { latestPerMind } from '../model/realWorld';
import { resultHeadline, watchStep } from '../model/results';
import { siteAbout } from '../model/sites';
import { stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './RealWorldScreen.module.css';

const MIND_NAMES = { scripted: 'Scripted mind', ai: 'AI mind' } as const;

function RealWorldCard({ run }: { run: Run }) {
  const headingId = `real-world-${run.key}`;
  const step = watchStep(run);
  const name = ghostName(run.ghost);
  return (
    <li className={styles.card}>
      <article aria-labelledby={headingId} className={styles.cardInner}>
        <GhostCharacter ghost={run.ghost} size={96} mood={moodFor(run.result)} className={styles.ghost} />
        <div className={styles.cardText}>
          <h3 id={headingId} className={styles.cardName}>
            {name} <span className={styles.mind}>({MIND_NAMES[run.mind]})</span>
          </h3>
          <p className={styles.headline}>{resultHeadline(run)}</p>
          <p className={styles.badges}>
            <ResultBadge result={run.result} /> <MindTag run={run} />
          </p>
          <p className={styles.steps}>{plural(run.steps.length, 'step')} walked.</p>
          {run.findings.length === 0 ? (
            <p>No problems were found.</p>
          ) : (
            <ul className={styles.findings} aria-label="Problems found">
              {run.findings.map((finding) => (
                <li key={`${finding.type}-${finding.step}`} className={styles.finding}>
                  <span aria-hidden="true" className={styles.marker}>
                    ✦
                  </span>{' '}
                  <strong>{plainFindingType(finding.type)}:</strong> {finding.title} (step {finding.step})
                </li>
              ))}
            </ul>
          )}
          {step === null ? (
            <CandleButton lit={false} reason="This run has no steps, so there is nothing to watch.">
              Watch it happen
            </CandleButton>
          ) : (
            <CandleButton lit to={stepPath(run.key, step)} label={`Watch it happen: ${name} at step ${step}`}>
              Watch it happen
            </CandleButton>
          )}
        </div>
      </article>
    </li>
  );
}

export function RealWorldScreen() {
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const cards = latestPerMind(state.runs);
  const about = siteAbout('Memos');

  return (
    <>
      <ScreenHeading title="A real-world haunt">A real-world haunt</ScreenHeading>
      <ScreenIntro>The Listener visits Memos, a note-taking site that other people built.</ScreenIntro>
      <section aria-labelledby="real-world-about" className="panel">
        <h2 id="real-world-about">About Memos</h2>
        <p>
          {about?.description ??
            'Memos is an open-source site that Haunt did not build. Haunt runs its own copy on this computer.'}
        </p>
      </section>
      <section aria-labelledby="real-world-results" className={styles.results}>
        <h2 id="real-world-results">What The Listener found on Memos</h2>
        {cards.length === 0 ? (
          <p>
            No Memos run exists yet. Start Memos at <code>http://localhost:5230</code>, then run The Listener on it from
            the <code>engine/</code> folder.
          </p>
        ) : (
          <ul className={styles.cards}>
            {cards.map((run) => (
              <RealWorldCard key={run.key} run={run} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
