// Ghost Cam: a step-by-step replay of one run. The screenshot is on the left and what the
// ghost heard or thought is on the right. The URL always names the current step.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { useAnnounce } from '../components/layout/LiveRegion';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ExpandButton, ExpandPanel } from '../components/Expand';
import { ProvenancePanel } from '../components/ProvenancePanel';
import { ResultBadge } from '../components/ResultBadge';
import { RunErrorPanel } from '../components/RunErrorPanel';
import { MindTag } from '../components/MindTag';
import { SampleTag } from '../components/SampleTag';
import { ScreenIcon } from '../components/ScreenIcon';
import { Screenshot } from '../components/Screenshot';
import { runHasNotices, StuckNotice } from '../components/StuckNotice';
import { useRun } from '../data/hooks';
import type { Run, Step } from '../data/types';
import { useApproximateVoice } from '../hooks/useApproximateVoice';
import { formatSeconds } from '../model/format';
import { GHOSTS, moodFor, RESULT_LABELS, resultSentence } from '../model/ghosts';
import { displayGoal, pageName, plainAction, requirementTitle, siteLabel } from '../model/sites';
import { nothingAnnounced } from '../model/transcript';
import { askPath, homePath, parseAsk, parseStepParam, stepPath, type QuestionId } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';
import { AskPanel } from './ghostcam/AskPanel';
import { Controls, Timeline } from './ghostcam/Controls';
import { SpokenPanel, ThoughtPanel, ThoughtsStrip } from './ghostcam/Panels';
import styles from './ghostcam/GhostCam.module.css';

export const PLAYBACK_INTERVAL_MS = 1500;
export const FULL_REQUIREMENT = 'Full requirement';

/** #/run/:runKey → step 1, replacing the URL. */
export function RunRedirect() {
  const { runKey = '' } = useParams();
  return <Navigate to={stepPath(runKey, 1)} replace />;
}

/** True when a key press at `target` belongs to a field or a control, not to the page. */
export function isControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'button, a[href], input, select, textarea, summary, [contenteditable], [role="button"], [role="tab"], [role="slider"], [tabindex]:not([tabindex="-1"])',
    ) !== null
  );
}

/**
 * Things that use the arrow keys themselves: a text field, a select, and the regions marked
 * `data-keys="own"` (the scrolling thought strip, the Ask panel, an open "Full requirement" panel and
 * the Reproduce command box). The button of an open panel (`aria-expanded="true"`, which is where focus
 * stays after a mouse click opens the panel) belongs to that panel until it is closed.
 */
const OWN_ARROWS =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [data-keys="own"], [aria-expanded="true"]';

/**
 * True when Left or Right at `target` should step the run (R2-06). That is when nothing has focus,
 * or focus is anywhere inside the Ghost Cam, including on its buttons and timeline marks (a mouse
 * click leaves focus on the button it clicked), except in something that uses the arrow keys itself.
 */
export function arrowsStep(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target === document.body || target === document.documentElement) return true;
  if (!target.closest('[data-ghost-cam]')) return false;
  return target.closest(OWN_ARROWS) === null;
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

  // Two siblings of the Control_Row: the button joins the row, and the note takes a full line
  // under the whole row, so the button lines up with the playback buttons.
  return (
    <>
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
      </div>
      <p id="voice-note" className={styles.voiceNote}>
        This uses your browser's built-in voice. It is an approximation, not real screen reader output.
        {!voice.available && <> Unavailable: {voice.reason}</>}
      </p>
    </>
  );
}

function GhostCam({ run, n, announceOnOpen }: { run: Run; n: number; announceOnOpen: boolean }) {
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

  // "Full requirement" (Req 10.29): closed when the Ghost Cam opens.
  const [requirementOpen, setRequirementOpen] = useState(false);
  const requirementPanelId = useId();
  const requirementButton = useRef<HTMLButtonElement>(null);
  const closeRequirement = () => {
    setRequirementOpen(false);
    requirementButton.current?.focus();
  };
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
  const openedBySwitch = useRef(announceOnOpen);
  useEffect(() => {
    const id = `${run.key}:${step.n}`;
    const first = announcedFor.current === null;
    if (announcedFor.current !== id && (!first || openedBySwitch.current)) {
      // Only the new step; Earlier_Lines in the Transcript are never re-announced.
      const listener = run.ghost === 'listener';
      const text = listener ? step.spoken : step.thought;
      const said = typeof text === 'string' && text.trim() !== '' ? text : nothingAnnounced(run.ghost);
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

  // Keyboard shortcuts (UI-15, R2-06). Left and Right step wherever focus is inside the Ghost Cam,
  // so they still work after a mouse click on one of its buttons, except in a text field, a select,
  // the scrolling thought strip or an open panel. Space plays and pauses only when focus is not on
  // a control, so a focused button keeps its own Space.
  const stepBack = () => {
    if (atFirst) return;
    setPlaying(false);
    goTo(run.steps[index - 1]!.n);
  };
  const stepForward = () => {
    if (atLast) return;
    setPlaying(false);
    goTo(run.steps[index + 1]!.n);
  };
  const shortcut = useRef({ stepBack, stepForward, togglePlay });
  shortcut.current = { stepBack, stepForward, togglePlay };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== ' ') return;
      const arrow = event.key !== ' ';
      if (arrow ? !arrowsStep(event.target) : isControl(event.target)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') shortcut.current.stepBack();
      else if (event.key === 'ArrowRight') shortcut.current.stepForward();
      else shortcut.current.togglePlay();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // DOM order is the reading order at every size (Req 10.26). Each direct child of `.cam`
  // is one grid area: summary, shot, panel, notice, controls, timeline, rest.
  return (
    <div
      className={styles.cam}
      data-ghost-cam=""
      data-notices={runHasNotices(run) ? 'some' : 'none'}
      data-thoughts={run.ghost === 'listener' ? 'under' : 'none'}
    >
      <div className={`${styles.header} ${styles.summary}`} data-cam-area="summary">
        <GhostCharacter
          ghost={run.ghost}
          size={96}
          mood={moodFor(run.result)}
          floating={playing}
          lively={playing}
        />
        <div className={styles.headerText}>
          {/* Row 1: ghost name and mission goal. The hidden prefix keeps "Ghost Cam" in the
              heading's accessible name. */}
          <ScreenHeading
            title={`Step ${step.n} of ${run.steps.length} · ${ghost.name} · Ghost Cam`}
            className={styles.summaryRow}
            tooltip={`${ghost.name}: ${displayGoal(run.mission)}`}
          >
            <span className="visually-hidden">Ghost Cam: </span>
            {ghost.name}: <span>{displayGoal(run.mission)}</span>
          </ScreenHeading>
          {/* Screen_Intro (Req 20.13, 20.14): one plain sentence, never ellipsised. */}
          <ScreenIntro className={styles.camIntro}>
            Ghost Cam replays this visit one step at a time, showing each page next to what{' '}
            {run.ghost === 'listener' ? `${ghost.name} heard` : `${ghost.name} was thinking`}.
          </ScreenIntro>
          {/* Row 2: the requirement on one ellipsised line with "Full requirement" to expand it
              (Req 10.29), the Sample_Label for a sample (Req 24.2), then the result, which is
              never cut off. The full text opens over the screenshot, so nothing moves. */}
          <div className={styles.requirementWrap}>
            <p
              className={`${styles.summaryRow} ${styles.requirementRow}`}
              title={`Requirement: ${requirementTitle(run.mission)} ${RESULT_LABELS[run.result]} ${resultSentence(run.ghost, run.result)}.`}
            >
              <span className={styles.requirementText}>
                Requirement: <span>{requirementTitle(run.mission)}</span>
              </span>{' '}
              <ExpandButton
                open={requirementOpen}
                controls={requirementPanelId}
                onToggle={() => setRequirementOpen(!requirementOpen)}
                onClose={closeRequirement}
                buttonRef={requirementButton}
              >
                {FULL_REQUIREMENT}
              </ExpandButton>{' '}
              <SampleTag run={run} /> <MindTag run={run} />{' '}
              <span className={styles.result}>
                <ResultBadge result={run.result} /> <span>{resultSentence(run.ghost, run.result)}.</span>
              </span>
            </p>
            <ExpandPanel
              id={requirementPanelId}
              open={requirementOpen}
              label={FULL_REQUIREMENT}
              placement="below"
              onClose={closeRequirement}
              onDismiss={() => setRequirementOpen(false)}
            >
              <p>
                <strong>Requirement:</strong> {run.mission.requirement}
              </p>
            </ExpandPanel>
          </div>
          {/* Stacked mode only. */}
          <p className={styles.ghostDescription}>{ghost.description}</p>
          <p className={styles.siteLine}>Site: {siteLabel(run.site.name)}</p>
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
        {/* Under the screenshot, so the thought sits next to the page it is about (UI-01). */}
        {run.ghost === 'listener' && <ThoughtsStrip key={step.n} run={run} step={step} />}
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

      {/* Keyed by step, so "Full details" closes when the step changes. */}
      <StuckNotice key={step.n} run={run} step={step} />

      <div className={styles.controlsArea} data-cam-area="controls">
        <p className={styles.stepInfo}>
          <strong>
            Step {step.n} of {run.steps.length}
          </strong>
          <span aria-hidden="true"> · </span>
          <span>{pageName(run.site.name, step.page).replace(/^the /, 'The ')}</span>
          <span aria-hidden="true"> · </span>
          <span>{plainAction(run.site.name, step.action)}</span>
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
          onBack={stepBack}
          onForward={stepForward}
        />

        {run.ghost === 'listener' && <VoiceToggle step={step} />}

        <p className={styles.shortcutHint} data-testid="shortcut-hint">
          Keys: <kbd>←</kbd> <kbd>→</kbd> step (not in a text box or an open panel). <kbd>Space</kbd> plays or pauses when no
          button has focus.
        </p>
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

  // The run this screen last showed. The screen stays mounted when the address changes from one
  // run to another, so this tells a switch from a first visit.
  const switchedFrom = useRef<string | null>(null);
  const shownKey = state.status === 'ready' && state.run.key === runKey ? state.run.key : null;
  useEffect(() => {
    if (shownKey !== null) switchedFrom.current = shownKey;
  }, [shownKey]);

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
      // A run the Ghost Cam opens after showing another one announces its first step (R2-05).
      return <GhostCam key={run.key} run={run} n={n} announceOnOpen={switchedFrom.current !== null && switchedFrom.current !== run.key} />;
    }
  }
}
