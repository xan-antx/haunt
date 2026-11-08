// Ghost Cam: a step-by-step replay of one run. The screenshot is on the left and what the
// ghost heard or thought is on the right. The URL always names the current step.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { GhostCharacter } from '../components/ghosts/Ghosts';
import { useAnnounce } from '../components/layout/LiveRegion';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ProvenancePanel } from '../components/ProvenancePanel';
import { ResultBadge } from '../components/ResultBadge';
import { RunErrorPanel } from '../components/RunErrorPanel';
import { Screenshot } from '../components/Screenshot';
import { useRun } from '../data/hooks';
import type { Finding, Run, Step } from '../data/types';
import { useApproximateVoice } from '../hooks/useApproximateVoice';
import { plainFindingType } from '../model/findingLabels';
import { formatSeconds } from '../model/format';
import { GHOSTS, gaveUpHere, resultSentence, stoppedHere } from '../model/ghosts';
import { homePath, parseStepParam, stepPath } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';
import { Controls, Timeline } from './ghostcam/Controls';
import { SpokenPanel, ThoughtPanel } from './ghostcam/Panels';
import styles from './ghostcam/GhostCam.module.css';

export const PLAYBACK_INTERVAL_MS = 1500;

/** #/run/:runKey → step 1, replacing the URL. */
export function RunRedirect() {
  const { runKey = '' } = useParams();
  return <Navigate to={stepPath(runKey, 1)} replace />;
}

function findingHeadline(run: Run, finding: Finding): string {
  const name = GHOSTS[run.ghost].name;
  if (run.ghost === 'listener' && finding.type === 'focus_trap') return `${name} got trapped here.`;
  return `${name} hit a problem here.`;
}

function FindingCallouts({ run, step, isLast }: { run: Run; step: Step; isLast: boolean }) {
  const findings = run.findings.filter((f) => f.step === step.n);
  const ended = isLast && (run.result === 'gave_up' || run.result === 'error');
  if (findings.length === 0 && !ended) return null;
  return (
    <div className={styles.callouts}>
      {ended && (
        <p className={styles.endCallout}>{run.result === 'gave_up' ? gaveUpHere(run.ghost) : stoppedHere(run.ghost)}</p>
      )}
      {findings.map((finding, i) => (
        <section key={i} className={styles.callout} aria-labelledby={`finding-${i}`}>
          <h2 id={`finding-${i}`} className={styles.calloutHeading}>
            {findingHeadline(run, finding)}
          </h2>
          <p className={styles.calloutType}>
            <svg className={styles.calloutIcon} viewBox="0 0 16 20" aria-hidden="true" focusable="false">
              <path d="M2 19 V8 a6 6 0 0 1 12 0 V19 Z" />
            </svg>
            {plainFindingType(finding.type)}
          </p>
          <p className={styles.calloutTitle}>{finding.title}</p>
          <p>{finding.evidence}</p>
        </section>
      ))}
    </div>
  );
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
  const last = run.steps[run.steps.length - 1]!;
  const atFirst = index === 0;
  const atLast = index === run.steps.length - 1;
  const ghost = GHOSTS[run.ghost];

  const goTo = useCallback(
    (target: number) => navigate(stepPath(run.key, target), { replace: true }),
    [navigate, run.key],
  );

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
  // is one grid area: summary, shot, panel, controls, timeline, rest.
  return (
    <div className={styles.cam}>
      <div className={`${styles.header} ${styles.summary}`} data-cam-area="summary">
        <GhostCharacter ghost={run.ghost} size={96} floating={playing} />
        <div className={styles.headerText}>
          <ScreenHeading title={`Step ${step.n} of ${run.steps.length} · ${ghost.name} · Ghost Cam`}>
            Ghost Cam: {ghost.name}
          </ScreenHeading>
          <p className={styles.ghostDescription}>{ghost.description}</p>
          <dl className={styles.mission}>
            <div>
              <dt>Mission</dt>
              <dd>{run.mission.goal}</dd>
            </div>
            <div>
              <dt>Requirement</dt>
              <dd>{run.mission.requirement}</dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd>{run.site.name}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd className={styles.result}>
                <ResultBadge result={run.result} /> <span>{resultSentence(run.ghost, run.result)}.</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

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
          <FindingCallouts run={run} step={step} isLast={step.n === last.n} />
        </div>
      </div>

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

        <h2 className={styles.sectionHeading}>Where this run came from</h2>
        <ProvenancePanel run={run} />
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
