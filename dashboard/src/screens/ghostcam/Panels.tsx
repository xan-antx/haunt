// The Ghost Cam's right-hand panel: what The Listener heard, or what another ghost was thinking.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Run, Step } from '../../data/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { scrollKeys, useScrollOverflow } from '../../hooks/useScrollOverflow';
import { GHOSTS } from '../../model/ghosts';
import { buildTranscript } from '../../model/transcript';
import { waveformBars } from '../../model/waveform';
import styles from './GhostCam.module.css';

const FRAMES = 4;

/** 32 bars from the spoken text. Moves every 300 ms only while playing and when motion is allowed. */
export function Waveform({ text, playing }: { text: string; playing: boolean }) {
  const reduced = useReducedMotion();
  const animate = playing && !reduced;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (!animate) return;
    const id = window.setInterval(() => setFrame((f) => (f % FRAMES) + 1), 300);
    return () => window.clearInterval(id);
  }, [animate, text]);

  const bars = waveformBars(text, 32, animate ? frame : 0);
  return (
    <div className={styles.waveform} aria-hidden="true" data-testid="waveform" data-animating={animate}>
      {bars.map((h, i) => (
        <span key={i} className={`${styles.bar} motion-waveform-bar`} style={{ height: `${Math.round(h * 100)}%` }} />
      ))}
    </div>
  );
}

/**
 * One line per step from step 1 to the current step, with the Current_Line last.
 * Scrolls inside itself to keep the Current_Line at the bottom, without moving focus
 * or scrolling the page. Focusable only while its lines overflow. Not a live region:
 * the Ghost Cam announces only the new step.
 */
export function Transcript({ run, step }: { run: Run; step: Step }) {
  const scroller = useRef<HTMLDivElement>(null);
  const overflowing = useScrollOverflow(scroller, 'y');
  const listener = run.ghost === 'listener';
  const lines = buildTranscript(run, step.n);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [step.n]);

  return (
    <div
      ref={scroller}
      className={`${styles.transcript} ${listener ? styles.spokenLines : styles.thoughtLines}`}
      role="region"
      aria-label={listener ? 'Spoken transcript' : 'Thought transcript'}
      tabIndex={overflowing ? 0 : undefined}
      onKeyDown={scrollKeys('y')}
      data-testid="transcript"
    >
      <ol className={styles.lines}>
        {lines.map((line) => (
          <li
            key={line.n}
            className={`${styles.line} ${styles[`fade${line.fade}`]}`}
            aria-current={line.current ? 'step' : undefined}
            data-current={line.current || undefined}
            data-fade={line.fade}
          >
            <span className={styles.lineStep}>Step {line.n}</span>{' '}
            <span className={line.empty ? styles.emptyText : undefined}>{line.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SpokenPanel({ run, step, playing }: { run: Run; step: Step; playing: boolean }) {
  return (
    <section className={styles.spoken} aria-labelledby="spoken-heading">
      <h2 id="spoken-heading" className={styles.panelHeading}>
        What The Listener heard
      </h2>
      <Transcript run={run} step={step} />
      <Waveform text={step.spoken} playing={playing} />
    </section>
  );
}

export function ThoughtPanel({ run, step }: { run: Run; step: Step }) {
  return (
    <section className={styles.thought} aria-labelledby="thought-heading">
      <h2 id="thought-heading" className={styles.panelHeading}>
        What {GHOSTS[run.ghost].name} was thinking
      </h2>
      <div className={styles.bubble}>
        <Transcript run={run} step={step} />
      </div>
      <span className={styles.bubbleDotLarge} aria-hidden="true" />
      <span className={styles.bubbleDotSmall} aria-hidden="true" />
    </section>
  );
}
