# Implementation Plan

Ticked on 2026-11-27 after checking each task against the code in `demo-site-exorcised/` (commit `d899259`), then running its build and its 158 tests, which pass. `git show --stat d899259 -- demo-site` lists no changes to `demo-site/`.

- [x] 1. Card errors announced and linked (1.1, 1.2 / 2.1, 2.2)
  - [x] 1.1 Add `role="alert"` and ids to `SilentCardErrors`
  - [x] 1.2 Add `invalid` and `describedBy` props to `FormField`; pass them from `BillPage`
  - [x] 1.3 Update `SilentCardErrors.test.tsx`

- [x] 2. Banner space reserved (1.3 / 2.3)
  - [x] 2.1 `LateBanner.module.css` and `LateBanner.tsx`: aspect ratio, min height, size attributes
  - [x] 2.2 `BillPage`: always render the offer text, hidden until the banner loads
  - [x] 2.3 Update `LateBanner.test.tsx` and layout Property 13

- [x] 3. Summary total wraps at 640 px and narrower (1.4 / 2.4)
  - [x] 3.1 Replace the clipping rules in `OverflowingSummary.module.css`
  - [x] 3.2 Update `OverflowingSummary.test.tsx` and layout Property 14

- [x] 4. Add-on unticked and pa/hi translations (1.5, 1.6 / 2.5, 2.6)
  - [x] 4.1 `useState(false)` in `TrappingProtectionModal`
  - [x] 4.2 Add the four keys to `pa` and `hi`
  - [x] 4.3 Update the modal, payment-flow, accessibility, App, preservation, exploration, translation and language tests

- [x] 5. Verify
  - [x] 5.1 `npm run build` in `demo-site-exorcised/`
  - [x] 5.2 `npm test` in `demo-site-exorcised/`
  - [x] 5.3 Confirm `demo-site/` has no changes (`git status`)
