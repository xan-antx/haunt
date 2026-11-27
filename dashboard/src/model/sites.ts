// What each tested site is, in one plain sentence, for visitors who have never heard of it, and
// plain names for its pages. Keyed by the run files' exact `site.name`. A site that is not listed
// shows no Site_About, and its pages get names built from their paths.

import { originalSiteName } from './fixedCopy';

export interface SiteAbout {
  /** One plain sentence saying what the site is. */
  description: string;
  /** A link to a copy of the site that we own and host, so visitors can try it themselves. */
  tryLink?: { label: string; href: string };
  /** Plain page names for paths whose name can't be read from the path, such as "/". */
  pageNames?: Readonly<Record<string, string>>;
  /** Where to read the source of a site we did not build. */
  sourceLink?: { label: string; href: string };
}

const SITE_ABOUT: Readonly<Record<string, SiteAbout>> = {
  'Lantern Bills demo': {
    description:
      'Lantern Bills is a sample electricity bill-payment site we built for this demo, with six accessibility and usability problems hidden in it for the ghosts to find.',
    tryLink: { label: 'Try Lantern Bills yourself', href: 'https://xan-antx.github.io/haunt/lantern-bills/' },
    // demo-site/src/App.tsx serves the bill at "/".
    pageNames: { '/': 'the bill page' },
  },
  Memos: {
    description:
      'Memos is an open-source note-taking site that we did not build. Haunt runs its own copy on our own computer and sends The Listener in to write a note.',
    sourceLink: { label: 'Memos on GitHub', href: 'https://github.com/usememos/memos' },
    pageNames: { '/': 'the notes page', '/auth': 'the sign-in page' },
  },
};

/**
 * A site's name as shown to readers: "Lantern Bills demo" is "Lantern Bills" and its fixed copy
 * "Lantern Bills demo (exorcised)" is "Lantern Bills (fixed copy)" (UI-24).
 */
export function siteLabel(siteName: string): string {
  const original = originalSiteName(siteName);
  const base = (original ?? siteName).replace(/\s+\(?demo\)?\s*$/i, '').trim() || (original ?? siteName);
  return original === null ? base : `${base} (fixed copy)`;
}

/**
 * A site's name for cards, maps and menus: the fixed copy reads "Lantern Bills (fixed copy)" and
 * every other name is shown as the run file wrote it. The run files are never changed.
 */
export function displayName(siteName: string): string {
  return originalSiteName(siteName) === null ? siteName : siteLabel(siteName);
}

const LOCAL_ADDRESS = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/[^\s"')]*)?/gi;

/** A step's action in plain words: a local address becomes the page's name ("Open the bill page"). */
export function plainAction(siteName: string, action: string): string {
  return action.replace(LOCAL_ADDRESS, (_all, path: string | undefined) => pageName(siteName, path ?? '/'));
}

/** Plain words for a mission, keyed by the run file's `mission.id` (UI-05, UI-06). */
export interface MissionWords {
  /** Short task for headings and titles, instead of the engine's long goal. */
  goal?: string;
  /** After "couldn't" or "managed to", for example "save the note". */
  verbPhrase?: string;
  /** After "I finished at step 14 and", for example "paid the bill". */
  done?: string;
  /** A plain title for the mission's requirement on Spec Coverage (UI-03). */
  title?: string;
  /** The file that holds the requirement, relative to the repository root. */
  requirementFile?: string;
}

const MISSION_WORDS: Readonly<Record<string, MissionWords>> = {
  'pay-bill': {
    done: 'paid the bill',
    title: 'Pay a bill with a valid card',
    requirementFile: '.kiro/specs/lantern-bills/requirements.md',
  },
  'write-note': {
    goal: 'Write and save a note in Memos',
    verbPhrase: 'save the note',
    done: 'saved the note',
    title: 'Write and save a note',
    requirementFile: '.kiro/specs/memos-real-world-haunt/requirements.md',
  },
};

export function missionWords(missionId: string): MissionWords {
  return Object.hasOwn(MISSION_WORDS, missionId) ? MISSION_WORDS[missionId]! : {};
}

/** The goal as shown on screen: the mission's short task when it has one, else the run's own goal. */
export function displayGoal(mission: { id: string; goal: string }): string {
  return missionWords(mission.id).goal ?? mission.goal;
}

/** Where the fixed copy of Lantern Bills is published, by its run-file name (UI-22). */
const FIXED_COPY_TRY: Readonly<Record<string, { label: string; href: string }>> = {
  'Lantern Bills demo (exorcised)': {
    label: 'Try the fixed copy',
    href: 'https://xan-antx.github.io/haunt/lantern-bills-exorcised/',
  },
};

/** A link to try a fixed copy yourself, or null when the site has no published fixed copy. */
export function fixedCopyTryLink(siteName: string): { label: string; href: string } | null {
  return Object.hasOwn(FIXED_COPY_TRY, siteName) ? FIXED_COPY_TRY[siteName]! : null;
}

/** The entry for a Haunt's `site.name`, or null when the site is not in the table. */
export function siteAbout(siteName: string): SiteAbout | null {
  return Object.hasOwn(SITE_ABOUT, siteName) ? SITE_ABOUT[siteName]! : null;
}

/** The path without its query, hash and trailing slashes; "/" stays "/". */
function cleanPath(page: string): string {
  const path = page.trim().split(/[?#]/)[0] ?? '';
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Page_Name (Req 24.8): a plain name for a page path, for use in sentences instead of the path.
 * The site's table wins. Otherwise "/" is "the home page" and "/pay-now/" is "the pay now page",
 * named after the last part of the path.
 */
export function pageName(siteName: string, page: string): string {
  const path = cleanPath(page);
  // A fixed copy has the same pages as its original, so it uses the original's page names.
  const named = siteAbout(originalSiteName(siteName) ?? siteName)?.pageNames;
  if (named && Object.hasOwn(named, path)) return named[path]!;
  if (path === '/') return 'the home page';
  const last = path.split('/').filter(Boolean).pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // Keep the raw text when it is not valid percent-encoding.
  }
  const words = decoded
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
  return words === '' ? 'this page' : `the ${words} page`;
}
