import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../model/screens';
import { memorySource, renderApp } from './helpers';

async function renderAt(path: string) {
  const view = renderApp(path);
  await screen.findByRole('heading', { level: 1 });
  return view;
}

describe('Top_Navigation (Req 20.1–20.5)', () => {
  it('has five items in order, each with its icon, name and description', async () => {
    await renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.querySelector('[class*="navLabel"]')?.textContent)).toEqual([
      'Home',
      'Ghost Cam',
      'Graveyard',
      'Exorcise',
      'Spec Coverage',
    ]);
    for (const link of links) {
      const name = link.querySelector('[class*="navLabel"]')!.textContent!;
      const id = Object.values(SCREENS).find((s) => s.name === name)!.id;
      expect(link.querySelector(`svg[data-screen-icon="${id}"]`)).toHaveAttribute('aria-hidden', 'true');
      // The accessible name starts with the visible name (WCAG 2.5.3). From 900 px the description is
      // display: none, so the name is the Screen's name alone; that is checked in the browser suite.
      expect(link).toHaveAccessibleName(new RegExp(`^${name}`));
      expect(link).toHaveTextContent(SCREENS[id].description);
    }
    expect(within(nav).queryByText('Haunted Map')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Séance')).not.toBeInTheDocument();
  });

  it('marks the Graveyard current on its Map view and the Ghost Cam current with the Ask panel open', async () => {
    await renderAt('/graveyard?view=map');
    const nav = () => screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav()).getByRole('link', { current: 'page' })).toHaveAccessibleName(/^Graveyard/);
  });

  it('marks the Ghost Cam current while the Ask panel is open', async () => {
    await renderAt('/run/2026-11-03-listener-pay-bill/step/9?ask=open');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveAccessibleName(/^Ghost Cam/);
  });

  it('opens and closes the menu with the Menu button, which names the list', async () => {
    const user = userEvent.setup();
    await renderAt('/');
    const button = screen.getByRole('button', { name: 'Menu' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', nav.id);
    expect(nav.className).not.toMatch(/open/);

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(nav.className).toMatch(/open/);

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape from a link and moves focus to the Menu button', async () => {
    const user = userEvent.setup();
    await renderAt('/');
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')[2]!.focus();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes when a link is followed', async () => {
    const user = userEvent.setup();
    const { router } = await renderAt('/');
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /^Graveyard/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/graveyard'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves the Ghost Cam out when there are no runs', async () => {
    renderApp('/', memorySource([]));
    await screen.findByRole('heading', { level: 1 });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((l) => l.querySelector('[class*="navLabel"]')?.textContent)).toEqual([
      'Home',
      'Graveyard',
      'Exorcise',
      'Spec Coverage',
    ]);
  });
});
