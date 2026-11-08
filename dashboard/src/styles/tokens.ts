// Mirror of tokens.css, used by the contrast test. Keep both files in sync.

export const COLORS = {
  bg: '#1a1816',
  surface: '#2a2522',
  text: '#ece6dc',
  textMuted: '#b8ae9f',
  amber: '#f2a83b',
  spectral: '#dcebff',
  bone: '#e6dcc6',
  boneInk: '#2b2420',
  boneInkMuted: '#5a4e44',
  failure: '#c0392b',
  onFailure: '#ffffff',
  placeholder: '#55504a',
  spokenBg: '#000000',
  spokenText: '#f4f8ff',
  spokenFade1: '#c8ccd4',
  spokenFade2: '#a0a4ab',
  spokenFade3: '#85898f',
  thoughtFade1: '#cbc5bc',
  thoughtFade3: '#aca69d',
  ghostListener: '#8fc8ff',
  ghostPhantom: '#8fe0bf',
  ghostBebe: '#d4b6ff',
} as const;

export type ColorToken = keyof typeof COLORS;

/** "text" needs 4.5:1, "large" text and "ui" (borders, icons, focus rings) need 3:1. */
export type PairKind = 'text' | 'large' | 'ui';

export interface ColorPair {
  fg: ColorToken;
  bg: ColorToken;
  kind: PairKind;
  /** Ratio documented in .kiro/steering/dashboard-design.md or computed when the pair was added. */
  ratio: number;
  use: string;
}

/** Every color pair the dashboard uses. Add new pairs here before using them. */
export const COLOR_PAIRS: ColorPair[] = [
  { fg: 'text', bg: 'bg', kind: 'text', ratio: 14.26, use: 'Body text' },
  { fg: 'text', bg: 'surface', kind: 'text', ratio: 12.21, use: 'Body text on cards' },
  { fg: 'textMuted', bg: 'bg', kind: 'text', ratio: 8.09, use: 'Secondary text' },
  { fg: 'textMuted', bg: 'surface', kind: 'text', ratio: 6.92, use: 'Secondary text on cards' },
  { fg: 'bg', bg: 'amber', kind: 'text', ratio: 8.8, use: 'Text on primary (candle) buttons' },
  { fg: 'amber', bg: 'bg', kind: 'text', ratio: 8.8, use: 'Candle flame, amber outlines' },
  { fg: 'amber', bg: 'surface', kind: 'ui', ratio: 7.53, use: 'Still haunting outline on cards' },
  { fg: 'spectral', bg: 'bg', kind: 'text', ratio: 14.64, use: 'Links, ghost elements, focus ring' },
  { fg: 'spectral', bg: 'surface', kind: 'text', ratio: 12.53, use: 'Links and focus ring on cards' },
  { fg: 'bg', bg: 'spectral', kind: 'text', ratio: 14.64, use: 'Cold spot labels' },
  { fg: 'spectral', bg: 'spokenBg', kind: 'ui', ratio: 17.37, use: 'Focus ring on the spoken panel' },
  { fg: 'bone', bg: 'bg', kind: 'ui', ratio: 13.0, use: 'Tombstones against the page' },
  { fg: 'bone', bg: 'surface', kind: 'ui', ratio: 11.12, use: 'Tombstone marks on cards' },
  { fg: 'boneInk', bg: 'bone', kind: 'text', ratio: 11.21, use: 'Text and focus ring on tombstones' },
  { fg: 'boneInkMuted', bg: 'bone', kind: 'text', ratio: 5.91, use: 'Secondary text on tombstones' },
  { fg: 'onFailure', bg: 'failure', kind: 'text', ratio: 5.44, use: 'Text on failure fills' },
  { fg: 'failure', bg: 'bg', kind: 'ui', ratio: 3.26, use: 'Failure fill against the page' },
  { fg: 'text', bg: 'surface', kind: 'ui', ratio: 12.21, use: '2 px border around failure fills on cards' },
  { fg: 'text', bg: 'placeholder', kind: 'text', ratio: 6.43, use: 'Missing-screenshot text' },
  { fg: 'spokenText', bg: 'spokenBg', kind: 'text', ratio: 19.72, use: 'Spoken text' },
  { fg: 'ghostListener', bg: 'spokenBg', kind: 'ui', ratio: 11.87, use: 'Waveform' },
  { fg: 'ghostListener', bg: 'bg', kind: 'text', ratio: 10.01, use: 'The Listener accent' },
  { fg: 'ghostPhantom', bg: 'bg', kind: 'text', ratio: 11.45, use: 'The Phantom accent' },
  { fg: 'ghostBebe', bg: 'bg', kind: 'text', ratio: 10.06, use: 'Bebe accent' },
  { fg: 'ghostListener', bg: 'surface', kind: 'text', ratio: 8.57, use: 'The Listener accent on cards' },
  { fg: 'ghostPhantom', bg: 'surface', kind: 'text', ratio: 9.8, use: 'The Phantom accent on cards' },
  { fg: 'ghostBebe', bg: 'surface', kind: 'text', ratio: 8.61, use: 'Bebe accent on cards' },
  // Transcript fade levels 0–3. Level 0 is the current line; level 3 is the floor.
  { fg: 'spokenText', bg: 'spokenBg', kind: 'text', ratio: 19.72, use: 'Spoken transcript, current line (fade 0)' },
  { fg: 'spokenFade1', bg: 'spokenBg', kind: 'text', ratio: 13.04, use: 'Spoken transcript, fade 1' },
  { fg: 'spokenFade2', bg: 'spokenBg', kind: 'text', ratio: 8.39, use: 'Spoken transcript, fade 2' },
  { fg: 'spokenFade3', bg: 'spokenBg', kind: 'text', ratio: 5.97, use: 'Spoken transcript, fade 3 (floor)' },
  { fg: 'text', bg: 'surface', kind: 'text', ratio: 12.21, use: 'Thought transcript, current line (fade 0)' },
  { fg: 'thoughtFade1', bg: 'surface', kind: 'text', ratio: 8.84, use: 'Thought transcript, fade 1' },
  { fg: 'textMuted', bg: 'surface', kind: 'text', ratio: 6.92, use: 'Thought transcript, fade 2' },
  { fg: 'thoughtFade3', bg: 'surface', kind: 'text', ratio: 6.27, use: 'Thought transcript, fade 3 (floor)' },
];

/** Transcript fade colors by level (index 0 = current line), per panel. */
export const TRANSCRIPT_FADES = {
  spoken: { bg: 'spokenBg', levels: ['spokenText', 'spokenFade1', 'spokenFade2', 'spokenFade3'] },
  thought: { bg: 'surface', levels: ['text', 'thoughtFade1', 'textMuted', 'thoughtFade3'] },
} as const satisfies Record<string, { bg: ColorToken; levels: readonly [ColorToken, ColorToken, ColorToken, ColorToken] }>;

/** WCAG 2.1 relative luminance. */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `fg` alpha-composited over `bg` at `alpha` (0..1), as lowercase `#rrggbb`.
 * Each channel is `round(fg * alpha + bg * (1 - alpha))`. Used to get the color
 * behind text drawn over a translucent layer, such as the Nav_Fog.
 */
export function blend(fg: string, bg: string, alpha: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export const THRESHOLDS: Record<PairKind, number> = { text: 4.5, large: 3, ui: 3 };
