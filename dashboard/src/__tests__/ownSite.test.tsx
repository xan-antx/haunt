// "Haunt your own site" card on Home: a block of commands that matches the README word for word.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWN_SITE_BLOCK, OWN_SITE_COMMANDS } from '../model/ownSite';
import { memorySource, renderApp } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Haunt your own site', () => {
  it('shows the commands before any run has loaded, with a link to the README', async () => {
    renderApp('/', memorySource([]));
    const card = within(await screen.findByTestId('own-site-card'));
    expect(card.getByRole('heading', { level: 2, name: 'Haunt your own site' })).toBeInTheDocument();
    for (const line of OWN_SITE_COMMANDS) expect(screen.getByTestId('own-site-card').textContent).toContain(line);
    expect(card.getByRole('link', { name: /Read how to write the two files/ })).toHaveAttribute(
      'href',
      expect.stringContaining('README.md#haunt-your-own-site'),
    );
  });

  it('copies exactly the commands and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/', memorySource([]));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy commands' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(OWN_SITE_BLOCK));
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent('Commands copied'));
  });

  it('says it could not copy when there is no clipboard, and keeps the button usable', async () => {
    renderApp('/', memorySource([]));
    const button = await screen.findByRole('button', { name: 'Copy commands' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('live-region')).toHaveTextContent(/Couldn't copy/));
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('uses the same command lines as the README', () => {
    const readme = readFileSync(join(process.cwd(), '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const section = readme.slice(readme.indexOf('## Haunt your own site'), readme.indexOf('## What needs a Kiro account'));
    for (const line of OWN_SITE_COMMANDS) expect(section).toContain(line);
  });
});
