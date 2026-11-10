import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GUIDED_PATH, NAV_ORDER, SCREENS, nextStop, screenDestinations, screenOfRoute } from '../model/screens';
import { askPath, graveyardPath, parseAsk, parseRoute } from '../routes';
import { sampleRuns } from './fixtures/samples';
import { memorySource, renderApp } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

describe('the five Screens (Req 20.1, 20.6, 20.11)', () => {
  it('lists Home, Ghost Cam, Graveyard, Exorcise and Spec Coverage in the nav and on the Guided_Path', () => {
    expect(NAV_ORDER.map((id) => SCREENS[id].name)).toEqual(['Home', 'Ghost Cam', 'Graveyard', 'Exorcise', 'Spec Coverage']);
    expect(GUIDED_PATH).toEqual(['home', 'ghostcam', 'graveyard', 'exorcise', 'coverage']);
    for (const id of NAV_ORDER) expect(SCREENS[id].description.trim()).not.toBe('');
  });

  it('walks the Guided_Path and wraps from Spec Coverage back to Home', () => {
    const d = screenDestinations(sampleRuns());
    expect(nextStop('home', d)).toEqual({ id: 'ghostcam', to: `/run/${L}/step/9` });
    expect(nextStop('ghostcam', d)).toEqual({ id: 'graveyard', to: '/graveyard' });
    expect(nextStop('graveyard', d)).toEqual({ id: 'exorcise', to: '/exorcise' });
    expect(nextStop('exorcise', d)).toEqual({ id: 'coverage', to: '/coverage' });
    expect(nextStop('coverage', d)).toEqual({ id: 'home', to: '/' });
  });

  it('skips the Ghost Cam when there are no runs', () => {
    const d = screenDestinations([]);
    expect(d.ghostcam).toBeNull();
    expect(nextStop('home', d)).toEqual({ id: 'graveyard', to: '/graveyard' });
  });

  it('puts the Old_Link routes under the Screen that now holds them', () => {
    expect(screenOfRoute(parseRoute('/haunt/x/map'))).toBe('graveyard');
    expect(screenOfRoute(parseRoute('/seance'))).toBe('ghostcam');
    expect(screenOfRoute(parseRoute(`/seance/${L}/why-give-up`))).toBe('ghostcam');
    expect(screenOfRoute(parseRoute('/graveyard?view=map'))).toBe('graveyard');
  });
});

describe('routes for the views and the Ask_Panel (Req 6.2)', () => {
  it('builds and parses the Graveyard views', () => {
    expect(graveyardPath()).toBe('/graveyard');
    expect(graveyardPath({ view: 'list' })).toBe('/graveyard');
    expect(graveyardPath({ site: 's', ghost: 'bebe', view: 'map' })).toBe('/graveyard?site=s&ghost=bebe&view=map');
    expect(parseRoute('/graveyard?view=map&ghost=bebe')).toEqual({
      screen: 'graveyard',
      site: undefined,
      ghost: 'bebe',
      view: 'map',
    });
    expect(parseRoute('/graveyard?view=other')).toEqual({ screen: 'graveyard' });
  });

  it('builds and parses the ask query', () => {
    expect(askPath(L, 9, null)).toBe(`/run/${L}/step/9`);
    expect(askPath(L, 9, 'open')).toBe(`/run/${L}/step/9?ask=open`);
    expect(askPath(L, 7, 'where-stuck')).toBe(`/run/${L}/step/7?ask=where-stuck`);
    expect(parseAsk(null)).toEqual({ open: false, question: null });
    expect(parseAsk('open')).toEqual({ open: true, question: null });
    expect(parseAsk('')).toEqual({ open: true, question: null });
    expect(parseAsk('bogus')).toEqual({ open: true, question: null });
    expect(parseAsk('what-heard')).toEqual({ open: true, question: 'what-heard' });
  });
});

describe('Old_Links replace themselves (Req 6.10, 6.11, 23.3)', () => {
  async function landsOn(from: string, to: string) {
    const { router } = renderApp(from);
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe(to));
    await screen.findByRole('heading', { level: 1 });
    // Replaced, not pushed: there is still only one history entry.
    expect(router.state.historyAction).toBe('REPLACE');
    return router;
  }

  it('sends the Haunted Map to the Graveyard Map view with the same site and ghost', async () => {
    await landsOn('/haunt/lantern-bills-demo/map?ghost=phantom', '/graveyard?site=lantern-bills-demo&ghost=phantom&view=map');
  });

  it('drops a ghost that is not a contract ghost', async () => {
    await landsOn('/haunt/lantern-bills-demo/map?ghost=poltergeist', '/graveyard?site=lantern-bills-demo&view=map');
  });

  it('sends #/seance to the Ghost Cam destination with the Ask_Panel open', async () => {
    await landsOn('/seance', `/run/${L}/step/9?ask=open`);
  });

  it('sends a Séance answer to that run at its Watch_Step with the same question', async () => {
    await landsOn(`/seance/${L}/where-stuck`, `/run/${L}/step/9?ask=where-stuck`);
  });

  it('opens the panel with no question when the question id is unknown', async () => {
    await landsOn(`/seance/${B}/bogus`, `/run/${B}/step/3?ask=open`);
  });

  it('shows the unknown-run message for a run that does not exist', async () => {
    renderApp('/seance/nobody/why-give-up');
    expect(await screen.findByRole('heading', { level: 1, name: 'No ghost by that name has walked here' })).toBeInTheDocument();
  });

  it('says there is no one to ask when there are no runs', async () => {
    renderApp('/seance', memorySource([]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ask a ghost' })).toBeInTheDocument();
    expect(screen.getByText('No ghost has walked here yet, so there is no one to ask.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go back to Home' })).toBeInTheDocument();
  });
});
