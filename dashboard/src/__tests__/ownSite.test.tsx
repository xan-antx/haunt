// "Haunt your own site" card on Home: a block of commands that matches the README word for word.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWN_SITE_BLOCK, OWN_SITE_COMMANDS, splitAtFlags } from '../model/ownSite';
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

  it('keeps each flag with its value, so a line can only break between flags', async () => {
    renderApp('/', memorySource([]));
    const card = await screen.findByTestId('own-site-card');
    const parts = splitAtFlags(OWN_SITE_COMMANDS[3]!);
    expect(parts).toEqual([
      'npm run haunt -- run',
      '--ghost listener',
      '--mission my-mission',
      '--url http://localhost:3000',
      '--site my-site',
      '--config ../my-haunt/haunt.config.json',
      '--missions ../my-haunt/missions',
      '--out ../my-haunt/runs',
    ]);
    expect(parts.join(' ')).toBe(OWN_SITE_COMMANDS[3]);
    // On screen each part is one unbreakable span, and the text of the block is the copied text.
    const spans = [...card.querySelectorAll('pre code span')].map((s) => s.textContent);
    for (const part of parts) expect(spans).toContain(part);
    expect(card.querySelector('pre code')!.textContent).toBe(OWN_SITE_BLOCK);
  });

  it('uses the same command lines as the README', () => {
    const readme = readFileSync(join(process.cwd(), '..', 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const section = readme.slice(readme.indexOf('## Haunt your own site'), readme.indexOf('## What needs a Kiro account'));
    for (const line of OWN_SITE_COMMANDS) expect(section).toContain(line);
  });
});
