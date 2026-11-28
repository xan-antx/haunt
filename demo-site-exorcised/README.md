# Lantern Bills (fixed copy)

**Owner:** House Builder

This folder is the fixed copy of Lantern Bills, the "exorcised" site. The haunted original is in `demo-site/`.

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

To run a ghost on it, use `npm run serve:ghosts`. It builds the site at base `/` into `.ghost-build/` (so the normal `dist/` build for the published site is not touched) and serves that build on http://localhost:3002. Use it instead of `npm run dev`: the dev server is too slow for The Phantom's slow-3G walk, and The Phantom gives up at step 1 on it. Stop a server with Ctrl+C in the terminal that started it.
