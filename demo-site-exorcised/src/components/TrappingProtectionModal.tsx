import { useEffect, useId, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { calculateTotal, formatCurrency } from '../utils/currency';
import styles from './TrappingProtectionModal.module.css';

export interface TrappingProtectionModalProps {
  isOpen: boolean;
  /** May return a promise; the modal never waits on it beyond its own 800ms indicator. */
  onContinue: (addOnSelected: boolean) => void | Promise<void>;
  onClose: () => void;
  /** Bill amount in rupees (without the add-on). */
  amount: number;
  /** Element that gets focus back when the dialog closes. Falls back to the element focused at open. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const PROCESSING_INDICATOR_MS = 800;
const STOP_SELECTOR = 'input, a[href], button:not([disabled])';

/**
 * The dialog is keyboard operable: Tab and Shift+Tab visit the checkbox, Learn more, Continue and
 * Close in order and wrap at the ends, Escape closes it, and focus returns to the opener on close.
 * Still deliberate: backdrop clicks do not close the dialog, and the add-on checkbox is checked on
 * every open.
 */
export function TrappingProtectionModal(props: TrappingProtectionModalProps) {
  // Mounting the content only while open resets the checkbox to checked on every open.
  return props.isOpen ? <ModalContent {...props} /> : null;
}

function ModalContent({ onContinue, onClose, amount, returnFocusRef }: TrappingProtectionModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const explanationId = useId();
  const [addOn, setAddOn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Fallback opener: whatever had focus when the dialog first rendered.
  const openerRef = useRef<Element | null>(document.activeElement);
  // Keep the latest callback and ref without re-subscribing the effects below.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRefRef = useRef(returnFocusRef);
  returnFocusRefRef.current = returnFocusRef;

  // Focus the checkbox on open; on any close, hand focus back to the opener.
  useEffect(() => {
    checkboxRef.current?.focus();
    return () => {
      const target = returnFocusRefRef.current?.current ?? openerRef.current;
      if (target instanceof HTMLElement && target.isConnected) {
        target.focus();
      }
    };
  }, []);

  // Escape closes. Tab and Shift+Tab wrap at the ends and otherwise use native order.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const stops = Array.from(dialog.querySelectorAll<HTMLElement>(STOP_SELECTOR));
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  function toggleExplanation(event: ReactMouseEvent) {
    event.preventDefault();
    setExpanded(prev => !prev);
  }

  function handleLearnMoreKey(event: ReactKeyboardEvent<HTMLAnchorElement>) {
    // Anchors activate on Enter natively; make Space behave the same.
    if (event.key === ' ') {
      event.preventDefault();
      setExpanded(prev => !prev);
    }
  }

  function handleContinue() {
    if (processing) return;
    setProcessing(true);
    void onContinue(addOn);
    window.setTimeout(() => setProcessing(false), PROCESSING_INDICATOR_MS);
  }

  return (
    // No onClick on the backdrop: clicking outside never closes the dialog.
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('modal.protectHeading')}
      >
        <h2 className={styles.heading}>{t('modal.protectHeading')}</h2>

        <div className={styles.option}>
          <input
            ref={checkboxRef}
            id="add-on-checkbox"
            type="checkbox"
            className={styles.checkbox}
            checked={addOn}
            onChange={e => setAddOn(e.target.checked)}
          />
          <label htmlFor="add-on-checkbox" className={styles.optionLabel}>
            <span className={styles.optionText}>{t('modal.addOnText')}</span>
            <span className={styles.optionDescription}>{t('modal.addOnDescription')}</span>
          </label>
        </div>

        <a
          href="#learn-more"
          role="button"
          className={styles.learnMore}
          aria-expanded={expanded}
          aria-controls={explanationId}
          onClick={toggleExplanation}
          onKeyDown={handleLearnMoreKey}
        >
          {t('modal.learnMore')}
        </a>
        <p id={explanationId} className={styles.explanation} hidden={!expanded}>
          {t('modal.learnMoreExpanded')}
        </p>

        <p className={styles.total}>
          {t('summary.total')}: <strong>{formatCurrency(calculateTotal(amount, addOn))}</strong>
        </p>

        <button
          type="button"
          className={styles.continueButton}
          onClick={handleContinue}
          disabled={processing}
          aria-busy={processing}
        >
          {processing ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              {t('modal.processing')}
            </>
          ) : (
            t('modal.continue')
          )}
        </button>

        {/* Last in DOM order so Tab ends here; absolutely positioned, so layout is unchanged. */}
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t('accessibility.closeDialog')}
          onClick={onClose}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TrappingProtectionModal;
