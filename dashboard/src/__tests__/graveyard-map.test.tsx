import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

async function renderGraveyard(path: string) {
  const result = renderApp(path);
  await screen.findByRole('heading', { level: 1, name: 'Graveyard' });
  return result;
}

describe('Graveyard Map_View (Req 8, 9.7–9.9)', () => {
  it('shows the site map with rooms as h3 and the three cold spots', async () => {
    await renderGraveyard('/graveyard?view=map');
    await waitFor(() => expect(document.title).toBe('Graveyard · Map · Haunt'));
    expect(document.querySelector('[data-screen-intro]')).toHaveTextContent(
      'The map shows each page as a room, with a frost circle wherever a ghost got stuck.',
    );
    expect(screen.getByText('The bigger the circle, the longer the ghost waited there.')).toBeInTheDocument();

    const map = screen.getByRole('region', { name: 'Map of Lantern Bills demo' });
    expect(within(map).getByRole('heading', { level: 2, name: 'Map of Lantern Bills demo' })).toBeInTheDocument();
    const rooms = within(map).getByRole('list', { name: 'Rooms of Lantern Bills demo' });
    expect(within(rooms).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['/', '/bill']);

    const spots = within(map).getAllByRole('link', { name: /open in Ghost Cam$/ });
    expect(spots.map((s) => s.getAttribute('aria-label'))).toEqual([
      'The Listener waited 0.2 s at step 7 — open in Ghost Cam',
      'The Listener waited 0.5 s at step 9 — open in Ghost Cam',
      'Bebe waited 0.2 s at step 3 — open in Ghost Cam',
    ]);
    expect(spots[1]).toHaveAttribute('href', `/run/${L}/step/9`);
    expect(spots[2]).toHaveAttribute('href', `/run/${B}/step/3`);
    expect(screen.getByText('2 rooms')).toHaveAttribute('role', 'status');
    // No tombstones in the Map_View.
    expect(screen.queryByText('Keyboard trap')).not.toBeInTheDocument();
  });

  it('fogs rooms the chosen ghost never entered', async () => {
    await renderGraveyard('/graveyard?ghost=phantom&view=map');
    expect(screen.getAllByText('The Phantom never entered this room')).toHaveLength(2);
    expect(document.querySelectorAll('main [data-fog]')).toHaveLength(2);
  });

  it('keeps fog off rooms the chosen ghost entered', async () => {
    await renderGraveyard('/graveyard?ghost=bebe&view=map');
    expect(screen.queryByText(/never entered this room/)).not.toBeInTheDocument();
  });

  it('switches views through the URL with replace and keeps focus on the radio', async () => {
    const user = userEvent.setup();
    const { router } = await renderGraveyard('/graveyard?ghost=listener');
    const views = screen.getByRole('group', { name: 'View' });
    expect(within(views).getByRole('radio', { name: 'Tombstones' })).toBeChecked();
    expect(screen.getByText('2 tombstones')).toHaveAttribute('role', 'status');

    const map = within(views).getByRole('radio', { name: 'Map' });
    await user.click(map);
    await waitFor(() => expect(router.state.location.search).toBe('?ghost=listener&view=map'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(map).toBeChecked();
    expect(map).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Map of Lantern Bills demo' })).toBeInTheDocument();

    await user.click(within(views).getByRole('radio', { name: 'Tombstones' }));
    await waitFor(() => expect(router.state.location.search).toBe('?ghost=listener'));
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('filters the map by site, keeping the view', async () => {
    const user = userEvent.setup();
    const { router } = await renderGraveyard('/graveyard?view=map');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Site' }), 'lantern-bills-demo');
    await waitFor(() => expect(router.state.location.search).toBe('?site=lantern-bills-demo&view=map'));
    expect(screen.getByRole('region', { name: 'Map of Lantern Bills demo' })).toBeInTheDocument();
  });
});
