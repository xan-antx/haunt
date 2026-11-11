import type { BrowserProfile } from '../../core/types.ts';
import type { VisualBodyOptions } from '../visual/body.ts';

/** An older Android phone's Chrome (Requirement 13.1). */
export const PHANTOM_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 8.1.0; Moto G (5S) Plus) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.99 Mobile Safari/537.36';

/**
 * The Phantom's browser (Requirement 13.1): an old phone on slow 3G. A 360 by 640 CSS pixel viewport,
 * device scale factor 2 (so screenshots are 720 by 1280 PNGs), mobile mode with touch, an older Android
 * user agent and locale `en-IN`. Network throttling is Chrome DevTools' "Slow 3G": 2000 ms latency and
 * 50 000 bytes per second down and up. The CPU runs four times slower. `applyThrottling` in
 * `src/core/throttling.ts` sets both through CDP.
 */
export const phantomProfile: BrowserProfile = {
  width: 360,
  height: 640,
  deviceScaleFactor: 2,
  locale: 'en-IN',
  isMobile: true,
  hasTouch: true,
  userAgent: PHANTOM_USER_AGENT,
  throttling: {
    network: {
      latencyMs: 2000,
      downloadBytesPerSecond: 50_000,
      uploadBytesPerSecond: 50_000,
      connectionType: 'cellular3g',
    },
    cpuRate: 4,
  },
};

/**
 * The Phantom's pace (Requirements 13.3 to 13.5). Settle: `load` fired and 1200 ms with no change on the
 * Page_Change_Clock, for at most 20 s. Reaction_Delay: 550 to 650 ms from the Run's seed
 * (`550 + floor(rng() * 101)`). Typing: 120 ms per character.
 */
export const phantomTiming = {
  settleQuietMs: 1200,
  settleMaxMs: 20_000,
  reactionDelay: { minMs: 550, maxMs: 650 },
  typingDelayMs: 120,
} as const satisfies Omit<VisualBodyOptions, 'rng'>;
