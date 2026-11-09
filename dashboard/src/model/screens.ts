// The one table of screens: names, plain-words descriptions, the Guided_Path and where each
// screen's link goes. The navigation, Home's "What's in here" guide and the "Next stop" links all
// read from here, so they always agree (Req 20.6).

import type { Run } from '../data/types';
import {
  coveragePath,
  exorcisePath,
  graveyardPath,
  homePath,
  mapPath,
  seancePath,
  stepPath,
  type Route,
} from '../routes';
import { groupHaunts, startHereTarget } from './haunts';

export type ScreenId = 'home' | 'map' | 'graveyard' | 'ghostcam' | 'seance' | 'exorcise' | 'coverage';

export interface ScreenInfo {
  id: ScreenId;
  /** The spooky name, shown everywhere the screen is named. */
  name: string;
  /** What the screen is for, in plain words. Home has none. */
  description: string | null;
}

export const SCREENS: Record<ScreenId, ScreenInfo> = {
  home: { id: 'home', name: 'Home', description: null },
  map: { id: 'map', name: 'Haunted Map', description: 'Where ghosts got stuck' },
  graveyard: { id: 'graveyard', name: 'Graveyard', description: 'Every problem found' },
  ghostcam: { id: 'ghostcam', name: 'Ghost Cam', description: "Replay a ghost's visit" },
  seance: { id: 'seance', name: 'Séance', description: 'Ask a ghost why' },
  exorcise: { id: 'exorcise', name: 'Exorcise', description: 'Before and after a fix' },
  coverage: { id: 'coverage', name: 'Spec Coverage', description: 'Which requirements people can reach' },
};

/** Top_Navigation order. */
export const NAV_ORDER: readonly ScreenId[] = ['home', 'map', 'graveyard', 'ghostcam', 'seance', 'exorcise', 'coverage'];

/** The tour. After the last stop it wraps back to Home. */
export const GUIDED_PATH: readonly ScreenId[] = ['home', 'ghostcam', 'graveyard', 'map', 'exorcise', 'coverage', 'seance'];

export type ScreenDestinations = Record<ScreenId, string | null>;

/**
 * Where each screen's link goes. The Haunted Map opens the most recently visited haunt; the Ghost Cam
 * opens the "Start here" step, or step 1 of the first run. Both are null when there are no runs.
 */
export function screenDestinations(runs: Run[]): ScreenDestinations {
  const firstHaunt = groupHaunts(runs)[0];
  const start = startHereTarget(runs);
  const cam = start ?? (runs[0] ? { runKey: runs[0].key, step: runs[0].steps[0]?.n ?? 1 } : null);
  return {
    home: homePath(),
    map: firstHaunt ? mapPath(firstHaunt.siteKey) : null,
    graveyard: graveyardPath(),
    ghostcam: cam ? stepPath(cam.runKey, cam.step) : null,
    seance: seancePath(),
    exorcise: exorcisePath(),
    coverage: coveragePath(),
  };
}

/** The next available stop after `current` on the Guided_Path, skipping screens with no destination. */
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

/** Which screen a route belongs to. Restless files and unknown paths are not screens on the tour. */
export function screenOfRoute(route: Route): ScreenId | null {
  switch (route.screen) {
    case 'home':
    case 'graveyard':
    case 'seance':
    case 'exorcise':
    case 'coverage':
    case 'map':
      return route.screen;
    case 'run':
    case 'step':
      return 'ghostcam';
    case 'restless':
    case 'not_found':
      return null;
  }
}
