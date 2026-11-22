# Exorcised Payment Accessibility Fix Bugfix Design

## Overview

Two planted accessibility problems in `demo-site-exorcised/` are fixed. `demo-site/` is the haunted original and is not touched.

1. **Problem 1, unlabeled pay button.** `UnlabeledPayButton` renders an icon-only `<button type="submit">` with no accessible name. The fix gives it an accessible name from the translation files.
2. **Problem 2, trapping protection dialog.** `TrappingProtectionModal` installs a capture-phase `keydown` handler that alternates focus between the checkbox and the Learn more link, sets `tabIndex={-1}` on Continue and Close, ignores Escape, and never returns focus to the opener. The fix removes the trap handler and the `tabIndex`, orders the controls so Tab visits all four, closes on Escape, and returns focus to the opener on every close.

Every other planted problem stays as is: late banner, overflowing summary, silent card errors, usage chart, incomplete pa/hi translations (`payBillButton`, `validation.cardNumber`, `validation.expiry`, `validation.cvv`), backdrop click not closing the dialog, and the checkbox being checked on every open. Tests that assert the planted behavior of the two fixed components are rewritten to assert the fixed behavior. They are not deleted or weakened.

## Glossary

- **Bug_Condition (C)**: An input that exercises one of the two planted defects: focusing/announcing the pay button, or using Tab, Shift+Tab, Enter/Space on Continue or Close, Escape, or closing the dialog.
- **Property (P)**: The accessible behavior required by bugfix.md clauses 2.1 to 2.5.
- **Preservation**: Behavior in bugfix.md clauses 3.1 to 3.7 that must not change.
- **UnlabeledPayButton**: `demo-site-exorcised/src/components/UnlabeledPayButton.tsx`, the icon-only submit button of the payment form. The component name is kept to limit the diff.
- **TrappingProtectionModal / ModalContent**: `demo-site-exorcised/src/components/TrappingProtectionModal.tsx`. The outer component mounts `ModalContent` only while `isOpen`, which is why the checkbox resets to checked on each open.
- **BillPage**: `demo-site-exorcised/src/pages/BillPage.tsx`. `PaymentFormSection` renders the pay button; `BillPage` owns `modalOpen` and renders the dialog. The pay button is the opener.
- **Opener**: The pay button (`form button[type="submit"]`) whose activation calls `handleSubmit` and then `setModalOpen(true)`.
- **Stop**: A focusable control inside the dialog. The four stops, in order, are the add-on checkbox, Learn more, Continue, Close.

## Bug Details

### Bug Condition

The bug manifests in two places.

- `UnlabeledPayButton` has no `aria-label`, `aria-labelledby`, `title` or text, so its accessible name is empty.
- In `ModalContent`, the `trapTab` effect calls `preventDefault()` on every Tab and moves focus only between `checkboxRef` and `learnMoreRef`. Continue and Close carry `tabIndex={-1}`. No handler listens for Escape. Nothing records or restores the opener.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserInteraction
  OUTPUT: boolean

  RETURN (input.target = payButton AND input.kind = "exposeToAssistiveTech")
      OR (input.target = dialog AND dialog.isOpen AND
            (input.kind IN ["Tab", "ShiftTab"]
             OR (input.kind IN ["Enter", "Space"] AND input.focused IN {Continue, Close})
             OR input.kind = "Escape"))
      OR (input.kind = "dialogClosed")
END FUNCTION
```

### Examples

- A screen reader focuses the pay button. Actual: "button". Expected: "Pay now, button".
- The dialog opens with focus on the checkbox. Tab, Tab, Tab. Actual: checkbox, Learn more, checkbox. Expected: Learn more, Continue, Close.
- Focus is on Learn more and Shift+Tab is pressed. Actual: checkbox. Expected: checkbox (this step is unchanged), and a further Shift+Tab from the checkbox wraps to Close.
- Escape is pressed with the dialog open. Actual: dialog stays open. Expected: dialog closes and `onClose` is called.
- The user closes the dialog with Close. Actual: focus is lost (document body). Expected: focus is on the pay button.
- Edge: the payment fails after Continue. `BillPage` calls `setModalOpen(false)`. Expected: focus returns to the pay button.
- Edge: payment succeeds and the app navigates to `/confirmation`. The pay button is unmounted. Expected: no error and no focus call on a detached element.
- Edge: the backdrop is clicked. Expected and unchanged: the dialog stays open.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The pay button still submits (`type="submit"`), still calls `onClick`, respects `disabled`, and keeps its arrow icon and CSS.
- The dialog keeps `role="dialog"`, `aria-modal="true"`, the accessible name "Protect your payment", initial focus on the checkbox, and a checkbox that is checked on every open.
- Toggling the checkbox updates the total. Continue calls `onContinue(addOn)` and shows the 800 ms processing indicator, with `aria-busy` set.
- Learn more toggles the explanation with click, Enter and Space, without navigation.
- Backdrop click does not close the dialog.
- The `?lang=` handling and the pa/hi fallback to English for `payBillButton` and the card validation messages.
- All other components in `demo-site-exorcised/`, and everything in `demo-site/`.

**Scope:**
All inputs outside the bug condition are unaffected. This includes mouse clicks on Continue, Close and the pay button, backdrop clicks, other keys inside the dialog, and every interaction with the late banner, summary, card error and chart components.

## Hypothesized Root Cause

The causes are visible in the code, so these are findings and not guesses.

1. **No accessible name**: `UnlabeledPayButton.tsx` renders an `aria-hidden` SVG as its only child and no label. The planted comment says not to add one.
2. **Tab trap**: the `trapTab` effect on `document` (capture phase) always calls `preventDefault()` and toggles between two refs.
3. **Removed from tab order**: `tabIndex={-1}` on `.closeButton` and `.continueButton`.
4. **DOM order**: the Close button is the first child of the dialog, so after removing the trap the native Tab order would be Close, checkbox, Learn more, Continue. Requirement 2.2 asks for checkbox, Learn more, Continue, Close. Close is absolutely positioned in CSS (`.closeButton { position: absolute; top: 1rem; right: 1rem }`), so moving it later in the DOM does not change layout.
5. **No Escape handling**: nothing listens for Escape.
6. **No focus return**: `ModalContent` never records `document.activeElement` and has no cleanup that restores it. Also, `fireEvent.click` and some browsers (Safari, Firefox on macOS) do not focus a button on click, so `document.activeElement` at mount cannot be relied on to be the opener.

## Correctness Properties

Property 1: Bug Condition - Pay button name, dialog keyboard operation and focus return

_For any_ input where the bug condition holds (isBugCondition returns true), the fixed code SHALL expose the pay button with a localized accessible name from the translation files, SHALL move Tab and Shift+Tab through the checkbox, Learn more, Continue and Close in order (wrapping at the ends), SHALL activate Continue and Close with Enter or Space as native buttons, SHALL close the dialog on Escape, and SHALL return focus to the pay button whenever the dialog closes.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Everything else behaves as before

_For any_ input where the bug condition does NOT hold (isBugCondition returns false), the fixed code SHALL produce the same result as the original code, preserving form submission and the disabled state, the dialog's role, name, initial focus and checked-on-open checkbox, the total, `onContinue` and the 800 ms indicator, Learn more toggling, backdrop clicks leaving the dialog open, all other planted problems, and `demo-site/`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

All paths are under `demo-site-exorcised/`. Nothing under `demo-site/` changes.

**File**: `src/components/UnlabeledPayButton.tsx`

**Specific Changes**:
1. **Accessible name**: call `useTranslation()` and add `aria-label={t('accessibility.payButton')}` to the button. Keep the SVG `aria-hidden`, the `type="submit"`, `disabled`, class names and icon unchanged.
2. **Pass the click event**: change `onClick` to `(event: MouseEvent<HTMLButtonElement>) => void` so `BillPage` can record the opener. Existing callers and `vi.fn()` in tests stay compatible.
3. **Comment**: replace the "PROBLEM 1 (deliberate)" block with a note that the button is labeled from `accessibility.payButton`.

**File**: `public/locales/{en,pa,hi}/translation.json`

1. Add `accessibility.payButton` to all three files: en "Pay now", pa "ਭੁਗਤਾਨ ਕਰੋ", hi "अभी भुगतान करें". It must exist in pa and hi so the name is localized (2.1). `translations.test.ts` still passes because it requires pa/hi to define every en key except the four deliberately missing ones. Do not add the key to `MISSING`.
2. Edit the files only with the file editing tools to keep UTF-8 intact.

**File**: `src/components/TrappingProtectionModal.tsx`

1. **New optional prop**: `returnFocusRef?: RefObject<HTMLElement | null>`. Inside `ModalContent`, capture `const openerRef = useRef(document.activeElement)` during the first render, before the focus effect runs. This is the fallback when no ref is passed.
2. **Remove the trap**: delete the `trapTab` effect and the `tabIndex={-1}` on Continue and Close.
3. **Reorder the DOM**: move the Close button after Continue so the native order is checkbox, Learn more, Continue, Close. Its class and absolute positioning are unchanged.
4. **One keydown effect on `document`** (capture phase, removed on unmount):
   - `Escape`: `preventDefault()` and call `onClose()`.
   - `Tab` / `Shift+Tab`: collect the enabled stops inside the dialog (`input, a[href], button:not([disabled])`). If focus is on the last stop and Tab is pressed, focus the first. If focus is on the first stop and Shift+Tab is pressed, focus the last. If focus is not inside the dialog (for example the Continue button became disabled while processing), focus the first stop. In every other case do nothing and let the browser move focus natively. This wrap keeps focus inside an `aria-modal` dialog without making any stop unreachable. Escape and Close always remain available.
5. **Focus return**: merge the existing focus effect into one effect. On mount it focuses the checkbox. Its cleanup focuses `returnFocusRef?.current ?? openerRef.current` if that element exists and `isConnected`. Cleanup runs on any close (Close, Escape, `isOpen` set to false after a failed payment) and is skipped safely when the page unmounts on navigation. React 18 StrictMode runs mount, cleanup, mount in development; the second mount refocuses the checkbox, so behavior is correct.
6. **Unchanged**: no `onClick` on the backdrop, `role`, `aria-modal`, `aria-label`, Learn more handlers, the 800 ms indicator, and the mount-only-while-open pattern. Update the "PROBLEM 2" comment to list backdrop click and the checked-by-default checkbox as the remaining deliberate behavior.

**File**: `src/pages/BillPage.tsx`

1. In `BillPage`, add `const openerRef = useRef<HTMLElement | null>(null)`.
2. Change `PaymentFormSection`'s `onSubmit` prop to `(event: MouseEvent<HTMLButtonElement>) => void`. `handleSubmit(event)` sets `openerRef.current = event.currentTarget` before `setModalOpen(true)`. Enter inside a form input triggers a synthetic click on the submit button, so `currentTarget` is still the pay button.
3. Pass `returnFocusRef={openerRef}` to `TrappingProtectionModal`. The `onClose`, `onContinue` and `amount` props are unchanged.

**File**: `src/components/TrappingProtectionModal.module.css`

1. Replace the "Problem 2: both of these are mouse-only" comment. No style changes. If the default browser focus ring is suppressed anywhere for these controls, leave it; only add a `:focus-visible` rule if testing shows no visible indicator, and flag it first.

## Testing Strategy

### Validation Approach

First surface counterexamples on the unfixed code, then confirm the fix and preservation. Run tests with `npm test` in `demo-site-exorcised/` (`vitest --run`). Do not start the dev server from a script.

### Exploratory Bug Condition Checking

**Goal**: Show the defects before fixing. Confirm the root causes above.

**Test Plan**: Add the new fixed-behavior assertions first and run them on the unfixed code.

**Test Cases**:
1. **Accessible name**: `getByRole('button', { name: 'Pay now' })` finds the submit button (fails on unfixed code, name is empty).
2. **Tab order**: `userEvent.tab()` four times from the checkbox reaches Learn more, Continue, Close, checkbox (fails: trap alternates two stops).
3. **Escape**: Escape calls `onClose` (fails).
4. **Focus return**: after Close the opener has focus (fails).
5. **Keyboard activation**: Enter and Space on Continue and Close (fails, `tabIndex={-1}` prevents focus).

**Expected Counterexamples**:
- Accessible name is `''`.
- Focus alternates checkbox, Learn more, checkbox, and `tabindex="-1"` is present on Continue and Close.

### Fix Checking

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedApp(input)
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  RETURN payButton.accessibleName = t("accessibility.payButton")
     AND tabOrder(dialog) = [checkbox, learnMore, continue, close] (wrapping)
     AND Enter/Space on continue or close activates it
     AND Escape closes the dialog
     AND focus after close = opener
END FUNCTION
```

### Preservation Checking

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalApp(input) = fixedApp(input)
END FOR
```

**Testing Approach**: Property-based testing fits preservation because the existing fast-check suites already generate many form, language and checkbox sequences. Run the full existing suite and check that only the tests listed below change.

**Test Plan**: Observe on unfixed code that the following pass, then confirm they pass unchanged after the fix.

**Test Cases**:
1. **Payment flow**: `payment-flow.properties.test.tsx` and `App.test.tsx` (open dialog, total, Continue, failure, Close by click). These find the submit button by `type="submit"`, so the new label does not affect them.
2. **Translations**: `translations.test.ts` and the pa/hi fallback tests in `polish.test.tsx` and `language.properties.test.tsx` (`payBillButton` still falls back to English; the Pay this bill button is unaffected by the new `Pay` name because the queries use exact names).
3. **Backdrop and other planted problems**: the existing "does not close when the backdrop is clicked" test and the tests for the banner, summary, card errors and chart.
4. **demo-site/**: no file changes there; `git diff -- demo-site` must be empty.

### Unit Tests

Existing tests to update (assert the fixed behavior, do not delete or weaken):

**`src/components/__tests__/UnlabeledPayButton.test.tsx`**
- Rename the describe to "UnlabeledPayButton (Problem 1 fixed: accessible name)".
- "has an empty accessible name" becomes "has the accessible name Pay now": `toHaveAccessibleName('Pay now')`.
- "has no aria-label, aria-labelledby, or title" becomes "is labeled from the translation file": `aria-label` equals `i18n.t('accessibility.payButton')`; also check the name is "ਭੁਗਤਾਨ ਕਰੋ" after `i18n.changeLanguage('pa')` and "अभी भुगतान करें" for `hi`.
- "has no text content" is replaced by "keeps the icon-only look": text content still empty, no visible text added.
- Keep unchanged: svg `aria-hidden="true"`, keyboard focusable, click calls `onClick`, disabled does not fire. Add: `type="submit"` is preserved.

**`src/components/__tests__/TrappingProtectionModal.test.tsx`**
- Rename the describe to "TrappingProtectionModal (Problem 2 fixed: keyboard operable)".
- Replace "Tab never reaches the Continue or Close controls" with "Tab and Shift+Tab visit checkbox, Learn more, Continue and Close in order and wrap", using `userEvent.setup()` and `user.tab()` / `user.tab({ shift: true })`. Use `pressTab` only for wrap checks at the ends.
- Replace "pulls focus back into the modal even if it was on a mouse-only control" with "wraps from Close to the checkbox on Tab and from the checkbox to Close on Shift+Tab" and "brings focus into the dialog if it is outside".
- Replace "marks Continue and Close with tabindex=-1" with "Continue and Close are native buttons with no `tabindex="-1"`".
- Replace "does not close on Escape" with "closes on Escape": `onClose` called once, from both the focused element and `document`.
- Add: Enter and Space on focused Close call `onClose`; Enter and Space on focused Continue call `onContinue(true)` (use `user.keyboard`).
- Add focus return tests: render a host with an opener, focus the opener, open, close via Close, Escape and `isOpen=false`; expect `document.activeElement` to be the opener. Add one test with `returnFocusRef` pointing at an element other than the active one. Add one test where the opener is removed before close (no throw, no focus call).
- Keep unchanged: closed renders nothing, role/name/content, focus on checkbox on open, checked by default, backdrop click does not close, Learn more expands in place, Close click calls `onClose` only, Continue passes state with the 800 ms indicator, passes `false` when unchecked, reset to checked on reopen.

**`src/__tests__/properties/modal.properties.test.tsx`**
- Property 9 (checkbox default state): update comments only ("mouse-only close control" becomes "close control"). Behavior stays the same.
- Property 10: rename to "Feature: lantern-bills, Property 10: Keyboard Order and Wrap" (keep the number so existing references hold). For random Tab/Shift+Tab sequences, track an expected index over `[checkbox, learnMore, continue, close]` modulo 4 and assert `document.activeElement` after each press, using `userEvent`. Remove the assertions that Continue and Close are never focused and carry `tabindex="-1"`; assert instead that neither has `tabindex="-1"`.
- Add Property: "Escape closes from any stop". For any stop reached by random Tab presses, Escape closes the dialog and focus is on the opener (the `Host` focuses its opener before opening).

**`src/__tests__/properties/accessibility.properties.test.tsx`**
- Property 16: the scenario "Submit (icon) button" still works. Update the doc comment that excludes Continue and Close "by requirement" and add scenarios "Close button (modal)" (keys enter, space; observe `dialog=true/false`) and "Continue button (modal)" (observe the 800 ms indicator via `aria-busy`). Because Continue calls `processPayment`, observe only `aria-busy` after the click and let fake timers flush.

**`src/__tests__/helpers.tsx`**
- Update the `getSubmitButton` comment ("it has no accessible name, so query by type"). The query itself can stay.

**`src/__tests__/translations.test.ts`**
- Add `accessibility.payButton` to the `required` list. Leave `MISSING` as is.

### Property-Based Tests

- Random Tab/Shift+Tab sequences over the four stops match a modulo-4 model.
- Random checkbox toggles and open/close cycles through Close, Escape and failed payment always end with focus on the opener and a checked box on the next open.
- Existing form-data and language generators keep exercising submit, dialog and confirmation flows, confirming Property 2.

### Integration Tests

- `App.test.tsx`: open the form, fill it, press Enter in an input, confirm the dialog opens with focus on the checkbox; press Escape and confirm the dialog closes and focus is on the submit button. Repeat with Close and with a failing card number (`4000000000000002`) after Continue.
- `App.test.tsx`: with a valid card, Continue navigates to the confirmation page without errors.
- In `pa` and `hi`, the pay button's accessible name is the localized text while the Pay this bill button still shows English.
- Final check: `git diff -- demo-site` is empty, and `npm test` passes in `demo-site-exorcised/`.
