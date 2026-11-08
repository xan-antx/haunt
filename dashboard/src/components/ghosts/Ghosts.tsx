// Original inline SVG ghost characters and icons, drawn for this project.
// Each ghost has a distinct silhouette, so they can be told apart in greyscale.

import type { GhostId } from '../../data/types';
import { GHOSTS } from '../../model/ghosts';
import styles from './Ghosts.module.css';

export interface CharacterProps {
  /** Height in CSS px. */
  size?: number;
  /**
   * When the ghost's name is not shown beside the character, set this so the
   * character gets role="img" and the ghost's name as its accessible name.
   */
  labelled?: boolean;
  /** Gentle float. Only moves when the user's motion setting allows it. */
  floating?: boolean;
  className?: string;
}

function a11y(ghost: GhostId, labelled: boolean | undefined) {
  return labelled ? { role: 'img', 'aria-label': GHOSTS[ghost].name } : { 'aria-hidden': true as const };
}

function classes(ghost: GhostId, floating: boolean | undefined, extra: string | undefined): string {
  return [styles.character, styles[ghost], floating ? 'motion-float' : '', extra ?? ''].filter(Boolean).join(' ');
}

/** Tall, calm sheet ghost with eyes gently closed and three curved sound rings. */
export function ListenerGhost({ size = 120, labelled, floating, className }: CharacterProps) {
  return (
    <svg
      viewBox="0 0 130 160"
      width={(size * 130) / 160}
      height={size}
      className={classes('listener', floating, className)}
      focusable="false"
      {...a11y('listener', labelled)}
    >
      <path
        className={styles.body}
        d="M30 150 L30 62 C30 22 90 22 90 62 L90 150 L80 140 L70 150 L60 140 L50 150 L40 140 Z"
      />
      <path className={styles.face} d="M44 64 q6 6 12 0 M64 64 q6 6 12 0" />
      <path className={styles.face} d="M52 82 q8 5 16 0" />
      <path className={styles.accentStroke} d="M97 48 a14 14 0 0 1 0 24" />
      <path className={styles.accentStroke} d="M104 41 a24 24 0 0 1 0 38" />
      <path className={styles.accentStroke} d="M111 34 a34 34 0 0 1 0 52" />
    </svg>
  );
}

/** Short, wispy ghost with a tapering trail, holding an old flip phone, with a small hourglass. */
export function PhantomGhost({ size = 120, labelled, floating, className }: CharacterProps) {
  return (
    <svg
      viewBox="0 0 130 160"
      width={(size * 130) / 160}
      height={size}
      className={classes('phantom', floating, className)}
      focusable="false"
      {...a11y('phantom', labelled)}
    >
      <path
        className={styles.body}
        d="M36 80 C36 50 88 50 88 80 C88 102 82 116 68 126 C58 133 50 142 30 154 C42 138 46 128 42 116 C37 104 36 94 36 80 Z"
      />
      <circle className={styles.eye} cx="53" cy="78" r="4" />
      <circle className={styles.eye} cx="71" cy="78" r="4" />
      <path className={styles.face} d="M56 94 q6 -4 12 0" />
      {/* arm and flip phone */}
      <path className={styles.accentStroke} d="M84 98 q8 2 12 -4" />
      <rect className={styles.accentFill} x="94" y="76" width="14" height="12" rx="2" />
      <rect className={styles.accentFill} x="94" y="89" width="14" height="14" rx="2" />
      <path className={styles.face} d="M98 95 h6 M98 99 h6" />
      {/* small hourglass */}
      <path className={styles.accentStroke} d="M98 22 h16 M98 46 h16 M100 22 c0 7 12 7 12 12 s-12 5 -12 12 M112 22 c0 7 -12 7 -12 12 s12 5 12 12" />
    </svg>
  );
}

/** Round, friendly ghost with large reading glasses and a speech bubble showing "अ ਅ". */
export function BebeGhost({ size = 120, labelled, floating, className }: CharacterProps) {
  return (
    <svg
      viewBox="0 0 130 160"
      width={(size * 130) / 160}
      height={size}
      className={classes('bebe', floating, className)}
      focusable="false"
      {...a11y('bebe', labelled)}
    >
      <path
        className={styles.body}
        d="M14 100 a44 44 0 0 1 88 0 v34 q-7.33 10 -14.67 0 q-7.33 10 -14.67 0 q-7.33 10 -14.67 0 q-7.33 10 -14.67 0 q-7.33 10 -14.67 0 q-7.33 10 -14.67 0 Z"
      />
      <circle className={styles.accentStroke} cx="44" cy="96" r="12" />
      <circle className={styles.accentStroke} cx="72" cy="96" r="12" />
      <path className={styles.accentStroke} d="M56 95 h4" />
      <circle className={styles.eye} cx="44" cy="97" r="3.5" />
      <circle className={styles.eye} cx="72" cy="97" r="3.5" />
      <path className={styles.face} d="M50 116 q8 6 16 0" />
      {/* speech bubble */}
      <path className={styles.bubble} d="M70 8 h52 a6 6 0 0 1 6 6 v22 a6 6 0 0 1 -6 6 h-34 l-10 10 l1 -10 h-9 a6 6 0 0 1 -6 -6 v-22 a6 6 0 0 1 6 -6 Z" />
      <text className={styles.bubbleText} x="96" y="31" textAnchor="middle">
        अ ਅ
      </text>
    </svg>
  );
}

export function GhostCharacter({ ghost, ...props }: CharacterProps & { ghost: GhostId }) {
  switch (ghost) {
    case 'listener':
      return <ListenerGhost {...props} />;
    case 'phantom':
      return <PhantomGhost {...props} />;
    case 'bebe':
      return <BebeGhost {...props} />;
  }
}

/** Small icon: ear with sound waves, hourglass, or magnifying glass. Always decorative; show the name beside it. */
export function GhostIcon({ ghost, className, onBone }: { ghost: GhostId; className?: string; onBone?: boolean }) {
  const cls = [styles.icon, styles[ghost], onBone ? styles.onBone : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden="true" focusable="false">
      {ghost === 'listener' && (
        <>
          <path d="M4 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" />
          <path d="M7 10a2 2 0 0 1 4 0c0 1.5-2 2-2 3.5" />
          <path d="M17 7a5 5 0 0 1 0 6" />
          <path d="M20 4.5a9 9 0 0 1 0 11" />
        </>
      )}
      {ghost === 'phantom' && (
        <path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" />
      )}
      {ghost === 'bebe' && (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5 L20 20" />
        </>
      )}
    </svg>
  );
}

/** Icon plus the ghost's name, in the ghost's accent. */
export function GhostBadge({ ghost, className, onBone }: { ghost: GhostId; className?: string; onBone?: boolean }) {
  const cls = [styles.badge, styles[ghost], onBone ? styles.onBone : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      <GhostIcon ghost={ghost} onBone={onBone} />
      <span>{GHOSTS[ghost].name}</span>
    </span>
  );
}
