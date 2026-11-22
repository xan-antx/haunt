import { useEffect, useState } from 'react';
import { useAppApi } from '@kirocrew/app-sdk';
import { Card, CardTitle, EmptyState, MarkdownRenderer, PageHeader } from '@kirocrew/app-sdk/ui';
import { dashboardRunUrl } from '../../src/dashboardLink.ts';
import { GHOST_NAMES } from '../../src/ghosts.ts';
import { badgeLabel, badgeSymbol, countsText, loadPatrol, type Getter, type PatrolView } from './model.ts';

/** Reads a static file that sits next to the built bundle (ui/dist/data/). It needs no signing. */
const getStatic: Getter = async (path) => {
  const response = await fetch(new URL(path, import.meta.url).href);
  if (!response.ok) throw { status: response.status };
  return response.json();
};

export default function App() {
  const api = useAppApi();
  const [view, setView] = useState<PatrolView | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPatrol((path) => api.get(path), getStatic)
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch(() => {
        if (!cancelled) setView({ kind: 'error', message: 'The latest patrol could not be loaded.' });
      });
    return () => {
      cancelled = true;
    };
    // The api object may change on every render. Load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view === null) {
    return (
      <div>
        <PageHeader title="Haunt Patrol" />
        <p role="status">Loading the latest patrol.</p>
      </div>
    );
  }
  if (view.kind === 'empty') {
    return (
      <div>
        <PageHeader title="Haunt Patrol" />
        <EmptyState title="No patrol has run yet." description="The first patrol runs at midnight IST." />
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <div>
        <PageHeader title="Haunt Patrol" />
        <EmptyState title="The latest patrol could not be shown." description={view.message} />
      </div>
    );
  }

  const { record, summary, dashboardBaseUrl } = view;
  return (
    <div>
      <PageHeader title="Haunt Patrol" subtitle={`Latest patrol: ${record.date} (IST)`} />
      <Card>
        <CardTitle>Summary</CardTitle>
        <MarkdownRenderer content={summary} />
      </Card>
      <Card>
        <CardTitle>Ghosts</CardTitle>
        <ul>
          {record.ghosts.map((entry) => (
            <li key={entry.ghost}>
              <strong>{GHOST_NAMES[entry.ghost]}</strong>{' '}
              <span>
                <span aria-hidden="true">{badgeSymbol(entry.result)}</span> <span>{badgeLabel(entry.result)}</span>
              </span>
              . <span>{countsText(entry.findingCounts)}</span>
              {entry.runId !== null ? (
                <>
                  {' '}
                  <a
                    href={dashboardRunUrl(dashboardBaseUrl, entry.runId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${GHOST_NAMES[entry.ghost]}'s run in dashboard`}
                  >
                    {`Open ${GHOST_NAMES[entry.ghost]}'s run in dashboard`}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <p>
        A run that does not appear in the dashboard needs its run list refreshed. Run <code>npm run collect-runs</code> in{' '}
        <code>dashboard/</code>.
      </p>
    </div>
  );
}
