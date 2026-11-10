// What each tested site is, in one plain sentence, for visitors who have never heard of it.
// Keyed by the run files' exact `site.name`. A site that is not listed shows nothing extra.

export interface SiteAbout {
  /** One plain sentence saying what the site is. */
  description: string;
  /** A link to a copy of the site that we own and host, so visitors can try it themselves. */
  tryLink?: { label: string; href: string };
}

const SITE_ABOUT: Readonly<Record<string, SiteAbout>> = {
  'Lantern Bills demo': {
    description:
      'Lantern Bills is a sample electricity bill-payment site we built for this demo, with six accessibility and usability problems hidden in it for the ghosts to find.',
    tryLink: { label: 'Try Lantern Bills yourself', href: 'https://xan-antx.github.io/haunt/lantern-bills/' },
  },
};

/** The entry for a Haunt's `site.name`, or null when the site is not in the table. */
export function siteAbout(siteName: string): SiteAbout | null {
  return Object.hasOwn(SITE_ABOUT, siteName) ? SITE_ABOUT[siteName]! : null;
}
