// Old_Links (Req 6.10, 6.11, 23.3). The Haunted Map and the Séance are no longer screens of their
// own, so their old URLs replace themselves with the place that now holds the same content.

import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ScreenHeading } from '../components/layout/ScreenHeading';
import { useAllRuns } from '../data/hooks';
import { isGhostId } from '../model/ghosts';
import { watchStep } from '../model/results';
import { ghostCamTarget } from '../model/screens';
import { askPath, graveyardPath, homePath, isQuestionId } from '../routes';
import { IndexErrorScreen, Loading, UnknownRunScreen } from './common';

/** #/haunt/:siteKey/map?ghost=g → the Graveyard's Map_View for the same site and ghost. */
export function MapRedirect() {
  const { siteKey } = useParams();
  const [search] = useSearchParams();
  const ghost = search.get('ghost');
  return (
    <Navigate replace to={graveyardPath({ site: siteKey, ghost: isGhostId(ghost) ? ghost : undefined, view: 'map' })} />
  );
}

/** #/seance and #/seance/:runKey/:questionId → the Ghost Cam with the Ask_Panel open. */
export function SeanceRedirect() {
  const { runKey, questionId } = useParams();
  const state = useAllRuns();
  if (state.status === 'loading') return <Loading what="the spirits" />;
  if (state.status === 'error') return <IndexErrorScreen message={state.message} />;

  if (runKey === undefined) {
    const target = ghostCamTarget(state.runs);
    if (!target) {
      return (
        <>
          <ScreenHeading title="Ask a ghost">Ask a ghost</ScreenHeading>
          <p>No ghost has walked here yet, so there is no one to ask.</p>
          <p>
            <Link to={homePath()}>Go back to Home</Link>
          </p>
        </>
      );
    }
    return <Navigate replace to={askPath(target.runKey, target.step, 'open')} />;
  }

  const run = state.runs.find((r) => r.key === runKey);
  if (!run) return <UnknownRunScreen />;
  const step = watchStep(run) ?? 1;
  return <Navigate replace to={askPath(run.key, step, isQuestionId(questionId) ? questionId : 'open')} />;
}
