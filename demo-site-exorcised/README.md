# Demo Site

**Owner:** House Builder

This folder contains the example web application used for testing and demonstrations.

## Look and feel

Lantern Bills is a fictional Indian electricity provider. Everything on the site is original: the lantern
logo (`src/components/common/LanternLogo.tsx`), the festive banner art (`src/assets/banner.svg`) and the
icons are inline SVGs drawn for this project.

- **Fonts:** Mukta (Latin and Devanagari) and Mukta Mahee (Gurmukhi), SIL Open Font License, installed from
  npm and bundled by Vite (`src/styles/fonts.css`). Only weights 400 and 700 are bundled, and
  `font-display: optional` keeps late fonts from moving text.
- **Colours:** tokens and their contrast ratios are listed at the top of `src/index.css`.
- **Text:** every string comes from `public/locales/{en,pa,hi}/translation.json`, including month names
  (browsers' built-in locale data does not always include Punjabi). Unlike the haunted original, `pa` and
  `hi` have no gaps: the pay button and the three card validation messages are translated.
- **No network:** no CDN, analytics or remote images. Contact addresses use the reserved `.example` domain.

## The fixed copy

This is the fixed copy of Lantern Bills, used for the Exorcise demo. It has none of the six deliberate
problems that `demo-site/` keeps; those are listed in `.kiro/specs/lantern-bills/requirements.md`. They were
repaired through the bugfix specs `exorcised-payment-a11y-fix` (the pay button name and the dialog keyboard
trap) and `exorcised-remaining-fixes` (card errors, the late banner, the cut-off total, the pre-ticked
add-on and the Punjabi and Hindi text). `demo-site/` stays unchanged.

`npm run dev` serves it on port 3002 and `npm run build` builds it under `/haunt/lantern-bills-exorcised/`.
