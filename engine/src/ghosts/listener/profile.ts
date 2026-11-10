import type { BrowserProfile } from '../../core/types.ts';

/**
 * The Listener's browser (Requirement 8.1): a 1280 by 800 CSS pixel desktop viewport, device scale
 * factor 1, locale `en-IN`, no touch, and no network or CPU throttling (the `throttling` field is
 * left out on purpose). Screenshots are therefore 1280 by 800 PNGs, so `focusBox` is in CSS px.
 */
export const listenerProfile: BrowserProfile = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  locale: 'en-IN',
  isMobile: false,
  hasTouch: false,
};
