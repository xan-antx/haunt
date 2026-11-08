import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
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
}

const PROCESSING_INDICATOR_MS = 800;

/**
 * PROBLEM 2 (deliberate): keyboard trap with mouse-only controls.
 *  - Tab / Shift+Tab cycle only between the add-on checkbox and the Learn more link.
 *  - Continue and Close have tabIndex={-1} and are never reachable by keyboard.
 *  - Escape and backdrop clicks do not close the dialog.
 *  - The add-on checkbox is checked on every open.
 * Do not "fix" any of these.
 */
export function TrappingProtectionModal(props: TrappingProtectionModalProps) {
  // Mounting the content only while open resets the checkbox to checked on every open.
  return props.isOpen ? <ModalContent {...props} /> : null;
}

function ModalContent({ onContinue, onClose, amount }: TrappingProtectionModalProps) {
  const { t } = useTranslation();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const learnMoreRef = useRef<HTMLAnchorElement>(null);
  const explanationId = useId();
  const [addOn, setAddOn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Move focus to the checkbox when the modal opens.
  useEffect(() => {
    checkboxRef.current?.focus();
  }, []);

  // Keyboard trap: Tab and Shift+Tab only ever alternate between the two focusable controls.
  useEffect(() => {
    function trapTab(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const active = document.activeElement;
      if (active === checkboxRef.current) {
        learnMoreRef.current?.focus();
      } else {
        checkboxRef.current?.focus();
      }
    }
    document.addEventListener('keydown', trapTab, true);
    return () => document.removeEventListener('keydown', trapTab, true);
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
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('modal.protectHeading')}
      >
        <button
          type="button"
          className={styles.closeButton}
          tabIndex={-1}
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
          ref={learnMoreRef}
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
          tabIndex={-1}
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
      </div>
    </div>
  );
}

export default TrappingProtectionModal;
