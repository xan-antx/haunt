// Shared screen states: loading, missing index, unknown run.

import { Link } from 'react-router-dom';
import { homePath } from '../routes';
import { ScreenHeading } from '../components/layout/ScreenHeading';

/** A still candle and a small ghost. It never moves, so it is the same with reduced motion. */
function LoaderArt() {
  return (
    <svg viewBox="0 0 120 64" width="96" height="51" aria-hidden="true" focusable="false">
      {/* candle */}
      <rect x="22" y="30" width="12" height="26" rx="2" fill="var(--bone)" />
      <path d="M28 12 C23 20 24 26 28 28 C32 26 33 20 28 12 Z" fill="var(--amber)" />
      <rect x="14" y="56" width="28" height="4" rx="2" fill="var(--text-muted)" />
      {/* ghost */}
      <path
        d="M70 58 V30 a18 18 0 0 1 36 0 V58 l-6 -5 l-6 5 l-6 -5 l-6 5 l-6 -5 Z"
        fill="var(--spectral)"
        stroke="var(--ghost-listener)"
        strokeWidth="2"
      />
      <circle cx="82" cy="31" r="3" fill="var(--bg)" />
      <circle cx="95" cy="31" r="3" fill="var(--bg)" />
      <path d="M84 40 q6 5 12 0" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Loading({ what = 'the runs' }: { what?: string }) {
  return (
    <div role="status" className="muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <LoaderArt />
      <span>Summoning {what}…</span>
    </div>
  );
}

export function IndexErrorScreen({ message }: { message: string }) {
  return (
    <>
      <ScreenHeading title="No runs found">No runs found</ScreenHeading>
      <div className="panel">
        <p>The ghosts' results could not be loaded just now. Try reloading the page in a moment.</p>
        <p className="muted">Details: {message}</p>
      </div>
    </>
  );
}

export function UnknownRunScreen() {
  return (
    <>
      <ScreenHeading title="Unknown run">No ghost by that name has walked here</ScreenHeading>
      <p>
        <Link to={homePath()}>Go back to Home</Link>
      </p>
    </>
  );
}
