// Haunted Map: each page is a room. Cold spots show where a ghost got stuck, sized by how long it waited.
// Fog covers rooms the selected ghost never entered.

import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GhostBadge, GhostIcon } from '../components/ghosts/Ghosts';
import { Fog } from '../components/layout/Fog';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { useAllRuns } from '../data/hooks';
import type { GhostId } from '../data/types';
import { buildRooms, coldSpotSize, type ColdSpot, type Room } from '../model/coldSpots';
import { formatSeconds } from '../model/format';
import { GHOSTS, GHOST_ORDER, isGhostId } from '../model/ghosts';
import { homePath, mapPath, siteKey as toSiteKey, stepPath } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './HauntedMapScreen.module.css';

export function coldSpotName(spot: ColdSpot): string {
  return `${GHOSTS[spot.ghost].name} waited ${formatSeconds(spot.waitMs)} at step ${spot.step} — open in Ghost Cam`;
}

function ColdSpotLink({ spot }: { spot: ColdSpot }) {
  const size = coldSpotSize(spot.waitMs);
  return (
    <Link to={stepPath(spot.runKey, spot.step)} className={styles.spot} aria-label={coldSpotName(spot)}>
      <span className={styles.frost} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true" />
      <GhostIcon ghost={spot.ghost} />
      <span>{formatSeconds(spot.waitMs)}</span>
    </Link>
  );
}

function RoomCard({ room, filter }: { room: Room; filter: GhostId | null }) {
  const unvisited = filter !== null && !room.ghosts.includes(filter);
  const headingId = `room-${room.page.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  return (
    <li className={`${styles.room} ${unvisited ? styles.unvisited : ''}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.roomName}>
        {room.page}
      </h2>
      {unvisited && (
        <>
          <Fog dense className={styles.roomFog} />
          <p className={styles.notVisited}>Not visited by {GHOSTS[filter].name}</p>
        </>
      )}
      <p className={styles.label}>Entered by</p>
      <ul className={styles.badges}>
        {room.ghosts.map((g) => (
          <li key={g}>
            <GhostBadge ghost={g} />
          </li>
        ))}
      </ul>
      <p className={styles.label}>Cold spots</p>
      {room.coldSpots.length === 0 ? (
        <p className="muted">No ghost got stuck here.</p>
      ) : (
        <ul className={styles.spots}>
          {room.coldSpots.map((spot) => (
            <li key={`${spot.runKey}-${spot.step}`}>
              <ColdSpotLink spot={spot} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function HauntedMapScreen() {
  const { siteKey = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the map" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const runs = state.runs.filter((r) => toSiteKey(r.site.name) === siteKey);
  if (runs.length === 0) {
    return (
      <>
        <ScreenHeading title="Haunted Map · Unknown site">No haunt by that name</ScreenHeading>
        <p>No ghost has visited a site with this address yet.</p>
        <p>
          <Link to={homePath()}>Go back to Home</Link>
        </p>
      </>
    );
  }

  const siteName = runs[0]!.site.name;
  const ghostParam = search.get('ghost');
  const filter: GhostId | null = isGhostId(ghostParam) ? ghostParam : null;
  const rooms = buildRooms(runs);
  const setFilter = (ghost: GhostId | null) =>
    navigate(mapPath(siteKey, ghost ?? undefined), { replace: true });

  return (
    <>
      <ScreenHeading title={`Haunted Map · ${siteName}`}>Haunted Map: {siteName}</ScreenHeading>
      <ScreenIntro>
        This map shows each page of {siteName} as a room, with a frost circle wherever a ghost got stuck.
      </ScreenIntro>
      <p>The bigger the circle, the longer the ghost waited there.</p>

      <fieldset className={styles.filter}>
        <legend>Show rooms for</legend>
        <div className="radio-row">
          <label>
            <input type="radio" name="ghost-filter" checked={filter === null} onChange={() => setFilter(null)} />
            All ghosts
          </label>
          {GHOST_ORDER.map((g) => (
            <label key={g}>
              <input type="radio" name="ghost-filter" checked={filter === g} onChange={() => setFilter(g)} />
              {GHOSTS[g].name}
            </label>
          ))}
        </div>
      </fieldset>

      <ul className={styles.plan} aria-label={`Rooms of ${siteName}`}>
        {rooms.map((room) => (
          <RoomCard key={room.page} room={room} filter={filter} />
        ))}
      </ul>
    </>
  );
}
