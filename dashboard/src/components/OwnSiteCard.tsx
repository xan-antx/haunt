// Home's "Haunt your own site" card: a short block of commands that can be copied, and a link to
// the README that explains the two small files they need.

import { useRef } from 'react';
import { OWN_SITE_BLOCK } from '../model/ownSite';
import { repoFileUrl } from '../model/repo';
import { useAnnounce } from './layout/LiveRegion';
import styles from './OwnSiteCard.module.css';

function selectText(element: HTMLElement | null): void {
  if (!element) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function OwnSiteCard() {
  const announce = useAnnounce();
  const block = useRef<HTMLElement>(null);

  // Copies the constant, never the DOM text. On failure the text is selected so it can be copied by hand.
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(OWN_SITE_BLOCK);
    } catch {
      selectText(block.current);
      announce("Couldn't copy. Select the commands and copy them yourself.");
      return;
    }
    announce('Commands copied');
  };

  return (
    <section aria-labelledby="own-site-heading" className={styles.card} data-testid="own-site-card">
      <h2 id="own-site-heading" className={styles.title}>
        Haunt your own site
      </h2>
      <p>
        Start your site on this computer, write a short mission file for the task you care about, and send a ghost
        through it. You can only send ghosts to your own sites, or to local copies of open-source sites.
      </p>
      <pre className={styles.block}>
        <code ref={block}>{OWN_SITE_BLOCK}</code>
      </pre>
      <p className={styles.actions}>
        <button type="button" className="button" onClick={() => void copy()}>
          Copy commands
        </button>{' '}
        <a href={repoFileUrl('README.md#haunt-your-own-site')}>Read how to write the two files</a>
      </p>
    </section>
  );
}
