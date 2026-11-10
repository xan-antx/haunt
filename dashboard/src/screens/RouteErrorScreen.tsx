// Shown by the router's error boundary when a screen fails to render. The URL is kept.

import { Link, useRouteError } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { homePath } from '../routes';

export function RouteErrorScreen() {
  const error = useRouteError();
  const detail = error instanceof Error ? error.message : undefined;
  return (
    <>
      <ScreenHeading title="Something went wrong">Something went wrong on this screen</ScreenHeading>
      <div className="panel">
        <p>
          Something stopped this screen from loading. The address stays the same, so you can reload the page to try
          again.
        </p>
        {detail && <p className="muted">Details: {detail}</p>}
        <p>
          <Link to={homePath()}>Go back to Home</Link>
        </p>
      </div>
    </>
  );
}
