# Exorcised Remaining Fixes Bugfix Design

## Overview

Four planted problems in `demo-site-exorcised/` are fixed. `demo-site/` is not touched. The pay button and dialog fixes from `exorcised-payment-a11y-fix` stay as they are. The backdrop-click and usage-chart planted problems stay.

## Bug Details

### Bug Condition

```
FUNCTION isBugCondition(input)
  RETURN (input.kind = "cardFieldInvalid")                                   // 1.1, 1.2
      OR (input.kind = "billPageRender" AND input.phase IN ["beforeBanner", "bannerArrives"])  // 1.3
      OR (input.kind = "render" AND input.viewportWidth <= 640 AND input.component = PaymentSummary) // 1.4
      OR (input.kind = "dialogOpen")                                         // 1.5
      OR (input.kind = "render" AND input.language IN ["pa", "hi"]
          AND input.key IN {payBillButton, validation.cardNumber, validation.expiry, validation.cvv}) // 1.6
END FUNCTION
```

### Root causes and fixes

| # | Root cause | Fix |
|---|------------|-----|
| 1 | `SilentCardErrors` renders bare `<div>`s with no role or id. `FormField` only links its own `error` prop, which the card fields do not use. | `SilentCardErrors` renders each message in `<div id="card-number-error" role="alert">` (and `card-expiry-error`, `card-cvv-error`). `FormField` gets two optional props, `invalid` and `describedBy`, which set `aria-invalid` and `aria-describedby` when its own `error` is not used. `BillPage` passes them for the three card fields. |
| 2 | `.banner` has no `aspect-ratio` or `min-height`, the `<img>` has no size attributes, and the offer `<p>` is mounted only after load. | `LateBanner.module.css`: `.banner` gets `aspect-ratio: 4 / 1`, `min-height: 120px`, `object-fit: cover`, the top border radius and a light placeholder background, so the box is the same size before and after load. `LateBanner.tsx` adds `width={1200}` `height={300}`. `BillPage` always renders the offer text, with `visibility: hidden` (not in the accessibility tree, still takes space) until `bannerLoaded`. The Autopay link is absolutely positioned and stays conditional because it takes no space. |
| 3 | The `max-width: 640px` block sets `width: 180px`, `overflow: hidden`, `white-space: nowrap` on the summary and the amount. | The block keeps only wrapping rules: `.summary { width: auto; max-width: 100% }`, `.amount { white-space: normal; overflow-wrap: anywhere }`. Rows still stack. |
| 4a | `useState(true)` in `ModalContent`. | `useState(false)`. Remounting on each open still resets it. |
| 4b | Four keys are missing from `pa` and `hi`. | Add them. |

### Translations

| Key | Punjabi | Hindi |
|-----|---------|-------|
| `payBillButton` | ਇਹ ਬਿੱਲ ਭਰੋ | इस बिल का भुगतान करें |
| `validation.cardNumber` | ਕਿਰਪਾ ਕਰਕੇ ਸਹੀ ਕਾਰਡ ਨੰਬਰ ਦਰਜ ਕਰੋ | कृपया मान्य कार्ड नंबर दर्ज करें |
| `validation.expiry` | ਕਿਰਪਾ ਕਰਕੇ ਸਹੀ ਮਿਆਦ ਪੁੱਗਣ ਦੀ ਤਾਰੀਖ ਦਰਜ ਕਰੋ | कृपया मान्य समाप्ति तिथि दर्ज करें |
| `validation.cvv` | ਕਿਰਪਾ ਕਰਕੇ ਸਹੀ CVV ਦਰਜ ਕਰੋ | कृपया मान्य सीवीवी दर्ज करें |

## Testing Strategy

Tests that asserted a planted behavior are rewritten to assert the fixed one, in place:

- `SilentCardErrors.test.tsx`: role="alert", ids, and in the form `aria-invalid` and `aria-describedby` that resolve to the visible message, removed when the field becomes valid.
- `LateBanner.test.tsx` and `layout.properties.test.tsx` (Property 13): reserved size before load (`aspect-ratio`, `min-height`, `width`/`height`), same size before and after load, so the shift is 0.
- `OverflowingSummary.test.tsx` and Property 14: no fixed width, no `overflow: hidden`, no `nowrap` at 640 px and below.
- `TrappingProtectionModal.test.tsx`, `modal.properties`, `payment-flow.properties`, `accessibility.properties`, `App.test.tsx`, preservation and exploration tests: the default is unchecked.
- `translations.test.ts`, `language.properties`, preservation fallback test: pa and hi define every key and show translated text.

Verification: `npm run build` and `npm test` in `demo-site-exorcised/`.
