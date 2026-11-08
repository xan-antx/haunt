// #/restless/:runKey — shows an Invalid_Run's file path and errors.

import { Link, useParams } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { RunErrorPanel } from '../components/RunErrorPanel';
import { useRun } from '../data/hooks';
import { homePath, stepPath } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';

export function RestlessScreen() {
  const { runKey } = useParams();
  const state = useRun(runKey);
  switch (state.status) {
    case 'loading':
      return <Loading what="the restless file" />;
    case 'error':
      return <IndexErrorScreen message={state.message} />;
    case 'not_found':
      return <UnknownRunScreen />;
    case 'ready':
      return (
        <>
          <ScreenHeading title="Restless file">This file is not restless</ScreenHeading>
          <p>
            This run file is valid. <Link to={stepPath(state.run.key, 1)}>Watch it in the Ghost Cam</Link>.
          </p>
        </>
      );
    case 'invalid':
      return (
        <>
          <ScreenHeading title={`Restless file · ${state.invalid.key}`}>A restless file</ScreenHeading>
          <p>This run file could not be read, so it is left out of every other screen.</p>
          <RunErrorPanel invalid={state.invalid} />
          <p>
            <Link to={homePath()}>Go back to Home</Link>
          </p>
        </>
      );
  }
}
