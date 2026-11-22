# Bugfix Requirements Document

## Introduction

Two planted accessibility problems in `demo-site-exorcised/` are being fixed. The haunted original in `demo-site/` is out of scope and must not change.

1. The payment form's submit button (`UnlabeledPayButton`) is icon-only and has no accessible name, so screen reader users hear only "button".
2. The "Protect your payment" dialog (`TrappingProtectionModal`) traps keyboard users. Tab only alternates between the add-on checkbox and the Learn more link, Continue and Close are not reachable by keyboard, and Escape does nothing. Focus is also not returned to the opener when the dialog closes.

All other planted problems in `demo-site-exorcised/` stay as they are. Existing tests that assert the planted behavior of these two components are updated to assert the fixed behavior, not weakened or deleted.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a screen reader user focuses the payment form's submit button THEN the system exposes a button with no accessible name, so only "button" is announced

1.2 WHEN a keyboard user presses Tab or Shift+Tab inside the open "Protect your payment" dialog THEN the system cycles focus only between the add-on checkbox and the Learn more link, and never reaches Continue or Close

1.3 WHEN a keyboard user wants to activate Continue or Close THEN the system provides no way to do so, because both buttons have `tabIndex={-1}`

1.4 WHEN a keyboard user presses Escape while the dialog is open THEN the system leaves the dialog open

1.5 WHEN the dialog closes THEN the system does not return focus to the button that opened it

### Expected Behavior (Correct)

2.1 WHEN a screen reader user focuses the payment form's submit button THEN the system SHALL expose it as a button with a clear accessible name ("Pay now" in English, "ਭੁਗਤਾਨ ਕਰੋ" in Punjabi, "अभी भुगतान करें" in Hindi), taken from the translation files so it is localized

2.2 WHEN a keyboard user presses Tab or Shift+Tab inside the open dialog THEN the system SHALL move focus through the checkbox, Learn more, Continue and Close in order, without trapping focus on any subset of them

2.3 WHEN a keyboard user focuses Continue or Close and presses Enter or Space THEN the system SHALL activate that control, using native `<button>` elements that are focusable and not removed from the tab order

2.4 WHEN a keyboard user presses Escape while the dialog is open THEN the system SHALL close the dialog

2.5 WHEN the dialog closes (via Close, Escape or completing Continue) THEN the system SHALL return focus to the button that opened the dialog

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the payment submit button is clicked or activated THEN the system SHALL CONTINUE TO submit the form and respect its disabled state, with its icon and styling unchanged

3.2 WHEN the dialog opens THEN the system SHALL CONTINUE TO render with `role="dialog"`, `aria-modal="true"`, the accessible name "Protect your payment", focus on the add-on checkbox, and the checkbox checked on every open

3.3 WHEN a user toggles the add-on checkbox THEN the system SHALL CONTINUE TO update the displayed total, and WHEN Continue is activated THEN the system SHALL CONTINUE TO call `onContinue` with the add-on state and show the 800ms processing indicator

3.4 WHEN a user activates Learn more with mouse, Enter or Space THEN the system SHALL CONTINUE TO toggle the explanation text

3.5 WHEN a user clicks the dialog backdrop THEN the system SHALL CONTINUE TO leave the dialog open, since that planted behavior is not named by this spec

3.6 WHEN any other component in `demo-site-exorcised/` is used (late banner, overflowing summary, silent card errors, usage chart) THEN the system SHALL CONTINUE TO behave exactly as before, including its planted accessibility problems

3.7 WHEN `demo-site/` is built or tested THEN the system SHALL CONTINUE TO behave exactly as before, with all its planted problems intact
