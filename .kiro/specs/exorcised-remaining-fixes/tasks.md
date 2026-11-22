# Implementation Plan

- [ ] 1. Card errors announced and linked (1.1, 1.2 / 2.1, 2.2)
  - [ ] 1.1 Add `role="alert"` and ids to `SilentCardErrors`
  - [ ] 1.2 Add `invalid` and `describedBy` props to `FormField`; pass them from `BillPage`
  - [ ] 1.3 Update `SilentCardErrors.test.tsx`

- [ ] 2. Banner space reserved (1.3 / 2.3)
  - [ ] 2.1 `LateBanner.module.css` and `LateBanner.tsx`: aspect ratio, min height, size attributes
  - [ ] 2.2 `BillPage`: always render the offer text, hidden until the banner loads
  - [ ] 2.3 Update `LateBanner.test.tsx` and layout Property 13

- [ ] 3. Summary total wraps at 640 px and narrower (1.4 / 2.4)
  - [ ] 3.1 Replace the clipping rules in `OverflowingSummary.module.css`
  - [ ] 3.2 Update `OverflowingSummary.test.tsx` and layout Property 14

- [ ] 4. Add-on unticked and pa/hi translations (1.5, 1.6 / 2.5, 2.6)
  - [ ] 4.1 `useState(false)` in `TrappingProtectionModal`
  - [ ] 4.2 Add the four keys to `pa` and `hi`
  - [ ] 4.3 Update the modal, payment-flow, accessibility, App, preservation, exploration, translation and language tests

- [ ] 5. Verify
  - [ ] 5.1 `npm run build` in `demo-site-exorcised/`
  - [ ] 5.2 `npm test` in `demo-site-exorcised/`
  - [ ] 5.3 Confirm `demo-site/` has no changes (`git status`)
