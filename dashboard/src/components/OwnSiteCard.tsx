// Home's "Haunt your own site" card: a short block of commands that can be copied, and a link to
// the README that explains the two small files they need.

import { Fragment, useRef } from 'react';
import { scrollKeys, useScrollOverflow } from '../hooks/useScrollOverflow';
import { OWN_SITE_BLOCK, OWN_SITE_COMMANDS, splitAtFlags } from '../model/ownSite';
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
  const box = useRef<HTMLPreElement>(null);
  const overflowing = useScrollOverflow(box, 'x');

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
      {/* Lines break only between flags. If one flag and its value are wider than the card, the block
          scrolls sideways and takes focus so the keyboard can reach the rest. */}
      <pre
        ref={box}
        className={styles.block}
        role="region"
        aria-label="Commands"
        tabIndex={overflowing ? 0 : undefined}
        data-keys="own"
        onKeyDown={scrollKeys('x')}
      >
        <code ref={block}>
          {OWN_SITE_COMMANDS.map((line, i) => (
            <Fragment key={line}>
              {i > 0 && '\n'}
              {splitAtFlags(line).map((part, j) => (
                <Fragment key={j}>
                  {j > 0 && ' '}
                  <span className={styles.flag}>{part}</span>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </code>
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
