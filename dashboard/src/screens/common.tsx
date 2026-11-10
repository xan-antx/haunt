// Shared screen states: loading, missing index, unknown run.

import { Link } from 'react-router-dom';
import { homePath } from '../routes';
import { ScreenHeading } from '../components/layout/ScreenHeading';

export function Loading({ what = 'the runs' }: { what?: string }) {
  return (
    <p role="status" className="muted">
      Summoning {what}…
    </p>
  );
}

export function IndexErrorScreen({ message }: { message: string }) {
  return (
    <>
      <ScreenHeading title="No runs found">No runs found</ScreenHeading>
      <div className="panel">
        <p>
          The dashboard found no collected runs. Run <code>npm run dev</code> or <code>npm run build</code> in{' '}
          <code>dashboard/</code> to collect them.
        </p>
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
