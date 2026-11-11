import type { Ghost, GhostId } from '../core/types.ts';
import { CHANGE_CLOCK_SOURCE } from '../page/changeClock.ts';
import { CLICK_LOG_SOURCE } from '../page/clickLog.ts';
import { ELEMENT_KEYS_SOURCE } from '../page/elementKeys.ts';
import { LAYOUT_SHIFTS_SOURCE } from '../page/layoutShifts.ts';
import { LIVE_REGIONS_SOURCE } from '../page/liveRegions.ts';
import { SIGHT_SOURCE } from '../page/sight.ts';
import { listenerGhost } from './listener/index.ts';

/*
 * The ghost registry.
 *
 * The CLI asks `getGhost(id)` for the Ghost it should run. It returns `undefined` for a ghost
 * that is a valid name but has not been registered yet, and the CLI then says so and exits 2.
 *
 * Later tasks add their ghost here: task 12 registers `listener`, and tasks 21 to 25 register
 * `phantom` and `bebe`. Each of them imports its ghost module in this file and calls
 * `registerGhost(...)` at the bottom, so importing the registry (which the CLI does before any
 * browser is launched) never needs Playwright at run time.
 */

/** A Ghost with any Perception and action types. The run loop only passes them from the Body to the Mind. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGhost = Ghost<any, any>;

/** The ghost names the CLI accepts, in the order they are listed in the usage text. */
export const GHOST_IDS = ['listener', 'phantom', 'bebe'] as const satisfies readonly GhostId[];

const registered = new Map<GhostId, AnyGhost>();

/** Registers a Ghost under its `id`. A second registration of the same id replaces the first. */
export function registerGhost(ghost: AnyGhost): void {
  registered.set(ghost.id, ghost);
}

/** The registered Ghost with this id, or `undefined` when it is not registered (yet). */
export function getGhost(id: GhostId): AnyGhost | undefined {
  return registered.get(id);
}

/**
 * Sources of the page scripts (clock, live regions, click log, ...) that the CLI installs with
 * `page.addInitScript` before the page loads, in the design's order: the Page_Change_Clock, the live
 * region recorder, the click log, the layout-shift recorder, the element keys and Sight. Every Run
 * installs all of them, whatever the ghost; each one only observes, so The Listener is not affected by
 * the visual ghosts' scripts. Tests can pass their own list to `main()` instead.
 */
export const pageInitScripts: string[] = [
  CHANGE_CLOCK_SOURCE,
  LIVE_REGIONS_SOURCE,
  CLICK_LOG_SOURCE,
  LAYOUT_SHIFTS_SOURCE,
  ELEMENT_KEYS_SOURCE,
  SIGHT_SOURCE,
];

// Registered ghosts. `phantom` and `bebe` are added by later tasks.
registerGhost(listenerGhost);
