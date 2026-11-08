// When the run was recorded, which commit of which site, and how to reproduce it.

import { useId, useRef, useState } from 'react';
import type { Run } from '../data/types';
import { scrollKeys, useScrollOverflow } from '../hooks/useScrollOverflow';
import { formatLocalDateTime } from '../model/format';
import { reproduceCommand } from '../model/reproduce';
import { useAnnounce } from './layout/LiveRegion';
import styles from './ProvenancePanel.module.css';

function selectText(element: HTMLElement | null): void {
  if (!element) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function ProvenancePanel({
  run,
  heading = 'Where this run came from',
  commandLabel = 'Reproduce command',
  collapsible = false,
}: {
  run: Run;
  heading?: string;
  /** Accessible name of the command box. Must be unique when a screen shows more than one panel. */
  commandLabel?: string;
  /** Renders the heading as a disclosure button; the body starts collapsed for each run. */
  collapsible?: boolean;
}) {
  const announce = useAnnounce();
  const bodyId = useId();
  // Open state is keyed on the run, so a different run starts collapsed again.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const expanded = !collapsible || openKey === run.key;
  const commandRef = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const overflowing = useScrollOverflow(box, 'x');
  const command = reproduceCommand(run);

  // Copies `command` from this render, never the DOM text, so layout can't add or remove characters.
  // The button is never disabled: on failure the text is selected so it can be copied by hand.
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(command);
    } catch {
      selectText(commandRef.current);
      announce("Couldn't copy. Select the command and copy it yourself.");
      return;
    }
    // Only reached once writeText has resolved.
    announce('Command copied');
  };

  return (
    <section className={styles.panel} aria-label={heading}>
      {collapsible && (
        <h2 className={styles.heading}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setOpenKey(expanded ? null : run.key)}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'} </span>
            {heading}
          </button>
        </h2>
      )}
      <dl id={bodyId} className={styles.list} hidden={!expanded}>
        <div>
          <dt>Recorded</dt>
          <dd>
            <time dateTime={run.startedAt}>{formatLocalDateTime(run.startedAt)}</time>{' '}
            <span className="muted">(your time; original {run.startedAt})</span>
          </dd>
        </div>
        <div>
          <dt>Site commit</dt>
          <dd>
            <code>{run.site.commit}</code>
          </dd>
        </div>
        <div>
          <dt>Site URL</dt>
          <dd>
            <code>{run.site.url}</code>
          </dd>
        </div>
        <div>
          <dt>Reproduce</dt>
          <dd className={styles.command}>
            {/* Scrolls sideways so the command never breaks mid-word; focusable only while it can scroll. */}
            <div
              ref={box}
              className={styles.commandBox}
              role="region"
              aria-label={commandLabel}
              tabIndex={overflowing ? 0 : undefined}
              onKeyDown={scrollKeys('x')}
            >
              <code ref={commandRef} className={styles.code}>
                {command}
              </code>
            </div>
            <button type="button" className="button" onClick={() => void copy()}>
              Copy command
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
