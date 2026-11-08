// The Ghost Cam's right-hand panel: what The Listener heard, or what another ghost was thinking.

import { useEffect, useState } from 'react';
import type { GhostId, Step } from '../../data/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { GHOSTS } from '../../model/ghosts';
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

export function SpokenPanel({ step, playing }: { step: Step; playing: boolean }) {
  return (
    <section className={styles.spoken} aria-labelledby="spoken-heading">
      <h2 id="spoken-heading" className={styles.panelHeading}>
        What The Listener heard
      </h2>
      <p className={styles.spokenText}>
        <span aria-hidden="true">“</span>
        {step.spoken}
        <span aria-hidden="true">”</span>
      </p>
      <Waveform text={step.spoken} playing={playing} />
    </section>
  );
}

export function ThoughtPanel({ ghost, step }: { ghost: GhostId; step: Step }) {
  return (
    <section className={styles.thought} aria-labelledby="thought-heading">
      <h2 id="thought-heading" className={styles.panelHeading}>
        What {GHOSTS[ghost].name} was thinking
      </h2>
      <div className={styles.bubble}>
        <p className={styles.thoughtText}>{step.thought}</p>
      </div>
      <span className={styles.bubbleDotLarge} aria-hidden="true" />
      <span className={styles.bubbleDotSmall} aria-hidden="true" />
    </section>
  );
}
