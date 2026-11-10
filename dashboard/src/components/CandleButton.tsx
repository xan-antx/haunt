// A primary action. A lit, flickering candle means the action is available.
// An unlit candle means it is not: the control stays focusable, is marked aria-disabled,
// does nothing when activated, and shows its reason as visible text.

import { useId, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './CandleButton.module.css';

function Candle({ lit }: { lit: boolean }) {
  return (
    <svg className={styles.candle} viewBox="0 0 24 40" aria-hidden="true" focusable="false">
      {lit ? (
        <path className={`${styles.flame} motion-flame`} d="M12 2 C16 8 17 11 17 14 a5 5 0 0 1 -10 0 C7 11 9 7 12 2 Z" />
      ) : (
        <path className={styles.smoke} d="M12 16 c-2 -3 2 -5 0 -8 c-2 -3 2 -5 0 -7" />
      )}
      <path className={styles.wick} d="M12 15 v4" />
      <rect className={styles.wax} x="7" y="19" width="10" height="19" rx="2" />
    </svg>
  );
}

interface Common {
  children: ReactNode;
  /** Shown as visible text under the button when the candle is unlit. */
  reason?: string;
  className?: string;
  /** Id of the link or button itself. */
  id?: string;
  /**
   * Accessible name when it must say more than the visible text. It must start with the visible
   * text, so voice control and WCAG 2.5.3 still work.
   */
  label?: string;
}

export type CandleButtonProps = Common &
  (
    | { lit: true; to: string; onClick?: never }
    | { lit: true; onClick: (event: MouseEvent<HTMLButtonElement>) => void; to?: never }
    | { lit: false }
  );

export function CandleButton(props: CandleButtonProps) {
  const reasonId = useId();
  const cls = [styles.button, props.lit ? styles.lit : styles.unlit, props.className ?? ''].filter(Boolean).join(' ');

  if (!props.lit) {
    return (
      <span className={styles.wrap}>
        <button
          id={props.id}
          type="button"
          className={cls}
          aria-label={props.label}
          aria-disabled="true"
          aria-describedby={props.reason ? reasonId : undefined}
          onClick={(event) => event.preventDefault()}
        >
          <Candle lit={false} />
          <span>{props.children}</span>
        </button>
        {props.reason && (
          <span id={reasonId} className={styles.reason}>
            {props.reason}
          </span>
        )}
      </span>
    );
  }

  if ('to' in props && props.to !== undefined) {
    return (
      <span className={styles.wrap}>
        <Link id={props.id} to={props.to} className={cls} aria-label={props.label}>
          <Candle lit />
          <span>{props.children}</span>
        </Link>
      </span>
    );
  }

  return (
    <span className={styles.wrap}>
      <button id={props.id} type="button" className={cls} aria-label={props.label} onClick={props.onClick}>
        <Candle lit />
        <span>{props.children}</span>
      </button>
    </span>
  );
}
