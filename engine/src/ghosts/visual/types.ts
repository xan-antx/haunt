/*
 * Types shared by the visual ghosts' Body and Mind (The Phantom and Bebe; design "Shared visual body").
 *
 * The Perception is a `Sight` (defined with the page script in `src/page/sight.ts`, re-exported here),
 * and the Mind answers with a `VisualAction`. Only type declarations live here, so the Body and the
 * Mind can both import this file without importing each other.
 */

export type { SeenItem, SeenLook, Sight } from '../../page/sight.ts';

/** What a visual ghost can do (Requirements 13.4 to 13.6, 17.4, 17.5). */
export type VisualAction =
  /** Click the centre of a Seen_Item's box from the latest Sight, after the Reaction_Delay. */
  | { type: 'click'; itemId: string }
  /** Type into the focused field, with the ghost's delay between characters. */
  | { type: 'type'; text: string }
  /** Scroll by 80% of the viewport height, with the mouse wheel over the viewport centre. */
  | { type: 'scroll'; dir: 'down' | 'up' }
  /** Wait up to 2000 ms or until the Page_Change_Clock moves, then Settle. */
  | { type: 'wait' }
  /** The browser's Back. */
  | { type: 'back' };
