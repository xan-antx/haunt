// The Ask_Panel (Req 12): the Séance, folded into the Ghost Cam. The ghost answers four fixed
// questions from its own run file, in the first person, with each step it mentions as a link.
// No AI model or outside call. It sits on top of the right-hand panel area and does not trap focus.

import type { KeyboardEvent, RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { Run } from '../../data/types';
import { GHOSTS } from '../../model/ghosts';
import { QUESTIONS, answer } from '../../model/seance';
import { QUESTION_IDS, askPath, type QuestionId } from '../../routes';
import styles from './GhostCam.module.css';

export interface AskPanelProps {
  id: string;
  run: Run;
  question: QuestionId | null;
  onAsk: (question: QuestionId) => void;
  onClose: () => void;
  firstQuestionRef: RefObject<HTMLButtonElement>;
}

export function AskPanel({ id, run, question, onAsk, onClose, firstQuestionRef }: AskPanelProps) {
  const ghost = GHOSTS[run.ghost];
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <section id={id} className={styles.askPanel} aria-labelledby="ask-heading" onKeyDown={onKeyDown} data-ask-panel="">
      <div className={styles.askHead}>
        <h2 id="ask-heading" className={styles.askHeading}>
          Ask {ghost.name}
        </h2>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.askIntro}>
        {ghost.name} answers from what it recorded. Each step it mentions is a link.
      </p>
      <div role="group" aria-label="Questions" className={styles.askQuestions}>
        {QUESTION_IDS.map((q, i) => (
          <button
            key={q}
            ref={i === 0 ? firstQuestionRef : undefined}
            type="button"
            className="button"
            aria-pressed={question === q}
            onClick={() => onAsk(q)}
          >
            {QUESTIONS[q]}
          </button>
        ))}
      </div>
      <section className={styles.board} aria-live="polite" aria-labelledby="answer-heading">
        <h3 id="answer-heading" className={styles.boardHeading}>
          {question ? `${ghost.name} answers: ${QUESTIONS[question]}` : `${ghost.name} is listening`}
        </h3>
        {question ? (
          answer(run, question).paragraphs.map((paragraph, i) => (
            <p key={i} className={styles.answerLine}>
              {paragraph.map((part, j) =>
                part.kind === 'text' ? (
                  <span key={j}>{part.text}</span>
                ) : (
                  <Link key={j} replace to={askPath(run.key, part.step, question)}>
                    {part.capitalize ? 'Step' : 'step'} {part.step}
                  </Link>
                ),
              )}
            </p>
          ))
        ) : (
          <p className={styles.answerLine}>Choose a question to ask.</p>
        )}
      </section>
    </section>
  );
}
