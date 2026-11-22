// "Summon a live ghost". Where the dashboard runs with `npm run dev`, a local-only endpoint starts
// The Listener on Lantern Bills and adds the new run to the dashboard. Everywhere else (the published
// site, a built preview) there is no endpoint, so the button says so and shows how to run it locally.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRunSource } from '../data/hooks';
import { stepPath } from '../routes';
import { CandleButton } from './CandleButton';
import styles from './SummonGhost.module.css';

export const SUMMON_ENDPOINT = '/__haunt/summon';
export const SUMMON_HEADER = 'x-haunt-summon';
export const POLL_MS = 1000;

export const LOCAL_ONLY_SENTENCE =
  'Live ghosts run on your own computer, so to summon one, run these two commands in a clone of Haunt.';
export const LOCAL_COMMANDS = ['cd dashboard', 'npm run dev'] as const;

interface LiveStatus {
  state: 'idle' | 'running' | 'done' | 'failed';
  message: string;
  step?: number;
  runKey?: string;
}

function isStatus(value: unknown): value is LiveStatus {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.state === 'idle' || v.state === 'running' || v.state === 'done' || v.state === 'failed') && typeof v.message === 'string';
}

async function readStatus(response: Response): Promise<LiveStatus | null> {
  try {
    const json: unknown = await response.json();
    return isStatus(json) ? json : null;
  } catch {
    return null;
  }
}

/** What the published site shows: one sentence and the two commands. */
function LocalOnly() {
  return (
    <div className={styles.localOnly}>
      <CandleButton lit={false} reason={LOCAL_ONLY_SENTENCE}>
        Summon a live ghost
      </CandleButton>
      <pre className={styles.commands}>
        <code>{LOCAL_COMMANDS.join('\n')}</code>
      </pre>
    </div>
  );
}

function LiveSummon({ onUnavailable }: { onUnavailable: () => void }) {
  const source = useRunSource();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const refreshed = useRef(false);

  // On first show, ask the endpoint where it stands. No endpoint means this is not `npm run dev`.
  useEffect(() => {
    let live = true;
    fetch(SUMMON_ENDPOINT)
      .then(async (response) => {
        const body = response.ok ? await readStatus(response) : null;
        if (!live) return;
        if (body === null) onUnavailable();
        else if (body.state === 'running') {
          setStatus(body);
          setPolling(true);
        }
      })
      .catch(() => live && onUnavailable());
    return () => {
      live = false;
    };
  }, [onUnavailable]);

  // While a ghost is out, ask for progress every second.
  useEffect(() => {
    if (!polling) return;
    let live = true;
    const id = window.setInterval(() => {
      fetch(SUMMON_ENDPOINT)
        .then(readStatus)
        .then((body) => {
          if (!live || body === null) return;
          setStatus(body);
          if (body.state === 'running') return;
          setPolling(false);
          if (body.state === 'done' && !refreshed.current) {
            refreshed.current = true;
            source.refresh?.();
          }
        })
        .catch(() => {
          if (!live) return;
          setPolling(false);
          setStatus({ state: 'failed', message: 'The dashboard lost contact with the local ghost.' });
        });
    }, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [polling, source]);

  const summon = () => {
    refreshed.current = false;
    setStatus({ state: 'running', message: 'Sending the summons.' });
    setPolling(true);
    fetch(SUMMON_ENDPOINT, { method: 'POST', headers: { [SUMMON_HEADER]: '1' } })
      .then(async (response) => {
        const body = await readStatus(response);
        if (response.status === 403) {
          setPolling(false);
          setStatus({ state: 'failed', message: 'Live ghosts can only be summoned from this computer.' });
        } else if (body !== null) {
          setStatus(body); // 202 started, or 409 because one is already out (keep watching it)
        }
      })
      .catch(() => {
        setPolling(false);
        setStatus({ state: 'failed', message: 'The dashboard could not reach the local ghost service.' });
      });
  };

  const running = status?.state === 'running';
  return (
    <div className={styles.live}>
      {running ? (
        <CandleButton lit={false} reason="A ghost is already on its way.">
          Summon a live ghost
        </CandleButton>
      ) : (
        <CandleButton lit onClick={summon}>
          Summon a live ghost
        </CandleButton>
      )}
      {/* The region is always in the page, so a screen reader announces each change in it. */}
      <p role="status" className={styles.progress}>
        {status !== null && status.state !== 'idle' && status.message}
        {status?.state === 'done' && status.runKey !== undefined && (
          <>
            {' '}
            <Link to={stepPath(status.runKey, 1)}>Watch the new run in the Ghost Cam</Link>
          </>
        )}
      </p>
    </div>
  );
}

export function SummonGhost({ local = import.meta.env.DEV }: { local?: boolean }) {
  const [unavailable, setUnavailable] = useState(false);
  const markUnavailable = useCallback(() => setUnavailable(true), []);
  if (!local || unavailable) return <LocalOnly />;
  return <LiveSummon onUnavailable={markUnavailable} />;
}
