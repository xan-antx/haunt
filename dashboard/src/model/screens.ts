// The one table of Screens: names, plain-words descriptions, the Guided_Path and where each
// Screen's link goes. The navigation and the "Next stop" links both read from here, so they
// always agree (Req 20.6).

import type { Run } from '../data/types';
import { coveragePath, exorcisePath, graveyardPath, homePath, stepPath, type Route } from '../routes';
import { startHereTarget } from './haunts';

export type ScreenId = 'home' | 'ghostcam' | 'graveyard' | 'exorcise' | 'coverage';

export interface ScreenInfo {
  id: ScreenId;
  /** The spooky name, shown everywhere the Screen is named. */
  name: string;
  /** What the Screen is for, in plain words. Shown in the open narrow-screen menu and the Next stop link. */
  description: string;
}

export const SCREENS: Record<ScreenId, ScreenInfo> = {
  home: { id: 'home', name: 'Home', description: 'What the ghosts found' },
  ghostcam: { id: 'ghostcam', name: 'Ghost Cam', description: "Replay a ghost's visit and ask it why" },
  graveyard: { id: 'graveyard', name: 'Graveyard', description: 'Every problem found, as a list or a map' },
  exorcise: { id: 'exorcise', name: 'Exorcise', description: 'Before and after a fix' },
  coverage: { id: 'coverage', name: 'Spec Coverage', description: 'Which requirements people can reach' },
};

/** Top_Navigation order (Req 20.1). */
export const NAV_ORDER: readonly ScreenId[] = ['home', 'ghostcam', 'graveyard', 'exorcise', 'coverage'];

/** The Guided_Path. After the last stop it wraps back to Home (Req 20.11). */
export const GUIDED_PATH: readonly ScreenId[] = ['home', 'ghostcam', 'graveyard', 'exorcise', 'coverage'];

export type ScreenDestinations = Record<ScreenId, string | null>;

/** The Ghost Cam's Screen_Destination: the Start_Here_Step, else step 1 of the first run. */
export function ghostCamTarget(runs: Run[]): { runKey: string; step: number } | null {
  const start = startHereTarget(runs);
  if (start) return start;
  const first = runs[0];
  return first ? { runKey: first.key, step: first.steps[0]?.n ?? 1 } : null;
}

/** Where each Screen's link goes. The Ghost Cam's is null when there are no runs. */
export function screenDestinations(runs: Run[]): ScreenDestinations {
  const cam = ghostCamTarget(runs);
  return {
    home: homePath(),
    ghostcam: cam ? stepPath(cam.runKey, cam.step) : null,
    graveyard: graveyardPath(),
    exorcise: exorcisePath(),
    coverage: coveragePath(),
  };
}

/** The next available stop after `current` on the Guided_Path, skipping Screens with no destination. */
export function nextStop(current: ScreenId, destinations: ScreenDestinations): { id: ScreenId; to: string } | null {
  const start = GUIDED_PATH.indexOf(current);
  if (start === -1) return null;
  for (let i = 1; i <= GUIDED_PATH.length; i++) {
    const id = GUIDED_PATH[(start + i) % GUIDED_PATH.length]!;
    if (id === current) return null;
    const to = destinations[id];
    if (to !== null) return { id, to };
  }
  return null;
}

/**
 * Which Screen a route belongs to. The Old_Link routes belong to the Screen that now holds
 * their content. Restless files and unknown paths are not on the Guided_Path.
 */
export function screenOfRoute(route: Route): ScreenId | null {
  switch (route.screen) {
    case 'home':
    case 'graveyard':
    case 'exorcise':
    case 'coverage':
      return route.screen;
    case 'map':
      return 'graveyard';
    case 'run':
    case 'step':
    case 'seance':
      return 'ghostcam';
    case 'restless':
    case 'not_found':
      return null;
  }
}
