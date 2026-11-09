// Graveyard: one bone tombstone per finding, filtered by site and ghost through the URL query.

import { useId } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { Tombstone } from '../components/Tombstone';
import { useAllRuns } from '../data/hooks';
import { plural } from '../model/format';
import { GHOSTS, GHOST_ORDER, isGhostId } from '../model/ghosts';
import { buildGraveyard } from '../model/graveyard';
import { graveyardPath, siteKey } from '../routes';
import { IndexErrorScreen, Loading } from './common';
import styles from './GraveyardScreen.module.css';

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
  const stones = buildGraveyard(state.runs, { site, ghost });

  const setFilter = (next: { site?: string; ghost?: string }) =>
    navigate(graveyardPath({ site, ghost, ...next }), { replace: true });

  return (
    <>
      <ScreenHeading title="Graveyard">Graveyard</ScreenHeading>
      <ScreenIntro>Each tombstone is one problem a ghost found, with a link to watch the moment it happened.</ScreenIntro>

      <div className={styles.filters}>
        <div className={styles.siteFilter}>
          <label htmlFor={siteSelectId}>Site</label>
          <select
            id={siteSelectId}
            className="select"
            value={site ?? ''}
            onChange={(e) => setFilter({ site: e.target.value || undefined })}
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
                onChange={() => setFilter({ ghost: undefined })}
              />
              All ghosts
            </label>
            {GHOST_ORDER.map((g) => (
              <label key={g}>
                <input type="radio" name="graveyard-ghost" checked={ghost === g} onChange={() => setFilter({ ghost: g })} />
                {GHOSTS[g].name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <p role="status" className={styles.count}>
        {plural(stones.length, 'tombstone')}
      </p>

      {stones.length === 0 ? (
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
