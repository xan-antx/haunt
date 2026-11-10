// One original stroked icon per Screen, drawn for this project, plus the floor plan of the
// Graveyard's Map view and the crystal ball of the Ghost Cam's "Ask this ghost" button. Always
// decorative: the name is shown as text next to it (Req 20.15).

import type { ReactElement } from 'react';
import type { ScreenId } from '../model/screens';
import styles from './ScreenIcon.module.css';

export type IconId = ScreenId | 'map' | 'seance';

const PATHS: Record<IconId, ReactElement> = {
  // A house with a door.
  home: (
    <>
      <path d="M3 11 L12 3.5 L21 11" />
      <path d="M5.5 9.5 V20.5 H18.5 V9.5" />
      <path d="M10 20.5 V15 H14 V20.5" />
    </>
  ),
  // A floor plan of rooms, with a frost circle where a ghost got stuck.
  map: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M12 4 V11 M3 11 H15 M15 11 V20" />
      <circle cx="7.5" cy="15.5" r="2" />
      <path d="M7.5 12.5 V13 M7.5 18 V18.5 M4.5 15.5 H5 M10 15.5 H10.5" />
    </>
  ),
  // A tombstone on the ground.
  graveyard: (
    <>
      <path d="M6.5 20.5 V9 a5.5 5.5 0 0 1 11 0 V20.5" />
      <path d="M12 8 V15 M9.5 10.5 H14.5" />
      <path d="M3 20.5 H21" />
    </>
  ),
  // A film camera with two reels.
  ghostcam: (
    <>
      <rect x="2.5" y="10" width="13" height="9" rx="1.5" />
      <path d="M15.5 13 L21.5 10.5 V18.5 L15.5 16" />
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="12" cy="6.5" r="2.5" />
    </>
  ),
  // A crystal ball on its stand.
  seance: (
    <>
      <circle cx="12" cy="10" r="7" />
      <path d="M8.5 7.5 a4 4 0 0 1 3 -2" />
      <path d="M7 20.5 H17 L15 17 H9 Z" />
    </>
  ),
  // A ghost, then a check mark: the haunting is gone after the fix.
  exorcise: (
    <>
      <path d="M2.5 20 V11 a5 5 0 0 1 10 0 V20 l-1.7 -1.5 l-1.6 1.5 l-1.7 -1.5 l-1.6 1.5 l-1.7 -1.5 Z" />
      <path d="M15 13.5 l2.5 2.5 L22 10" />
    </>
  ),
  // A checklist on a clipboard.
  coverage: (
    <>
      <rect x="4.5" y="4.5" width="15" height="16.5" rx="1.5" />
      <path d="M9 4.5 V3 H15 V4.5" />
      <path d="M7.5 10 l1.5 1.5 L11.5 9 M7.5 16 l1.5 1.5 L11.5 15" />
      <path d="M13.5 10.5 H16.5 M13.5 16.5 H16.5" />
    </>
  ),
};

export function ScreenIcon({ screen, className }: { screen: IconId; className?: string }) {
  return (
    <svg
      className={[styles.icon, className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-screen-icon={screen}
    >
      {PATHS[screen]}
    </svg>
  );
}
