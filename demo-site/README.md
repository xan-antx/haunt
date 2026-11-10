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
  (browsers' built-in locale data does not always include Punjabi). The only gaps in `pa` and `hi` are
  the deliberate ones: `payBillButton` and the three card validation messages.
- **No network:** no CDN, analytics or remote images. Contact addresses use the reserved `.example` domain.

The six deliberate problems are unchanged; see `.kiro/specs/lantern-bills/requirements.md`.
