// Original inline SVG ghost characters and icons, drawn for this project.
// Shared style: a --spectral body with an accent outline, --bg ink for faces and prop outlines,
// one outline weight per variant (--line in Ghosts.module.css) and a soft accent glow. The simple
// variant is the same drawing with less fine detail and heavier lines, not a different character.
// Each ghost is told apart by shape and props, not color: The Listener is tall with big
// headphones, The Phantom dissolves into square pixels and holds an old phone, and Bebe is short
// and round in a chunni and thick round glasses.

import type { ReactElement } from 'react';
import type { GhostId } from '../../data/types';
import { characterLabel, GHOSTS, type GhostMood } from '../../model/ghosts';
import styles from './Ghosts.module.css';

/** "detailed" for everything larger than 32 px; "simple" only for chips and sizes of 32 px or smaller. */
export type CharacterVariant = 'detailed' | 'simple';

export interface CharacterProps {
  /** Height in CSS px. Defaults to 120 for "detailed" and 32 for "simple". */
  size?: number;
  variant?: CharacterVariant;
  /** "stuck" when the ghost's run gave up. Defaults to "hopeful". */
  mood?: GhostMood;
  /**
   * When the ghost's name is not shown beside the character, set this so the
   * character gets role="img" and a label that starts with the ghost's name.
   */
  labelled?: boolean;
  /** Gentle float. Only moves when the user's motion setting allows it. */
  floating?: boolean;
  /**
   * Small character motions (sound waves, flicker, spinner, foot tap, bubble bob) on the
   * detailed variant while hopeful. Only moves when the user's motion setting allows it.
   */
  lively?: boolean;
  className?: string;
}

type Drawing = (props: { stuck: boolean }) => ReactElement;

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

/* ------------------------------------------------------------------------------------------ */
/* The Listener: tall and slim, big over-ear headphones, eyes closed, a hand cupped by its ear. */

const ListenerDetailed: Drawing = ({ stuck }) => (
  <>
    {stuck ? (
      // The sound waves tangle into a knot.
      <path
        className={styles.line}
        d="M23 56 C16 46 4 50 7 60 C10 70 22 68 19 59 C16 51 4 58 8 67 C12 76 22 73 20 66 C18 61 8 70 5 80"
      />
    ) : (
      <g>
        <path className={cx(styles.line, styles.wave)} d="M19.64 56.64 A9 9 0 0 0 19.64 69.36" />
        <path className={cx(styles.line, styles.wave, styles.wave2)} d="M15.39 52.39 A15 15 0 0 0 15.39 73.61" />
        <path className={cx(styles.line, styles.wave, styles.wave3)} d="M11.15 48.15 A21 21 0 0 0 11.15 77.85" />
      </g>
    )}
    <path
      className={styles.body}
      d="M38 150 V58 C38 26 86 26 86 58 V150 q-6 8 -12 0 q-6 8 -12 0 q-6 8 -12 0 q-6 8 -12 0 Z"
    />
    {/* Arm up to a hand cupped beside the right ear cup. */}
    <path className={styles.limbOutline} strokeWidth={11} d="M86 106 C98 104 104 94 105 80" />
    <path className={styles.limbFill} strokeWidth={5} d="M80 106 C98 104 104 94 105 80" />
    {/* Headphones: band, then the two big ear cups with cushions. */}
    <path className={styles.bandOutline} strokeWidth={10} d="M32 60 C30 20 94 20 92 60" />
    <path className={styles.band} strokeWidth={4} d="M32 60 C30 20 94 20 92 60" />
    <rect className={styles.prop} x="23" y="49" width="17" height="28" rx="7" />
    <rect className={styles.prop} x="84" y="49" width="17" height="28" rx="7" />
    <path className={styles.fine} d="M29 56 v14 M95 56 v14" />
    <ellipse className={styles.body} cx="107" cy="70" rx="7" ry="10" transform="rotate(-10 107 70)" />
    <path className={styles.fine} d="M104 63 q-3 7 0 14" />
    {stuck ? (
      <>
        <path className={styles.ink} d="M47 61 q5 5 10 0" />
        <path className={styles.ink} d="M47 53 q5 -1 10 0" />
        <circle className={styles.inkFill} cx="72" cy="62" r="3.6" />
        <path className={styles.ink} d="M66 51 q6 -7 12 -2" />
        <path className={styles.ink} d="M55 75 q3.5 -3 7 0 q3.5 3 7 0" />
      </>
    ) : (
      <>
        <path className={styles.ink} d="M47 60 q5 5 10 0 M67 60 q5 5 10 0" />
        <path className={styles.ink} d="M56 73 q6 5 12 0" />
      </>
    )}
  </>
);

// The simple drawings below use the same 130 × 160 frame as the detailed ones and copy their
// silhouette, props and faces. Only fine detail is dropped, and thin parts are drawn heavier so
// they still read at 32 px (see ".simple" in Ghosts.module.css).

const ListenerSimple: Drawing = ({ stuck }) => (
  <>
    {stuck ? (
      // The sound waves tangle into a knot.
      <path className={styles.accentFine} d="M23 56 C14 46 4 52 8 62 C12 72 22 68 18 60 C14 54 5 62 9 72" />
    ) : (
      <g>
        <path className={styles.accentFine} d="M20.34 57.34 A8 8 0 0 0 20.34 68.66" />
        <path className={styles.accentFine} d="M13.98 50.98 A17 17 0 0 0 13.98 75.02" />
      </g>
    )}
    <path
      className={styles.body}
      d="M38 150 V58 C38 26 86 26 86 58 V150 q-6 8 -12 0 q-6 8 -12 0 q-6 8 -12 0 q-6 8 -12 0 Z"
    />
    {/* Arm up to a hand cupped beside the right ear cup. */}
    <path className={styles.limbOutline} strokeWidth={14} d="M86 106 C98 104 104 94 105 80" />
    <path className={styles.limbFill} strokeWidth={6} d="M80 106 C98 104 104 94 105 80" />
    <path className={styles.bandOutline} strokeWidth={13} d="M32 60 C30 20 94 20 92 60" />
    <path className={styles.band} strokeWidth={8} d="M32 60 C30 20 94 20 92 60" />
    <rect className={styles.prop} x="21" y="47" width="21" height="32" rx="8" />
    <rect className={styles.prop} x="82" y="47" width="21" height="32" rx="8" />
    <ellipse className={styles.body} cx="107" cy="70" rx="8" ry="11" transform="rotate(-10 107 70)" />
    {stuck ? (
      <>
        <path className={styles.fine} d="M47 61 q5 5 10 0" />
        <circle className={styles.inkFill} cx="72" cy="62" r="4.6" />
        <path className={styles.fine} d="M66 51 q6 -7 12 -2" />
        <path className={styles.fine} d="M55 75 q3.5 -3 7 0 q3.5 3 7 0" />
      </>
    ) : (
      <>
        <path className={styles.fine} d="M47 60 q5 5 10 0 M67 60 q5 5 10 0" />
        <path className={styles.fine} d="M56 73 q6 5 12 0" />
      </>
    )}
  </>
);

/* ------------------------------------------------------------------------------------------ */
/* The Phantom: wispy, flickery, dissolving into square pixels, an old phone and an hourglass. */

const PIXELS: ReadonlyArray<readonly [number, number, number]> = [
  [36, 116, 7],
  [50, 118, 6],
  [64, 117, 7],
  [44, 128, 6],
  [58, 127, 5],
  [70, 131, 4],
  [38, 138, 5],
  [52, 140, 4],
  [64, 139, 4],
  [46, 148, 3],
];

const PhantomDetailed: Drawing = ({ stuck }) => (
  <g className={cx(stuck && styles.faded)}>
    <g className={styles.flicker}>
      {/* A wisp of smoke on top of the head. */}
      <path className={styles.line} d="M58 43 c-3 -7 5 -9 3 -16" />
      <path
        className={cx(styles.body, stuck && styles.dashed)}
        d="M34 68 C34 34 82 34 82 68 V106 H76 V112 H70 V106 H64 V114 H58 V108 H52 V112 H46 V104 H40 V110 H34 Z"
      />
      {/* Shifted slices, like a video that is still buffering. */}
      <rect className={styles.glitch} x="79" y="74" width="11" height="4" />
      <rect className={styles.glitch} x="27" y="91" width="10" height="4" />
      {PIXELS.map(([x, y, s]) => (
        <rect key={`${x}-${y}`} className={styles.accentFill} x={x} y={y} width={s} height={s} />
      ))}
      {/* One foot, tapping. */}
      <path className={styles.limbOutline} strokeWidth={9} d="M76 106 V117" />
      <path className={styles.limbFill} strokeWidth={3} d="M76 100 V117" />
      <ellipse className={cx(styles.body, styles.foot)} cx="82" cy="119" rx="8" ry="4.5" />
      {!stuck && <path className={styles.fine} d="M93 111 l4 -3 M94 118 h5" />}
      {stuck ? (
        <>
          <path className={styles.ink} d="M47 65 h10 M63 65 h10" />
          <path className={styles.ink} d="M54 79 h10" />
        </>
      ) : (
        <>
          <circle className={styles.inkFill} cx="52" cy="64" r="4.5" />
          <circle className={styles.inkFill} cx="68" cy="64" r="4.5" />
          <circle className={styles.shine} cx="53.6" cy="62.4" r="1.4" />
          <circle className={styles.shine} cx="69.6" cy="62.4" r="1.4" />
          <path className={styles.ink} d="M46 54 q5 -3 10 -1 M64 53 q5 -2 10 1" />
          <path className={styles.ink} d="M54 78 q5 3 10 0" />
        </>
      )}
    </g>
    {/* Arm and the cracked old phone: antenna, one signal bar and a loading spinner. */}
    <path className={styles.limbOutline} strokeWidth={11} d="M82 88 C87 90 90 90 92 89" />
    <path className={styles.limbFill} strokeWidth={5} d="M78 88 C87 90 90 90 92 89" />
    <rect className={styles.prop} x="103" y="48" width="4" height="10" rx="1.5" />
    <rect className={styles.prop} x="88" y="56" width="24" height="40" rx="5" />
    <rect className={styles.screen} x="92" y="61" width="16" height="18" rx="2" />
    <path className={styles.crack} d="M93 62 l5 5 l-2 3 l5 4 l2 4" />
    <rect className={styles.screenFill} x="94" y="74.5" width="2.5" height="3" />
    <path className={cx(styles.screenLine, styles.spinner)} d="M101 65 a4 4 0 1 1 -4 4" />
    <circle className={styles.inkFill} cx="100" cy="85" r="1.6" />
    <circle className={styles.inkFill} cx="106" cy="85" r="1.6" />
    <circle className={styles.inkFill} cx="100" cy="90" r="1.6" />
    <circle className={styles.inkFill} cx="106" cy="90" r="1.6" />
    <ellipse className={styles.body} cx="91" cy="88" rx="6" ry="7" />
    {/* Small hourglass beside the phone. */}
    <path
      className={styles.line}
      d="M113 101 h14 M113 125 h14 M115 101 C115 109 120 111 120 113 C120 115 115 117 115 125 M125 101 C125 109 120 111 120 113 C120 115 125 117 125 125"
    />
    <path className={styles.accentFill} d="M117 105 h6 l-3 4.5 Z M116.5 123.5 L120 118.5 L123.5 123.5 Z" />
  </g>
);

const PhantomSimple: Drawing = ({ stuck }) => (
  <g className={cx(stuck && styles.faded)}>
    <g className={styles.flicker}>
      <path className={styles.accentFine} d="M58 43 c-3 -7 5 -9 3 -16" />
      <path
        className={cx(styles.body, stuck && styles.dashed)}
        d="M34 68 C34 34 82 34 82 68 V104 H72 V114 H60 V104 H48 V114 H34 Z"
      />
      <rect className={styles.glitch} x="79" y="73" width="13" height="6" />
      <rect className={styles.glitch} x="25" y="90" width="12" height="6" />
      <rect className={styles.accentFill} x="34" y="119" width="9" height="9" />
      <rect className={styles.accentFill} x="49" y="122" width="8" height="8" />
      <rect className={styles.accentFill} x="64" y="119" width="9" height="9" />
      <rect className={styles.accentFill} x="41" y="134" width="7" height="7" />
      <rect className={styles.accentFill} x="57" y="135" width="6" height="6" />
      {/* One foot. */}
      <path className={styles.limbOutline} strokeWidth={14} d="M76 104 V117" />
      <path className={styles.limbFill} strokeWidth={6} d="M76 100 V117" />
      <ellipse className={styles.body} cx="82" cy="119" rx="9" ry="5.5" />
      {stuck ? (
        <>
          <path className={styles.fine} d="M47 65 h10 M63 65 h10" />
          <path className={styles.fine} d="M54 79 h10" />
        </>
      ) : (
        <>
          <circle className={styles.inkFill} cx="52" cy="64" r="6" />
          <circle className={styles.inkFill} cx="68" cy="64" r="6" />
          <path className={styles.fine} d="M46 54 q5 -3 10 -1 M64 53 q5 -2 10 1" />
          <path className={styles.fine} d="M54 78 q5 3 10 0" />
        </>
      )}
    </g>
    {/* Arm and the old phone: antenna, one signal bar, a loading spinner and a crack. */}
    <path className={styles.limbOutline} strokeWidth={14} d="M82 88 C87 90 90 90 92 89" />
    <path className={styles.limbFill} strokeWidth={6} d="M78 88 C87 90 90 90 92 89" />
    <path className={styles.accentFine} d="M105 57 V43" />
    <rect className={styles.prop} x="88" y="56" width="24" height="40" rx="5" />
    <rect className={styles.screen} x="93" y="61" width="14" height="17" rx="2" />
    <path className={styles.crack} d="M94 62 l4 4 l-2 3 l4 4 l2 4" />
    <rect className={styles.screenFill} x="94" y="72" width="3.5" height="5" />
    <path className={cx(styles.screenLine, styles.spinner)} d="M101 65 a4 4 0 1 1 -4 4" />
    <circle className={styles.inkFill} cx="99" cy="84" r="2" />
    <circle className={styles.inkFill} cx="105" cy="84" r="2" />
    <circle className={styles.inkFill} cx="99" cy="89.5" r="2" />
    <circle className={styles.inkFill} cx="105" cy="89.5" r="2" />
    <ellipse className={styles.body} cx="91" cy="88" rx="7.5" ry="8.5" />
    {/* Small hourglass beside the phone. */}
    <path className={styles.accentFine} d="M115 102 h12 l-6 11 l6 11 h-12 l6 -11 Z" />
  </g>
);

/* ------------------------------------------------------------------------------------------ */
/* Bebe: short and round, chunni and shawl, thick round glasses, phone held at arm's length.  */

const BebeDetailed: Drawing = ({ stuck }) => (
  <>
    <path
      className={styles.body}
      d="M20 112 C20 60 96 60 96 112 V146 q-9.5 9 -19 0 q-9.5 9 -19 0 q-9.5 9 -19 0 q-9.5 9 -19 0 Z"
    />
    {/* Chunni draped over her head, framing her face. */}
    <path
      className={styles.prop}
      d="M14 124 C10 52 106 52 102 124 C100 128 94 128 92 124 C94 66 22 66 24 124 C22 128 16 128 14 124 Z"
    />
    <path className={styles.trim} d="M19 120 C16 60 100 60 97 120" />
    {/* Arm reaching out, from under the shawl. */}
    <path className={styles.limbOutline} strokeWidth={11} d="M86 128 C100 124 108 114 112 102" />
    <path className={styles.limbFill} strokeWidth={5} d="M86 128 C100 124 108 114 112 102" />
    {/* Small shawl over her shoulders, with a row of phulkari-style diamonds. */}
    <path className={styles.shawl} d="M14 120 C34 132 82 132 102 120 L100 132 C82 146 34 146 16 132 Z" />
    <path
      className={styles.accentFill}
      d="M34 128 l3 3 l-3 3 l-3 -3 Z M46 130.5 l3 3 l-3 3 l-3 -3 Z M58 132.5 l3 3 l-3 3 l-3 -3 Z M70 130.5 l3 3 l-3 3 l-3 -3 Z M82 128 l3 3 l-3 3 l-3 -3 Z"
    />
    <ellipse className={styles.blush} cx="38" cy="113" rx="5.5" ry="3.5" />
    <ellipse className={styles.blush} cx="78" cy="113" rx="5.5" ry="3.5" />
    {stuck ? (
      <>
        {/* Glasses slid down her nose; she peers over them. */}
        <path className={styles.fine} d="M58 99 q3 4 0 7" />
        <circle className={styles.inkFill} cx="47" cy="96" r="3.6" />
        <circle className={styles.inkFill} cx="69" cy="96" r="3.6" />
        <circle className={styles.shine} cx="48.3" cy="94.7" r="1.2" />
        <circle className={styles.shine} cx="70.3" cy="94.7" r="1.2" />
        <path className={styles.fine} d="M43 90 q4 -2.5 8 0 M65 90 q4 -2.5 8 0" />
        <circle className={styles.lens} cx="47" cy="107" r="7.5" />
        <circle className={styles.lens} cx="69" cy="107" r="7.5" />
        <path className={styles.lens} d="M54.5 106 q3.5 -2.5 7 0" />
        <path className={styles.ink} d="M53 119 q5 -2.5 10 0" />
      </>
    ) : (
      <>
        <path className={styles.fine} d="M58 101 q3 4 0 7" />
        {/* Smile wrinkles at the corners of her eyes. */}
        <path className={styles.fine} d="M33 96 l-4 -2 M33 103 l-4 2 M83 96 l4 -2 M83 103 l4 2" />
        {/* Squinting at the phone. */}
        <path className={styles.ink} d="M42 101 q5 -4 10 0 M64 101 q5 -4 10 0" />
        <circle className={styles.lens} cx="47" cy="100" r="10" />
        <circle className={styles.lens} cx="69" cy="100" r="10" />
        <path className={styles.lens} d="M57 99 q1 -1.5 2 0" />
        <path className={styles.glint} d="M50 93.5 a6 6 0 0 1 3 3 M72 93.5 a6 6 0 0 1 3 3" />
        <path className={styles.ink} d="M50 114 q8 7 16 0" />
      </>
    )}
    {/* Phone at arm's length, with large text on screen. */}
    <rect className={styles.prop} x="108" y="76" width="16" height="26" rx="3" />
    <rect className={styles.screen} x="111" y="80" width="10" height="15" rx="1.5" />
    <path className={styles.screenLine} d="M113 84 h6 M113 88 h5 M113 92 h6" />
    <ellipse className={styles.body} cx="112" cy="101" rx="6" ry="5.5" />
    {/* A tiny Gurmukhi speech bubble: "ਹਾਂ ਜੀ" (yes, dear), or "ਕੀ?" (what?) when stuck. */}
    <g className={styles.bubbleGroup}>
      <path
        className={styles.bubble}
        d="M46 24 h32 a12 12 0 0 1 12 12 v6 a12 12 0 0 1 -12 12 h-18 l-10 9 l1 -9 h-5 a12 12 0 0 1 -12 -12 v-6 a12 12 0 0 1 12 -12 Z"
      />
      <text className={styles.bubbleText} x="62" y="44.5" textAnchor="middle" lang="pa">
        {stuck ? 'ਕੀ?' : 'ਹਾਂ ਜੀ'}
      </text>
    </g>
  </>
);

const BebeSimple: Drawing = ({ stuck }) => (
  <>
    <path
      className={styles.body}
      d="M20 112 C20 60 96 60 96 112 V146 q-9.5 9 -19 0 q-9.5 9 -19 0 q-9.5 9 -19 0 q-9.5 9 -19 0 Z"
    />
    {/* Chunni draped over her head, with a wider band than the detailed drawing so it survives the heavier outline. */}
    <path
      className={styles.prop}
      d="M12 124 C8 50 108 50 104 124 C102 130 92 130 90 124 C92 70 26 70 28 124 C26 130 14 130 12 124 Z"
    />
    <path className={styles.limbOutline} strokeWidth={15} d="M86 128 C100 124 108 114 112 102" />
    <path className={styles.limbFill} strokeWidth={7} d="M86 128 C100 124 108 114 112 102" />
    <path className={styles.shawl} d="M14 118 C34 132 82 132 102 118 L101 134 C82 150 34 150 15 134 Z" />
    <path
      className={styles.accentFill}
      d="M40 130 l4 4 l-4 4 l-4 -4 Z M58 133 l4 4 l-4 4 l-4 -4 Z M76 130 l4 4 l-4 4 l-4 -4 Z"
    />
    <ellipse className={styles.blush} cx="38" cy="113" rx="7" ry="4.5" />
    <ellipse className={styles.blush} cx="78" cy="113" rx="7" ry="4.5" />
    {stuck ? (
      <>
        {/* Glasses slid down her nose; she peers over them. */}
        <circle className={styles.inkFill} cx="47" cy="96" r="4.6" />
        <circle className={styles.inkFill} cx="69" cy="96" r="4.6" />
        <path className={styles.fine} d="M43 89 q4 -2.5 8 0 M65 89 q4 -2.5 8 0" />
        <circle className={styles.lens} cx="47" cy="107" r="8" />
        <circle className={styles.lens} cx="69" cy="107" r="8" />
        <path className={styles.fine} d="M53 120 q5 -2.5 10 0" />
      </>
    ) : (
      <>
        {/* Squinting at the phone through thick round glasses. */}
        <path className={styles.fine} d="M43 101 q4 -3.5 8 0 M65 101 q4 -3.5 8 0" />
        <circle className={styles.lens} cx="47" cy="100" r="9.5" />
        <circle className={styles.lens} cx="69" cy="100" r="9.5" />
        <path className={styles.fine} d="M50 115 q8 7 16 0" />
      </>
    )}
    {/* Phone at arm's length, with large text on screen. */}
    <rect className={styles.prop} x="104" y="72" width="22" height="30" rx="4" />
    <rect className={styles.screen} x="109" y="77" width="12" height="16" rx="1.5" />
    <path className={styles.screenLine} d="M111.5 82 h7 M111.5 88 h6" />
    <ellipse className={styles.body} cx="112" cy="101" rx="7.5" ry="7" />
    {/* The Gurmukhi speech bubble, as in the detailed drawing. */}
    <path
      className={styles.bubble}
      d="M46 24 h32 a12 12 0 0 1 12 12 v6 a12 12 0 0 1 -12 12 h-18 l-10 9 l1 -9 h-5 a12 12 0 0 1 -12 -12 v-6 a12 12 0 0 1 12 -12 Z"
    />
    <text className={styles.bubbleText} x="62" y="46" textAnchor="middle" lang="pa">
      {stuck ? 'ਕੀ?' : 'ਹਾਂ ਜੀ'}
    </text>
  </>
);

const DRAWINGS: Record<GhostId, Record<CharacterVariant, Drawing>> = {
  listener: { detailed: ListenerDetailed, simple: ListenerSimple },
  phantom: { detailed: PhantomDetailed, simple: PhantomSimple },
  bebe: { detailed: BebeDetailed, simple: BebeSimple },
};

/** One ghost character. Decorative (aria-hidden) unless `labelled`. */
export function GhostCharacter({
  ghost,
  variant = 'detailed',
  mood = 'hopeful',
  size,
  labelled,
  floating,
  lively,
  className,
}: CharacterProps & { ghost: GhostId }) {
  const detailed = variant === 'detailed';
  const height = size ?? (detailed ? 120 : 32);
  // Both variants share one 130 × 160 frame, so a ghost has the same proportions at any size.
  const width = (height * 130) / 160;
  const stuck = mood === 'stuck';
  const Drawing = DRAWINGS[ghost][variant];
  const a11y = labelled
    ? { role: 'img', 'aria-label': characterLabel(ghost, mood) }
    : { 'aria-hidden': true as const };
  return (
    <svg
      viewBox="0 0 130 160"
      width={width}
      height={height}
      className={cx(
        styles.character,
        styles[ghost],
        detailed ? styles.detailed : styles.simple,
        lively && detailed && !stuck && styles.lively,
        floating && 'motion-float',
        className,
      )}
      data-ghost={ghost}
      data-mood={mood}
      focusable="false"
      {...a11y}
    >
      <Drawing stuck={stuck} />
    </svg>
  );
}

/** Small icon: ear with sound waves, hourglass, or magnifying glass. Always decorative; show the name beside it. */
export function GhostIcon({ ghost, className, onBone }: { ghost: GhostId; className?: string; onBone?: boolean }) {
  const cls = cx(styles.icon, styles[ghost], onBone && styles.onBone, className);
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

/** Chip: the simple character plus the ghost's name, in the ghost's accent. */
export function GhostBadge({
  ghost,
  mood,
  className,
  onBone,
}: {
  ghost: GhostId;
  mood?: GhostMood;
  className?: string;
  onBone?: boolean;
}) {
  const cls = cx(styles.badge, styles[ghost], onBone && styles.onBone, className);
  return (
    <span className={cls}>
      <GhostCharacter ghost={ghost} variant="simple" mood={mood} className={styles.badgeCharacter} />
      <span>{GHOSTS[ghost].name}</span>
    </span>
  );
}
