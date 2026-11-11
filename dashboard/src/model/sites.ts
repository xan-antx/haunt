// What each tested site is, in one plain sentence, for visitors who have never heard of it, and
// plain names for its pages. Keyed by the run files' exact `site.name`. A site that is not listed
// shows no Site_About, and its pages get names built from their paths.

export interface SiteAbout {
  /** One plain sentence saying what the site is. */
  description: string;
  /** A link to a copy of the site that we own and host, so visitors can try it themselves. */
  tryLink?: { label: string; href: string };
  /** Plain page names for paths whose name can't be read from the path, such as "/". */
  pageNames?: Readonly<Record<string, string>>;
}

const SITE_ABOUT: Readonly<Record<string, SiteAbout>> = {
  'Lantern Bills demo': {
    description:
      'Lantern Bills is a sample electricity bill-payment site we built for this demo, with six accessibility and usability problems hidden in it for the ghosts to find.',
    tryLink: { label: 'Try Lantern Bills yourself', href: 'https://xan-antx.github.io/haunt/lantern-bills/' },
    // demo-site/src/App.tsx serves the bill at "/".
    pageNames: { '/': 'the bill page' },
  },
};

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
  const named = siteAbout(siteName)?.pageNames;
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
