// Detects a blank screenshot (UI-14): a page that had not painted yet, as on The Phantom's slow
// 3G step 1. Works on RGBA pixels sampled from the decoded image.

/** True when every sampled pixel has the same colour (4 bytes per pixel, RGBA). */
export function isBlankPixels(data: ArrayLike<number>): boolean {
  if (data.length < 4) return false;
  for (let i = 4; i + 3 < data.length; i += 4) {
    if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2] || data[i + 3] !== data[3]) {
      return false;
    }
  }
  return true;
}

/** Portrait images are phone screens: they get a phone frame and are fitted by height. */
export function isPortrait(w: number, h: number): boolean {
  return h > w * 1.2;
}

export const SLOW_LOAD_CAPTION = 'The page is still loading on slow 3G';

/** For any other blank screenshot: says what is seen and gives no cause the run files don't show. */
export const BLANK_CAPTION = 'The screen was blank at this step.';
