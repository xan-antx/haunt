# Bugfix Requirements Document

## Introduction

Four planted problems remain in `demo-site-exorcised/`. This spec fixes them the accessible way. The haunted original in `demo-site/` is out of scope and must not change.

1. Card validation errors (`SilentCardErrors`) are visible but never announced, and the card inputs are not linked to them.
2. The late banner (`LateBanner`) arrives 1500 ms after render and reserves no space, so the content below it jumps down.
3. The Payment summary total (`OverflowingSummary`) is cut off at viewport widths of 640 px and narrower.
4. The paid add-on checkbox in the "Protect your payment" dialog is ticked by default, and the Punjabi and Hindi translation files lack "Pay this bill" (`payBillButton`) and the card errors (`validation.cardNumber`, `validation.expiry`, `validation.cvv`).

The pay button fix (accessible name) and the dialog fixes (keyboard order, Escape, focus return) from `exorcised-payment-a11y-fix` stay as they are. Tests that assert the planted behavior of these four problems are updated to assert the fixed behavior. None is deleted or weakened.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a card field (number, expiry, CVV) fails validation THEN the system shows the error as plain red text with no `role="alert"` or `aria-live`, so a screen reader announces nothing

1.2 WHEN a card field is invalid THEN the system leaves the input without `aria-describedby` and `aria-invalid`, so a screen reader user who focuses the field hears no error

1.3 WHEN the bill page renders THEN the system reserves no space for the banner (no `aspect-ratio`, `min-height`, or `width` and `height` attributes on the image), and 1500 ms later the image and the offer text appear and push everything below them down by 100 px or more

1.4 WHEN the viewport is 640 px wide or narrower THEN the system sets the Payment summary to a fixed 180 px width with `overflow: hidden` and `white-space: nowrap`, so the end of the total (for example "₹2,490.00") is clipped and cannot be reached

1.5 WHEN the "Protect your payment" dialog opens THEN the system ticks the paid add-on checkbox ("Payment protection for ₹99") by default, so a user who just presses Continue is charged ₹99 more than the bill

1.6 WHEN the language is Punjabi or Hindi THEN the system shows the English "Pay this bill" button text and the English card error messages, because `payBillButton`, `validation.cardNumber`, `validation.expiry` and `validation.cvv` are missing from the pa and hi translation files

### Expected Behavior (Correct)

2.1 WHEN a card field fails validation THEN the system SHALL render its error inside an element with `role="alert"`, so a screen reader announces it when it appears

2.2 WHEN a card field is invalid THEN the system SHALL set `aria-invalid="true"` and `aria-describedby` on its input, pointing to the `id` of that field's error element (`card-number-error`, `card-expiry-error`, `card-cvv-error`), and SHALL remove both attributes when the field is valid

2.3 WHEN the bill page renders THEN the system SHALL reserve the banner's space before it loads (a 4:1 aspect ratio matching the 1200x300 asset, the same 120 px minimum height before and after load, and `width` and `height` attributes on the image) and SHALL reserve the offer text's space before the banner loads, so that no content moves when the banner and offer arrive

2.4 WHEN the viewport is 640 px wide or narrower THEN the system SHALL keep the whole Payment summary total readable by letting the summary fit its container and the total wrap (`white-space: normal`, `overflow-wrap: anywhere`), with no fixed width and no clipping

2.5 WHEN the dialog opens THEN the system SHALL leave the paid add-on checkbox unticked, show the total without the ₹99 add-on, and call `onContinue(false)` if the user presses Continue without touching it

2.6 WHEN the language is Punjabi or Hindi THEN the system SHALL show a translated "Pay this bill" button and translated card error messages, taken from `pa/translation.json` and `hi/translation.json`, so pa and hi define every key that en defines

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the pay button is focused THEN the system SHALL CONTINUE TO expose it as a button named "Pay now" ("ਭੁਗਤਾਨ ਕਰੋ", "अभी भुगतान करें"), submit the form, respect `disabled`, and keep its icon and styling

3.2 WHEN the dialog is open THEN the system SHALL CONTINUE TO move Tab and Shift+Tab through the checkbox, Learn more, Continue and Close, close on Escape, return focus to the opener, and keep `role="dialog"`, `aria-modal="true"`, the accessible name "Protect your payment" and initial focus on the checkbox

3.3 WHEN a user toggles the add-on THEN the system SHALL CONTINUE TO update the total, and WHEN Continue is activated THEN the system SHALL CONTINUE TO call `onContinue` with the checkbox state and show the 800 ms processing indicator. Each time the dialog is reopened, the checkbox SHALL CONTINUE TO reset to its default (now unticked)

3.4 WHEN a user clicks the dialog backdrop THEN the system SHALL CONTINUE TO leave the dialog open, since that planted behavior is not named by this spec

3.5 WHEN the card number, expiry or CVV is valid, or the cardholder name is validated THEN the system SHALL CONTINUE TO show no card error, and the cardholder name error SHALL CONTINUE TO use `FormField`'s own alert

3.6 WHEN the banner loads THEN the system SHALL CONTINUE TO set the image `src` at exactly 1500 ms, call `onLoaded` once, add no Autopay link before then, and show the offer text and terms once loaded

3.7 WHEN the viewport is wider than 640 px THEN the system SHALL CONTINUE TO render the Payment summary with `width: auto` and no clipping

3.8 WHEN the usage chart or any other component is used THEN the system SHALL CONTINUE TO behave exactly as before, including the usage chart's planted problem, and the `?lang=` handling and English fallback for every other key SHALL CONTINUE TO work

3.9 WHEN `demo-site/` is built or tested THEN the system SHALL CONTINUE TO behave exactly as before, with all its planted problems intact
