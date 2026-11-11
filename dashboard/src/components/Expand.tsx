// A disclosure for text that is cut to one line (Req 10.29, 10.36): a small text button with
// aria-expanded, and a panel with the full text that opens over the content next to it, so
// opening it moves nothing on the page. Escape on the button or in the panel closes it and puts
// focus back on the button. Nothing traps focus.

import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { scrollKeys, useScrollOverflow } from '../hooks/useScrollOverflow';
import styles from './Expand.module.css';

export function ExpandButton({
  open,
  controls,
  onToggle,
  onClose,
  buttonRef,
  className,
  children,
}: {
  open: boolean;
  /** The id of the ExpandPanel. */
  controls: string;
  onToggle: () => void;
  onClose: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
  className?: string;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.more} ${className ?? ''}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <span className={styles.chevron} aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
      {children}
    </button>
  );
}

export function ExpandPanel({
  id,
  open,
  label,
  placement,
  onClose,
  children,
}: {
  id: string;
  open: boolean;
  /** The panel's accessible name, the same words as its button. */
  label: string;
  /** Where the panel opens: under the line or over the content above it. */
  placement: 'below' | 'above';
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Focusable only while it scrolls, so a keyboard user can read all of it (Req 18.1).
  const scrolls = useScrollOverflow(ref, 'y');
  const arrows = scrollKeys('y');
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.currentTarget === event.target) arrows(event);
  };
  return (
    <div
      ref={ref}
      id={id}
      role="region"
      aria-label={label}
      hidden={!open}
      tabIndex={open && scrolls ? 0 : undefined}
      className={`${styles.panel} ${placement === 'above' ? styles.above : styles.below}`}
      onKeyDown={onKeyDown}
    >
      {/* The full text is only in the DOM while open, so it is never read or found twice. */}
      {open && children}
    </div>
  );
}
