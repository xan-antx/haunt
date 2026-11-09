// Séance: ask a ghost one of four fixed questions about its run. Answers are built only from
// the run file, in the ghost's first person, with step citations. No AI model or outside call.

import { useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { useAllRuns } from '../data/hooks';
import type { Run } from '../data/types';
import { byStartedAtDesc, formatDate } from '../model/format';
import { GHOSTS, RESULT_LABELS } from '../model/ghosts';
import { QUESTIONS, answer } from '../model/seance';
import { QUESTION_IDS, isQuestionId, seancePath, stepPath, type QuestionId } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';
import styles from './SeanceScreen.module.css';

const SEANCE_INTRO =
  'Pick a run and a question, and the ghost answers from what it recorded, linking each step it mentions.';

function runLabel(run: Run): string {
  return `${GHOSTS[run.ghost].name} · ${formatDate(run.startedAt)} · ${RESULT_LABELS[run.result]}`;
}

function AnswerPanel({ run, question }: { run: Run; question: QuestionId | null }) {
  const ghost = GHOSTS[run.ghost];
  return (
    <section className={styles.board} aria-live="polite" aria-labelledby="answer-heading">
      <h2 id="answer-heading" className={styles.boardHeading}>
        {question ? `${ghost.name} answers: ${QUESTIONS[question]}` : `${ghost.name} is listening`}
      </h2>
      {question ? (
        answer(run, question).paragraphs.map((paragraph, i) => (
          <p key={i} className={styles.line}>
            {paragraph.map((part, j) =>
              part.kind === 'text' ? (
                <span key={j}>{part.text}</span>
              ) : (
                <Link key={j} to={stepPath(run.key, part.step)}>
                  {part.capitalize ? 'Step' : 'step'} {part.step}
                </Link>
              ),
            )}
          </p>
        ))
      ) : (
        <p className={styles.line}>Choose a question to ask.</p>
      )}
    </section>
  );
}

export function SeanceScreen() {
  const { runKey, questionId } = useParams();
  const navigate = useNavigate();
  const selectId = useId();
  const state = useAllRuns();
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading what="the spirits" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const runs = [...state.runs].sort(byStartedAtDesc);
  if (runs.length === 0) {
    return (
      <>
        <ScreenHeading title="Séance">Séance</ScreenHeading>
        <ScreenIntro>{SEANCE_INTRO}</ScreenIntro>
        <p>No ghost has walked here yet, so there is no one to ask.</p>
      </>
    );
  }
  if (runKey !== undefined && !runs.some((r) => r.key === runKey)) return <UnknownRunScreen />;

  const question: QuestionId | null = isQuestionId(questionId) ? questionId : null;
  const selectedKey = runKey ?? pickedKey ?? runs[0]!.key;
  const run = runs.find((r) => r.key === selectedKey) ?? runs[0]!;
  const ghost = GHOSTS[run.ghost];

  const bySite = new Map<string, Run[]>();
  for (const r of runs) bySite.set(r.site.name, [...(bySite.get(r.site.name) ?? []), r]);

  const pickRun = (key: string) => {
    setPickedKey(key);
    if (question) navigate(seancePath(key, question), { replace: true });
    else if (runKey !== undefined) navigate(seancePath(), { replace: true });
  };

  return (
    <>
      <ScreenHeading title={`Séance · ${ghost.name}`}>Séance</ScreenHeading>
      <ScreenIntro>{SEANCE_INTRO}</ScreenIntro>

      <div className={styles.table}>
        <GhostCharacter ghost={run.ghost} size={110} labelled />
        <div className={styles.controls}>
          <div className={styles.picker}>
            <label htmlFor={selectId}>Run</label>
            <select id={selectId} className="select" value={run.key} onChange={(e) => pickRun(e.target.value)}>
              {[...bySite.entries()].map(([site, siteRuns]) => (
                <optgroup key={site} label={site}>
                  {siteRuns.map((r) => (
                    <option key={r.key} value={r.key}>
                      {runLabel(r)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div role="group" aria-label="Questions" className={styles.questions}>
            {QUESTION_IDS.map((q) => (
              <button
                key={q}
                type="button"
                className="button"
                aria-pressed={question === q}
                onClick={() => navigate(seancePath(run.key, q), { replace: question !== null })}
              >
                {QUESTIONS[q]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnswerPanel run={run} question={question} />
    </>
  );
}
