// The Graveyard's Map_View (Req 8): each page is a room. Cold spots show where a ghost got stuck,
// sized by how long it waited. Fog covers rooms the selected ghost never entered.

import { Link } from 'react-router-dom';
import { GhostBadge, GhostIcon } from '../../components/ghosts/Ghosts';
import { Fog } from '../../components/layout/Fog';
import type { GhostId, Run } from '../../data/types';
import { buildRooms, coldSpotSize, type ColdSpot, type Room } from '../../model/coldSpots';
import { formatSeconds } from '../../model/format';
import { GHOSTS } from '../../model/ghosts';
import { siteKey, stepPath } from '../../routes';
import styles from './MapView.module.css';

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

function RoomCard({ room, site, filter }: { room: Room; site: string; filter: GhostId | null }) {
  const unvisited = filter !== null && !room.ghosts.includes(filter);
  const headingId = `room-${site}-${room.page.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  return (
    <li className={`${styles.room} ${unvisited ? styles.unvisited : ''}`} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.roomName}>
        {room.page}
      </h3>
      {unvisited && (
        <>
          <Fog dense className={styles.roomFog} />
          <p className={styles.notVisited}>{GHOSTS[filter].name} never entered this room</p>
        </>
      )}
      <p className={styles.label}>Ghosts who entered</p>
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

export interface SiteRooms {
  key: string;
  name: string;
  rooms: Room[];
}

/** One floor plan per site, sites in name order. */
export function siteRooms(runs: Run[]): SiteRooms[] {
  const bySite = new Map<string, Run[]>();
  for (const run of runs) bySite.set(run.site.name, [...(bySite.get(run.site.name) ?? []), run]);
  return [...bySite.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, siteRuns]) => ({ key: siteKey(name), name, rooms: buildRooms(siteRuns) }));
}

export function MapView({ sites, filter }: { sites: SiteRooms[]; filter: GhostId | null }) {
  return (
    <>
      {sites.map((site) => (
        <section key={site.key} aria-labelledby={`map-${site.key}`} className={styles.site}>
          <h2 id={`map-${site.key}`} className={styles.siteName}>
            Map of {site.name}
          </h2>
          <ul className={styles.plan} aria-label={`Rooms of ${site.name}`}>
            {site.rooms.map((room) => (
              <RoomCard key={room.page} room={room} site={site.key} filter={filter} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
