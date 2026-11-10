// Ghost Cam: a step-by-step replay of one run. The screenshot is on the left and what the
// ghost heard or thought is on the right. The URL always names the current step.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { useAnnounce } from '../components/layout/LiveRegion';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ProvenancePanel } from '../components/ProvenancePanel';
import { ResultBadge } from '../components/ResultBadge';
import { RunErrorPanel } from '../components/RunErrorPanel';
import { ScreenIcon } from '../components/ScreenIcon';
import { Screenshot } from '../components/Screenshot';
import { StuckNotice } from '../components/StuckNotice';
import { useRun } from '../data/hooks';
import type { Run, Step } from '../data/types';
import { useApproximateVoice } from '../hooks/useApproximateVoice';
import { formatSeconds } from '../model/format';
import { GHOSTS, RESULT_LABELS, resultSentence } from '../model/ghosts';
import { askPath, homePath, parseAsk, parseStepParam, stepPath, type QuestionId } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';
import { AskPanel } from './ghostcam/AskPanel';
import { Controls, Timeline } from './ghostcam/Controls';
import { SpokenPanel, ThoughtPanel } from './ghostcam/Panels';
import styles from './ghostcam/GhostCam.module.css';

export const PLAYBACK_INTERVAL_MS = 1500;

/** #/run/:runKey → step 1, replacing the URL. */
export function RunRedirect() {
  const { runKey = '' } = useParams();
  return <Navigate to={stepPath(runKey, 1)} replace />;
}

function VoiceToggle({ step }: { step: Step }) {
  const voice = useApproximateVoice();
  const [enabled, setEnabled] = useState(false);
  const { speak, cancel } = voice;

  useEffect(() => {
    if (enabled && voice.available) speak(step.spoken);
  }, [enabled, voice.available, speak, step.n, step.spoken]);

  const toggle = () => {
    if (!voice.available) return;
    if (enabled) cancel();
    setEnabled(!enabled);
  };

  return (
    <div className={styles.voice}>
      <button
        type="button"
        className="button"
        aria-pressed={voice.available ? enabled : undefined}
        aria-disabled={voice.available ? undefined : 'true'}
        aria-describedby="voice-note"
        onClick={toggle}
      >
        Read aloud (approximation)
      </button>
      <p id="voice-note" className={styles.voiceNote}>
        This uses your browser's built-in voice. It is an approximation, not real screen reader output.
        {!voice.available && <> Unavailable: {voice.reason}</>}
      </p>
    </div>
  );
}

function GhostCam({ run, n }: { run: Run; n: number }) {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [playing, setPlaying] = useState(false);
  const index = run.steps.findIndex((s) => s.n === n);
  const step = run.steps[index]!;
  const first = run.steps[0]!;
  const atFirst = index === 0;
  const atLast = index === run.steps.length - 1;
  const ghost = GHOSTS[run.ghost];

  // Ask_Panel state lives in the URL (Req 6.2, 12.2).
  const [search] = useSearchParams();
  const ask = parseAsk(search.get('ask'));
  const askParam = ask.open ? (ask.question ?? 'open') : null;
  const askPanelId = useId();
  const askButton = useRef<HTMLButtonElement>(null);
  const firstQuestion = useRef<HTMLButtonElement>(null);
  const focusPanelOnOpen = useRef(false);

  // Every step move keeps the Ask_Panel as it is (Req 12.12).
  const goTo = useCallback(
    (target: number) => navigate(askPath(run.key, target, askParam), { replace: true }),
    [navigate, run.key, askParam],
  );

  const openAsk = () => {
    focusPanelOnOpen.current = true;
    navigate(askPath(run.key, n, 'open'), { replace: true });
  };
  const closeAsk = () => {
    navigate(stepPath(run.key, n), { replace: true });
    askButton.current?.focus();
  };
  const chooseQuestion = (question: QuestionId) => navigate(askPath(run.key, n, question), { replace: true });

  // Opening with the Ask_Button moves focus to the first question (Req 12.11).
  useEffect(() => {
    if (ask.open && focusPanelOnOpen.current) {
      focusPanelOnOpen.current = false;
      firstQuestion.current?.focus();
    }
  }, [ask.open]);

  // Set when Play is pressed on the last step, so playback restarts from the first step.
  const restarting = useRef(false);

  // Advance every 1500 ms while playing; pause at the last step.
  useEffect(() => {
    if (!playing) return;
    if (atLast) {
      if (!restarting.current) setPlaying(false);
      return;
    }
    restarting.current = false;
    const next = run.steps[index + 1]!.n;
    const id = window.setTimeout(() => goTo(next), PLAYBACK_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [playing, atLast, index, run.steps, goTo]);

  // Stop when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setPlaying(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Announce step changes politely, without moving focus.
  const announcedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = `${run.key}:${step.n}`;
    if (announcedFor.current !== null && announcedFor.current !== id) {
      // Only the new step; Earlier_Lines in the Transcript are never re-announced.
      const listener = run.ghost === 'listener';
      const text = listener ? step.spoken : step.thought;
      const said = typeof text === 'string' && text.trim() !== '' ? text : `nothing was ${listener ? 'spoken' : 'thought'}`;
      announce(`Step ${step.n}: ${said}`);
    }
    announcedFor.current = id;
  }, [announce, run.key, run.ghost, step.n, step.spoken, step.thought]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else {
      if (atLast && !atFirst) {
        restarting.current = true;
        goTo(first.n);
      }
      setPlaying(true);
    }
  };

  // DOM order is the reading order at every size (Req 10.26). Each direct child of `.cam`
  // is one grid area: summary, shot, panel, notice, controls, timeline, rest.
  return (
    <div className={styles.cam}>
      <div className={`${styles.header} ${styles.summary}`} data-cam-area="summary">
        <GhostCharacter ghost={run.ghost} size={96} floating={playing} />
        <div className={styles.headerText}>
          {/* Row 1: ghost name and mission goal. The hidden prefix keeps "Ghost Cam" in the
              heading's accessible name. */}
          <ScreenHeading
            title={`Step ${step.n} of ${run.steps.length} · ${ghost.name} · Ghost Cam`}
            className={styles.summaryRow}
            tooltip={`${ghost.name}: ${run.mission.goal}`}
          >
            <span className="visually-hidden">Ghost Cam: </span>
            {ghost.name}: <span>{run.mission.goal}</span>
          </ScreenHeading>
          {/* Screen_Intro (Req 20.13, 20.14): one plain sentence, never ellipsised. */}
          <ScreenIntro className={styles.camIntro}>
            Ghost Cam replays this visit one step at a time, showing each page next to what{' '}
            {run.ghost === 'listener' ? `${ghost.name} heard` : `${ghost.name} was thinking`}.
          </ScreenIntro>
          {/* Row 2: the requirement (ellipsised) and then the result, which is never cut off. */}
          <p
            className={`${styles.summaryRow} ${styles.requirementRow}`}
            title={`Requirement: ${run.mission.requirement} ${RESULT_LABELS[run.result]} ${resultSentence(run.ghost, run.result)}.`}
          >
            <span className={styles.requirementText}>
              Requirement: <span>{run.mission.requirement}</span>
            </span>{' '}
            <span className={styles.result}>
              <ResultBadge result={run.result} /> <span>{resultSentence(run.ghost, run.result)}.</span>
            </span>
          </p>
          {/* Stacked mode only. */}
          <p className={styles.ghostDescription}>{ghost.description}</p>
          <p className={styles.siteLine}>Site: {run.site.name}</p>
        </div>
        <button
          ref={askButton}
          type="button"
          className={`button ${styles.askButton}`}
          aria-expanded={ask.open}
          aria-controls={ask.open ? askPanelId : undefined}
          onClick={ask.open ? closeAsk : openAsk}
        >
          <ScreenIcon screen="seance" className={styles.askIcon} />
          Ask this ghost
        </button>
      </div>

      {/* The Ask_Panel overlays the panel area, so opening it moves nothing (Req 12.10). */}
      {ask.open && (
        <AskPanel
          id={askPanelId}
          run={run}
          question={ask.question}
          onAsk={chooseQuestion}
          onClose={closeAsk}
          firstQuestionRef={firstQuestion}
        />
      )}

      <div className={styles.left} data-cam-area="shot">
        <Screenshot run={run} step={step} />
      </div>

      <div className={styles.right} data-cam-area="panel">
        <div className={styles.rightInner}>
          {run.ghost === 'listener' ? (
            <SpokenPanel run={run} step={step} playing={playing} />
          ) : (
            <ThoughtPanel run={run} step={step} />
          )}
        </div>
      </div>

      <StuckNotice run={run} step={step} />

      <div className={styles.controlsArea} data-cam-area="controls">
        <p className={styles.stepInfo}>
          <strong>
            Step {step.n} of {run.steps.length}
          </strong>
          <span aria-hidden="true"> · </span>
          <span>{step.page}</span>
          <span aria-hidden="true"> · </span>
          <span>{step.action}</span>
          <span aria-hidden="true"> · </span>
          <span>waited {formatSeconds(step.waitMs)}</span>
          {playing && (
            <>
              <span aria-hidden="true"> · </span>
              <span>Playing</span>
            </>
          )}
        </p>

        <Controls
          playing={playing}
          atFirst={atFirst}
          atLast={atLast}
          onTogglePlay={togglePlay}
          onBack={() => {
            setPlaying(false);
            goTo(run.steps[index - 1]!.n);
          }}
          onForward={() => {
            setPlaying(false);
            goTo(run.steps[index + 1]!.n);
          }}
        />

        {run.ghost === 'listener' && <VoiceToggle step={step} />}
      </div>

      <div className={styles.timelineArea} data-cam-area="timeline">
        <Timeline
          steps={run.steps}
          findings={run.findings}
          current={step.n}
          onSelect={(target) => {
            setPlaying(false);
            goTo(target);
          }}
        />
      </div>

      {/* Provenance_Panel stays after the Timeline (Req 10.25). */}
      <div className={styles.rest} data-cam-area="rest">
        {run.warnings.length > 0 && (
          <details className={styles.warnings}>
            <summary>Notes about this run file ({run.warnings.length})</summary>
            <ul>
              {run.warnings.map((w, i) => (
                <li key={i}>
                  <code>{w.path}</code>: {w.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        <ProvenancePanel run={run} collapsible />
      </div>
    </div>
  );
}

function StepOutOfRange({ run }: { run: Run }) {
  const first = run.steps[0]!.n;
  const last = run.steps[run.steps.length - 1]!.n;
  return (
    <>
      <ScreenHeading title={`Step not found · ${GHOSTS[run.ghost].name} · Ghost Cam`}>
        That step isn't in this run
      </ScreenHeading>
      <p>
        This run has steps {first} to {last}.
      </p>
      <p>
        <Link to={stepPath(run.key, first)}>Go to step {first}</Link>
      </p>
    </>
  );
}

export function GhostCamScreen() {
  const { runKey, n: nParam } = useParams();
  const state = useRun(runKey);
  const n = parseStepParam(nParam);

  switch (state.status) {
    case 'loading':
      return <Loading what="the ghost" />;
    case 'error':
      return <IndexErrorScreen message={state.message} />;
    case 'not_found':
      return <UnknownRunScreen />;
    case 'invalid':
      return (
        <>
          <ScreenHeading title="Restless file · Ghost Cam">This run file is restless</ScreenHeading>
          <RunErrorPanel invalid={state.invalid} />
          <p>
            <Link to={homePath()}>Go back to Home</Link>
          </p>
        </>
      );
    case 'ready': {
      const { run } = state;
      if (!run.steps.some((s) => s.n === n)) return <StepOutOfRange run={run} />;
      return <GhostCam key={run.key} run={run} n={n} />;
    }
  }
}
