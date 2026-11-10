// Graveyard: every problem found, as a list of bone tombstones (one per finding) or as a map of
// rooms with cold spots. The view, site and ghost choices live in the URL query (Req 9.6–9.9, 8).

import { useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ScreenIcon } from '../components/ScreenIcon';
import { Tombstone } from '../components/Tombstone';
import { useAllRuns } from '../data/hooks';
import { plural } from '../model/format';
import { GHOSTS, GHOST_ORDER, isGhostId } from '../model/ghosts';
import { buildGraveyard } from '../model/graveyard';
import { graveyardPath, siteKey, type GraveyardView } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import { MapView, siteRooms } from './graveyard/MapView';
import styles from './GraveyardScreen.module.css';

export const GRAVEYARD_INTROS: Record<GraveyardView, string> = {
  list: 'Each tombstone is one problem a ghost found, with a link to watch the moment it happened.',
  map: 'The map shows each page as a room, with a frost circle wherever a ghost got stuck.',
};

export function GraveyardScreen() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const siteSelectId = useId();
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the graveyard" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const sites = [...new Map(state.runs.map((r) => [siteKey(r.site.name), r.site.name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const siteParam = search.get('site') ?? undefined;
  const site = sites.some(([key]) => key === siteParam) ? siteParam : undefined;
  const ghostParam = search.get('ghost');
  const ghost = isGhostId(ghostParam) ? ghostParam : undefined;
  const view: GraveyardView = search.get('view') === 'map' ? 'map' : 'list';

  // Replace, so changing a choice adds no history entry and focus stays on the control (Req 9.8).
  const setChoice = (next: { site?: string; ghost?: string; view?: GraveyardView }) =>
    navigate(graveyardPath({ site, ghost, view, ...next }), { replace: true });

  const stones = view === 'list' ? buildGraveyard(state.runs, { site, ghost }) : [];
  const maps = view === 'map' ? siteRooms(state.runs.filter((r) => !site || siteKey(r.site.name) === site)) : [];
  const roomCount = maps.reduce((sum, m) => sum + m.rooms.length, 0);

  return (
    <>
      <ScreenHeading title={view === 'map' ? 'Graveyard · Map' : 'Graveyard'}>Graveyard</ScreenHeading>
      <ScreenIntro>{GRAVEYARD_INTROS[view]}</ScreenIntro>
      {view === 'map' && <p>The bigger the circle, the longer the ghost waited there.</p>}

      <div className={styles.filters}>
        <fieldset data-tour="graveyard-views">
          <legend>View</legend>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name="graveyard-view"
                checked={view === 'list'}
                onChange={() => setChoice({ view: 'list' })}
              />
              <ScreenIcon screen="graveyard" className={styles.viewIcon} />
              Tombstones
            </label>
            <label>
              <input type="radio" name="graveyard-view" checked={view === 'map'} onChange={() => setChoice({ view: 'map' })} />
              <ScreenIcon screen="map" className={styles.viewIcon} />
              Map
            </label>
          </div>
        </fieldset>
        <div className={styles.siteFilter}>
          <label htmlFor={siteSelectId}>Site</label>
          <select
            id={siteSelectId}
            className="select"
            value={site ?? ''}
            onChange={(e) => setChoice({ site: e.target.value || undefined })}
          >
            <option value="">All sites</option>
            {sites.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend>Ghost</legend>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name="graveyard-ghost"
                checked={ghost === undefined}
                onChange={() => setChoice({ ghost: undefined })}
              />
              All ghosts
            </label>
            {GHOST_ORDER.map((g) => (
              <label key={g}>
                <input type="radio" name="graveyard-ghost" checked={ghost === g} onChange={() => setChoice({ ghost: g })} />
                {GHOSTS[g].name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p role="status" className={styles.count}>
        {view === 'map' ? plural(roomCount, 'room') : plural(stones.length, 'tombstone')}
      </p>

      {view === 'map' ? (
        maps.length === 0 ? (
          <p>No rooms yet. Once a ghost has walked a site, its pages appear here.</p>
        ) : (
          <MapView sites={maps} filter={ghost ?? null} />
        )
      ) : stones.length === 0 ? (
        <p>No tombstones here. No ghost found a problem that matches these filters.</p>
      ) : (
        <ul className={styles.grid}>
          {stones.map((stone) => (
            <li key={`${stone.run.key}-${stone.run.findings.indexOf(stone.finding)}`}>
              <Tombstone data={stone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
