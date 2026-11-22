# Implementation Plan

## Overview

Fix two planted accessibility problems in `demo-site-exorcised/`: the unlabeled pay button and the trapping protection dialog. Order: exploration test, preservation tests, fix, test updates, then a final check that `demo-site/` has no diff. Nothing under `demo-site/` may change. Use the built-in file editing tools only (UTF-8 matters for the pa/hi strings). Run tests with `npm test` in `demo-site-exorcised/` (single run, no watch mode).

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Pay button name, dialog keyboard operation and focus return
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: The defects are deterministic, so scope the properties to the concrete failing cases below. Use `userEvent` and the existing `Host`/render helpers in `src/__tests__/helpers.tsx`.
  - Create `demo-site-exorcised/src/__tests__/properties/payment-a11y.exploration.test.tsx` with these cases (from isBugCondition in design):
    - Accessible name: `getByRole('button', { name: 'Pay now' })` finds the submit button (unfixed: name is empty)
    - Tab order: from the checkbox, `user.tab()` visits Learn more, Continue, Close, then the checkbox (unfixed: checkbox, Learn more, checkbox)
    - Shift+Tab from the checkbox wraps to Close
    - Enter and Space on focused Continue call `onContinue(true)`; on focused Close call `onClose` (unfixed: `tabindex="-1"` prevents focus)
    - Escape calls `onClose` and closes the dialog (unfixed: dialog stays open)
    - Focus return: after Close, Escape and `isOpen=false`, `document.activeElement` is the opener (unfixed: body)
  - Test assertions match expectedBehavior in design: name equals `t("accessibility.payButton")`, tab order is [checkbox, learnMore, continue, close] with wrap, Escape closes, focus after close is the opener
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., accessible name is `''`; focus alternates checkbox, Learn more, checkbox; `tabindex="-1"` on Continue and Close)
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Everything else behaves as before
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code (non-bug-condition inputs): the submit button submits and respects `disabled`; the dialog has `role="dialog"`, `aria-modal="true"`, name "Protect your payment", focus on the checkbox, checkbox checked on every open; toggling updates the total; Continue calls `onContinue(addOn)` and shows the 800 ms `aria-busy` indicator; Learn more toggles with click, Enter and Space; backdrop click leaves the dialog open; pa/hi fall back to English for `payBillButton` and the card validation messages
  - Record the baseline by running the existing suites on unfixed code: `payment-flow.properties.test.tsx`, `App.test.tsx`, `translations.test.ts`, `polish.test.tsx`, `language.properties.test.tsx`, and the banner, summary, card error and chart tests
  - Write property-based tests (fast-check, matching existing generators) in `demo-site-exorcised/src/__tests__/properties/payment-a11y.preservation.test.tsx` for: random checkbox toggle and open/close cycles keep the checkbox checked on each open; total tracks the checkbox; mouse clicks on Continue, Close and the pay button behave as before; backdrop clicks never close the dialog
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for unlabeled pay button and trapping protection dialog

  - [x] 3.1 Add the `accessibility.payButton` translation
    - Edit `public/locales/en/translation.json`: "Pay now"
    - Edit `public/locales/pa/translation.json`: "ਭੁਗਤਾਨ ਕਰੋ"
    - Edit `public/locales/hi/translation.json`: "अभी भुगतान करें"
    - Do not add the key to `MISSING` in `translations.test.ts`
    - _Bug_Condition: isBugCondition(input) where input.target = payButton AND input.kind = "exposeToAssistiveTech"_
    - _Expected_Behavior: payButton.accessibleName = t("accessibility.payButton")_
    - _Preservation: pa/hi fallback for `payBillButton` and card validation messages stays unchanged_
    - _Requirements: 2.1, 3.6_

  - [x] 3.2 Label the pay button and pass the click event
    - In `src/components/UnlabeledPayButton.tsx`, call `useTranslation()` and add `aria-label={t('accessibility.payButton')}`
    - Change `onClick` to `(event: MouseEvent<HTMLButtonElement>) => void`
    - Keep the `aria-hidden` SVG, `type="submit"`, `disabled`, class names and icon unchanged
    - Replace the "PROBLEM 1 (deliberate)" comment with a note that the button is labeled from `accessibility.payButton`
    - _Bug_Condition: isBugCondition(input) where input.target = payButton AND input.kind = "exposeToAssistiveTech"_
    - _Expected_Behavior: expectedBehavior(result) from design (localized accessible name)_
    - _Preservation: submit, onClick, disabled, icon and CSS unchanged (3.1)_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Record the opener in `BillPage`
    - In `src/pages/BillPage.tsx`, add `const openerRef = useRef<HTMLElement | null>(null)` in `BillPage`
    - Change `PaymentFormSection`'s `onSubmit` prop to `(event: MouseEvent<HTMLButtonElement>) => void`
    - In `handleSubmit(event)`, set `openerRef.current = event.currentTarget` before `setModalOpen(true)`
    - Pass `returnFocusRef={openerRef}` to `TrappingProtectionModal`; leave `onClose`, `onContinue` and `amount` unchanged
    - _Bug_Condition: isBugCondition(input) where input.kind = "dialogClosed"_
    - _Expected_Behavior: focus after close = opener_
    - _Preservation: late banner, summary, card errors and chart untouched (3.6)_
    - _Requirements: 2.5, 3.6_

  - [x] 3.4 Make the dialog keyboard operable and return focus
    - In `src/components/TrappingProtectionModal.tsx`, add optional prop `returnFocusRef?: RefObject<HTMLElement | null>`
    - In `ModalContent`, capture `const openerRef = useRef(document.activeElement)` during first render as a fallback
    - Delete the `trapTab` effect and remove `tabIndex={-1}` from Continue and Close
    - Move the Close button after Continue in the DOM (CSS absolute positioning keeps the layout)
    - Add one capture-phase `keydown` effect on `document`, removed on unmount: Escape calls `preventDefault()` and `onClose()`; Tab on the last stop focuses the first; Shift+Tab on the first stop focuses the last; focus outside the dialog goes to the first stop; otherwise leave native behavior. Stops are `input, a[href], button:not([disabled])` inside the dialog
    - Merge the focus effect: focus the checkbox on mount; cleanup focuses `returnFocusRef?.current ?? openerRef.current` only if it exists and `isConnected`
    - Leave unchanged: no backdrop `onClick`, `role`, `aria-modal`, `aria-label`, Learn more handlers, 800 ms indicator, mount-only-while-open pattern
    - Update the "PROBLEM 2" comment to list backdrop click and checked-by-default checkbox as the remaining deliberate behavior; replace the "mouse-only" comment in `TrappingProtectionModal.module.css` with no style changes
    - _Bug_Condition: isBugCondition(input) where input.target = dialog AND dialog.isOpen AND (Tab, ShiftTab, Enter/Space on Continue or Close, Escape), or input.kind = "dialogClosed"_
    - _Expected_Behavior: tabOrder(dialog) = [checkbox, learnMore, continue, close] with wrap; Enter/Space activate Continue and Close; Escape closes; focus after close = opener_
    - _Preservation: role, aria-modal, name, initial focus, checked on open, total, onContinue, 800 ms indicator, Learn more, backdrop click leaves dialog open_
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Pay button name, dialog keyboard operation and focus return
    - **IMPORTANT**: Re-run the SAME test from task 1 (`payment-a11y.exploration.test.tsx`) - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Everything else behaves as before
    - **IMPORTANT**: Re-run the SAME tests from task 2 (`payment-a11y.preservation.test.tsx`) - do NOT write new tests
    - Also re-run the baseline suites recorded in task 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Suites that assert the planted behavior of the two fixed components are expected to fail until task 4 updates them; any other failure is a regression to fix in the code
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Update existing tests that assert the planted behavior
  - Assert the fixed behavior. Do not delete or weaken any test. Failing tests here are updated to the new behavior, never skipped.

  - [x] 4.1 Update `src/components/__tests__/UnlabeledPayButton.test.tsx`
    - Rename the describe to "UnlabeledPayButton (Problem 1 fixed: accessible name)"
    - "has an empty accessible name" becomes "has the accessible name Pay now" using `toHaveAccessibleName('Pay now')`
    - "has no aria-label, aria-labelledby, or title" becomes "is labeled from the translation file": `aria-label` equals `i18n.t('accessibility.payButton')`; name is "ਭੁਗਤਾਨ ਕਰੋ" after `i18n.changeLanguage('pa')` and "अभी भुगतान करें" for `hi`
    - "has no text content" becomes "keeps the icon-only look" (text content still empty)
    - Keep: svg `aria-hidden="true"`, keyboard focusable, click calls `onClick`, disabled does not fire. Add: `type="submit"` is preserved
    - _Requirements: 2.1, 3.1_

  - [x] 4.2 Update `src/components/__tests__/TrappingProtectionModal.test.tsx`
    - Rename the describe to "TrappingProtectionModal (Problem 2 fixed: keyboard operable)"
    - Replace "Tab never reaches the Continue or Close controls" with an in-order, wrapping Tab and Shift+Tab test using `userEvent.setup()`
    - Replace the "pulls focus back into the modal" test with wrap tests (Close to checkbox on Tab, checkbox to Close on Shift+Tab) and "brings focus into the dialog if it is outside"
    - Replace "marks Continue and Close with tabindex=-1" with "Continue and Close are native buttons with no `tabindex="-1"`"
    - Replace "does not close on Escape" with "closes on Escape" (`onClose` called once, from the focused element and from `document`)
    - Add Enter and Space on Close (`onClose`) and on Continue (`onContinue(true)`) using `user.keyboard`
    - Add focus return tests: close via Close, Escape and `isOpen=false` return focus to the opener; one test with `returnFocusRef` pointing at a non-active element; one test where the opener is removed before close (no throw)
    - Keep unchanged: closed renders nothing, role/name/content, focus on checkbox on open, checked by default, backdrop click does not close, Learn more expands in place, Close click calls `onClose` only, Continue 800 ms indicator, `false` when unchecked, reset to checked on reopen
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.3 Update `src/__tests__/properties/modal.properties.test.tsx`
    - Property 9: update comments only ("mouse-only close control" becomes "close control")
    - Property 10: rename to "Feature: lantern-bills, Property 10: Keyboard Order and Wrap"; for random Tab/Shift+Tab sequences track an expected index modulo 4 over [checkbox, learnMore, continue, close] and assert `document.activeElement`; replace the "never focused" and `tabindex="-1"` assertions with "neither has `tabindex="-1"`"
    - Add property "Escape closes from any stop": after random Tab presses, Escape closes the dialog and focus is on the opener
    - _Requirements: 2.2, 2.4, 2.5, 3.2_

  - [x] 4.4 Update `src/__tests__/properties/accessibility.properties.test.tsx`
    - Property 16: update the doc comment that excludes Continue and Close "by requirement"
    - Add scenarios "Close button (modal)" (Enter, Space; observe `dialog=true/false`) and "Continue button (modal)" (observe only `aria-busy` after click, let fake timers flush)
    - _Requirements: 2.3, 3.3_

  - [x] 4.5 Update helpers, translation test and integration tests
    - `src/__tests__/helpers.tsx`: update the `getSubmitButton` comment (it is no longer nameless); keep the `type="submit"` query
    - `src/__tests__/translations.test.ts`: add `accessibility.payButton` to the `required` list; leave `MISSING` as is
    - `src/__tests__/App.test.tsx`: Enter in an input opens the dialog with focus on the checkbox; Escape closes it and focus is on the submit button; repeat with Close and with failing card `4000000000000002` after Continue; with a valid card Continue navigates to confirmation without errors; in `pa` and `hi` the pay button name is localized while "Pay this bill" still shows English
    - _Requirements: 2.1, 2.4, 2.5, 3.6_

- [x] 5. Final check: `demo-site/` is untouched
  - Run `git diff -- demo-site` and confirm the output is empty
  - Run `git status --short demo-site` and confirm it lists nothing
  - Run `npm test` in `demo-site-exorcised/` and confirm the full suite passes
  - Confirm every changed file is under `demo-site-exorcised/` or `.kiro/specs/exorcised-payment-a11y-fix/`
  - If `demo-site/` shows any diff, revert only the unintended edits and re-check
  - _Requirements: 3.6, 3.7_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Scope is `demo-site-exorcised/` only. Task 5 proves `demo-site/` has no diff.
- Task 1 is expected to fail and task 2 is expected to pass on unfixed code. Do not fix code or weaken tests to change either result.
- Between 3.4 and 4.5, the old tests that assert the planted behavior of the pay button and dialog are expected to fail. Task 4 rewrites them. Do not delete or skip them.
- Task 3.3 passes `returnFocusRef`, which the dialog accepts only after 3.4, so 3.4 runs first.
- Edit files only with the built-in file tools, never with shell commands. Do not start the dev server from a script.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.4"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["3.5", "3.6"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6"] }
  ]
}
```
