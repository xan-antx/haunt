// Exorcise: compare a before run and an after run of the same mission to see which findings are gone.

import { useId } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GhostBadge } from '../components/ghosts/Ghosts';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { ScreenIntro } from '../components/layout/ScreenIntro';
import { ProvenancePanel } from '../components/ProvenancePanel';
import { ResultBadge } from '../components/ResultBadge';
import { useAllRuns } from '../data/hooks';
import type { Run } from '../data/types';
import { EXORCISE_LABELS, afterCandidates, compareRuns, type ExorciseRow, type ExorciseStatus } from '../model/exorcise';
import { plainFindingType } from '../model/findingLabels';
import { byStartedAtDesc, formatDate, plural } from '../model/format';
import { GHOSTS, moodFor, RESULT_LABELS } from '../model/ghosts';
import { exorcisePath, stepPath } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';
import styles from './ExorciseScreen.module.css';

function runLabel(run: Run): string {
  return `${GHOSTS[run.ghost].name} · ${run.mission.id} · ${formatDate(run.startedAt)} · ${RESULT_LABELS[run.result]}`;
}

/** The newest other run by the same ghost of the same mission, or null if there is none. */
export function defaultAfter(before: Run, runs: Run[]): Run | null {
  return afterCandidates(before, runs)[0] ?? null;
}

/**
 * A default pair: the newest run that has a same-ghost, same-mission partner as "after",
 * and its newest partner as "before". Null when no run has such a partner.
 */
export function defaultPair(runs: Run[]): { before: Run; after: Run } | null {
  const sorted = [...runs].sort(byStartedAtDesc);
  for (const after of sorted) {
    const before = defaultAfter(after, sorted);
    if (before) return { before, after };
  }
  return null;
}

function StatusIcon({ status }: { status: ExorciseStatus }) {
  return (
    <svg className={`${styles.icon} ${styles[status]}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {status === 'not_reached' ? (
        <path d="M2 9 q5 -3 10 0 t10 0 M2 14 q5 -3 10 0 t10 0 M4 19 q4 -2 8 0 t8 0" />
      ) : (
        <path d="M5 21 V10 a7 7 0 0 1 14 0 V21 l-2.3 -2 l-2.3 2 l-2.4 -2 l-2.4 2 l-2.3 -2 Z" />
      )}
      {status === 'new_haunting' && <path className={styles.plus} d="M17 2 v6 M14 5 h6" />}
    </svg>
  );
}

function StatusCell({ row }: { row: ExorciseRow }) {
  return (
    <span className={`${styles.status} ${styles[`${row.status}Badge`]}`}>
      <StatusIcon status={row.status} />
      <span>{EXORCISE_LABELS[row.status]}</span>
    </span>
  );
}

function RunSummary({ run, heading }: { run: Run; heading: string }) {
  return (
    <section className={styles.summary} aria-labelledby={`summary-${heading}`}>
      <h2 id={`summary-${heading}`}>{heading}</h2>
      <p className={styles.summaryLine}>
        <GhostBadge ghost={run.ghost} mood={moodFor(run.result)} /> <ResultBadge result={run.result} />
      </p>
      <p>
        {run.mission.goal} · {plural(run.findings.length, 'finding')} ·{' '}
        <Link to={stepPath(run.key, 1)}>Watch in the Ghost Cam</Link>
      </p>
      <ProvenancePanel
        run={run}
        heading={`${heading}: where this run came from`}
        commandLabel={`Reproduce command, ${heading}`}
      />
    </section>
  );
}

function Comparison({ before, after }: { before: Run; after: Run }) {
  const result = compareRuns(before, after);
  if ('error' in result) {
    if (result.error === 'different_ghosts') {
      const beforeName = GHOSTS[before.ghost].name;
      return (
        <>
          <RunSummary run={before} heading="Before" />
          <p className={styles.warning}>
            <strong>Different ghosts.</strong> {beforeName} and {GHOSTS[after.ghost].name} look for different
            problems, so Exorcise can't compare these runs. Choose an after run by {beforeName}.
          </p>
        </>
      );
    }
    return (
      <p className={styles.error} role="alert">
        These runs follow different missions, so Exorcise can't compare them.
      </p>
    );
  }
  return (
    <>
      <div className={styles.columns}>
        <RunSummary run={before} heading="Before" />
        <RunSummary run={after} heading="After" />
      </div>
      <h2>What changed</h2>
      {result.rows.length === 0 ? (
        <p>Neither run found any problems.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <caption className="visually-hidden">Findings in the before and after runs</caption>
            <thead>
              <tr>
                <th scope="col">Finding</th>
                <th scope="col">Page</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const finding = row.before ?? row.after!;
                return (
                  <tr key={row.key}>
                    <td>
                      <strong>{plainFindingType(row.type)}</strong>
                      <br />
                      {finding.title}
                    </td>
                    <td>
                      <code>{row.page}</code>
                    </td>
                    <td>
                      <StatusCell row={row} />
                      {row.status === 'not_reached' && (
                        <p className={styles.note}>
                          {GHOSTS[after.ghost].name} never got as far as {row.page} in the after run, so we can't
                          tell whether your fix worked.
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ExorciseScreen() {
  const { beforeKey, afterKey } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const beforeId = useId();
  const afterId = useId();
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the runs to compare" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  const runs = [...state.runs].sort(byStartedAtDesc);
  const find = (key: string | undefined) => runs.find((r) => r.key === key);
  const beforeParam = searchParams.get('before');

  // Resolution order: path keys, then ?before=<key>, then the default pair, then the newest run alone.
  let before: Run | undefined;
  let after: Run | null = null;
  if (beforeKey !== undefined && afterKey !== undefined) {
    before = find(beforeKey);
    const found = find(afterKey);
    if (!before || !found) return <UnknownRunScreen />;
    after = found;
  } else if (beforeParam !== null) {
    before = find(beforeParam);
    if (!before) return <UnknownRunScreen />;
    after = defaultAfter(before, runs);
  } else {
    const pair = defaultPair(runs);
    if (pair) {
      before = pair.before;
      after = pair.after;
    } else {
      before = runs[0];
    }
  }

  const heading = <ScreenHeading title="Exorcise">Exorcise</ScreenHeading>;
  const intro = (
    <ScreenIntro>
      After you fix a problem in your code and run the same ghost again, Exorcise compares the two runs to show which
      problems are gone.
    </ScreenIntro>
  );

  if (!before) {
    return (
      <>
        {heading}
        {intro}
        <p>Exorcise needs two runs of the same mission. There aren't any yet.</p>
      </>
    );
  }

  const afterOptions = afterCandidates(before, runs);
  const ghostName = GHOSTS[before.ghost].name;
  // True while the dashboard shows only the sample runs from runs/samples/, as in this demo.
  const onlySamples = runs.every((r) => r.origin === 'samples');
  const choose = (b: Run, a: Run | null) => {
    const nextAfter = a ?? defaultAfter(b, runs);
    if (nextAfter) navigate(exorcisePath(b.key, nextAfter.key), { replace: true });
    else navigate(`${exorcisePath()}?before=${encodeURIComponent(b.key)}`, { replace: true });
  };
  const afterSelected = after !== null && afterOptions.some((r) => r.key === after.key);

  return (
    <>
      {heading}
      {intro}
      <div className={styles.pickers} data-tour="exorcise-pickers">
        <div className={styles.picker}>
          <label htmlFor={beforeId}>Before run</label>
          <select
            id={beforeId}
            className="select"
            value={before.key}
            onChange={(e) => {
              const b = find(e.target.value)!;
              const keepAfter =
                after !== null &&
                after.ghost === b.ghost &&
                after.mission.id === b.mission.id &&
                after.key !== b.key;
              choose(b, keepAfter ? after : null);
            }}
          >
            {runs.map((r) => (
              <option key={r.key} value={r.key}>
                {runLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.picker}>
          {afterOptions.length === 0 ? (
            <>
              <strong>After run (same ghost and mission)</strong>
              <p className={styles.notice}>
                No after run yet for {ghostName}. Fix the problem in your app's code, then run {ghostName} on the
                same mission again, and the new run shows up here as the after run.
                {onlySamples && (
                  <>
                    {' '}
                    Re-running ghosts is coming soon. This demo only has sample runs, so there is no after run to
                    show yet.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <label htmlFor={afterId}>After run (same ghost and mission)</label>
              <select
                id={afterId}
                className="select"
                value={afterSelected && after ? after.key : ''}
                onChange={(e) => choose(before, find(e.target.value) ?? null)}
              >
                {!afterSelected && <option value="">Choose a run by {ghostName}</option>}
                {afterOptions.map((r) => (
                  <option key={r.key} value={r.key}>
                    {runLabel(r)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
      {after ? <Comparison before={before} after={after} /> : <RunSummary run={before} heading="Before" />}
    </>
  );
}
