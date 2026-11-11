import type { BrowserProfile } from '../../core/types.ts';
import type { PatternLang } from '../../missions/patterns.ts';
import type { DelayRange } from '../visual/body.ts';

/**
 * Bebe's browser (Requirement 17.1; design "Bebe (Phase 2a) > Profile"): a 640 by 400 CSS pixel
 * viewport at device scale factor 2, which is 200% zoom on a 1280 by 800 screen, so screenshots are
 * 1280 by 800 PNGs. Desktop (no touch), locale `pa-IN` and the `Accept-Language` header
 * `pa-IN,pa;q=0.9`, so both `navigator.languages` and the request headers put Punjabi first and
 * Lantern Bills renders in Punjabi. No network or CPU throttling (the `throttling` field is left out).
 */
export const bebeProfile: BrowserProfile = {
  width: 640,
  height: 400,
  deviceScaleFactor: 2,
  locale: 'pa-IN',
  isMobile: false,
  hasTouch: false,
  extraHTTPHeaders: { 'Accept-Language': 'pa-IN,pa;q=0.9' },
};

/** Settle (Requirement 17.3): the Page_Change_Clock must show no change for 2000 ms. */
export const BEBE_SETTLE_QUIET_MS = 2000;
/** Settle never waits longer than 20 000 ms (Requirement 17.3). */
export const BEBE_SETTLE_MAX_MS = 20_000;
/** The Reaction_Delay before each click, 1300 to 1700 ms from the Run's seed (Requirement 17.4). */
export const BEBE_REACTION_DELAY: DelayRange = { minMs: 1300, maxMs: 1700 };
/** Time between two typed characters (Requirement 17.4). */
export const BEBE_TYPING_DELAY_MS = 300;
/** The pattern languages Bebe's Mind tries, in order (Requirement 18.1). */
export const BEBE_LANGUAGES: readonly PatternLang[] = ['pa', 'hi', 'en'];
