---
inclusion: fileMatch
fileMatchPattern: 'dashboard/**/*'
---

# Dashboard Design Rules

These rules apply to everything in `dashboard/`. They are the single source of truth for the dashboard's look. If the spec in `.kiro/specs/haunt-dashboard/` conflicts with this file, this file wins.

The theme is a candlelit haunted house, built for the Kiroween 2026 Costume Contest. Every spooky element must have a job (see "What each spooky element means"). Decoration that carries no meaning does not belong.

## Colors

All colors are defined once in `src/styles/tokens.css` and mirrored in `src/styles/tokens.ts` for the contrast test. Don't use hex values anywhere else.

Ratios were computed with the WCAG 2.1 relative luminance formula. Thresholds: 4.5:1 for normal text, 3:1 for large text and non-text UI (borders, icons, focus rings).

| Token | Value | Use | Pair → contrast ratio |
|---|---|---|---|
| `--bg` | `#1a1816` | Charcoal page background | |
| `--surface` | `#2a2522` | Cards, panels | |
| `--text` | `#ece6dc` | Body text | on `--bg` 14.26, on `--surface` 12.21 |
| `--text-muted` | `#b8ae9f` | Secondary text | on `--bg` 8.09, on `--surface` 6.92 |
| `--amber` | `#f2a83b` | Primary actions, candle flame | `--bg` text on amber 8.80; amber on `--bg` 8.80 |
| `--spectral` | `#dcebff` | Ghost elements, focus ring, focus glow | on `--bg` 14.64, on `--surface` 12.53 |
| `--bone` | `#e6dcc6` | Tombstones | against `--bg` 13.00 |
| `--bone-ink` | `#2b2420` | Text on bone | 11.21 |
| `--bone-ink-muted` | `#5a4e44` | Secondary text on bone | 5.91 |
| `--failure` | `#c0392b` | Failure fills only | `#ffffff` text on it 5.44; against `--bg` 3.26; against `--surface` 2.79 (fails, see rules) |
| `--placeholder` | `#55504a` | Missing-screenshot box | `--text` on it 6.43 |
| `--spoken-bg` | `#000000` | The Listener's spoken panel | `--spoken-text` `#f4f8ff` 19.72; waveform `--ghost-listener` 11.87 |
| `--ghost-listener` | `#8fc8ff` | The Listener's accent | on `--bg` 10.01 |
| `--ghost-phantom` | `#8fe0bf` | The Phantom's accent | on `--bg` 11.45 |
| `--ghost-bebe` | `#d4b6ff` | Bebe's accent | on `--bg` 10.06 |

Rules:

- Deep red (`--failure`) is only for failures: gave up, errored, new haunting. It is a fill with white text, never a text color.
- A `--failure` fill placed on `--surface` always gets a 2 px `--text` border, because red against the surface is only 2.79:1.
- Focus ring: a 3 px `--spectral` outline with a 2 px offset, so it sits against `--bg` or `--surface` (at least 12.5:1). Inside bone tombstones, the ring uses `--bone-ink` (11.21:1).
- Never convey a status by color alone. Every result, finding, exorcise status and coverage cell has text plus an icon or shape.
- Any new color pair must be added to the contrast test with its ratio, and must pass AA before use.

## Fonts

Both fonts use the SIL Open Font License and are installed through npm, so Vite bundles them. Never load fonts from a CDN.

- **Headings:** IM Fell English (`@fontsource/im-fell-english`), weight 400, italic for flourishes, 1.5 rem to 3 rem.
- **Body:** Atkinson Hyperlegible (`@fontsource/atkinson-hyperlegible`), weights 400 and 700, 1 rem on an 18 px root, line-height 1.6.
- Define system font fallbacks so text stays readable while fonts load.

## Ghost characters

All characters are original inline SVGs drawn for this project. Don't use copyrighted or trademarked characters or third-party art. Each ghost has a distinct silhouette, so they can be told apart in greyscale. Each ghost also has an accent color and an icon for small sizes.

| Ghost | Silhouette | Icon | Accent | Description in the UI |
|---|---|---|---|---|
| The Listener | Tall, calm sheet ghost with eyes gently closed and three curved sound rings beside its head | Ear with sound waves | `--ghost-listener` | "Moves through the page by keyboard and listens to a screen reader." |
| The Phantom | Short, wispy ghost with a tapering trail, holding an old flip phone, with a small hourglass | Hourglass | `--ghost-phantom` | "Browses on slow 3G and an old phone." |
| Bebe | Round, friendly ghost wearing large reading glasses, with a speech bubble showing "अ ਅ" | Magnifying glass | `--ghost-bebe` | "Reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording." |

Rules:

- A ghost's name always appears as text next to its character or icon, or as its accessible name.
- A character shown alone gets `role="img"` and `aria-label` set to the ghost's name. When the name is already shown beside it, the character is `aria-hidden`.
- Describe every ghost respectfully, as a person with real needs. Copy is playful but clear and says plainly what happened, for example "Bebe gave up here." or "The Listener got trapped here."

## What each spooky element means

| Element | Meaning |
|---|---|
| Candle flame and flicker | A primary action. A lit candle means the action is available; an unlit candle means it is not (for example "Summon a live ghost"). |
| Fog | On the Haunted Map, fog covers rooms the selected ghost never entered. Elsewhere, a faint fog layer behind the header separates navigation from content. |
| Floating ghost | Which ghost a run belongs to. In the Ghost Cam, only the active ghost floats, and only while playing. |
| Cold spot (frost circle) | A place where a ghost got stuck. Its size shows how long the ghost waited. |
| Tombstone (bone) | One finding. |
| Spectral glow | Where the ghost's focus is on the screenshot. |
| Deep red | Failure. Nothing else. |

## Motion limits

- Put all keyframes inside `@media (prefers-reduced-motion: no-preference)`, so nothing moves by default when that preference doesn't match. Gate JavaScript-driven motion (waveform, glow pulse) with the `useReducedMotion()` hook.
- With reduced motion, every ambient animation shows as a still image, and the waveform does not animate.
- Nothing flashes more than three times in any one second.
- Candle flicker changes brightness by no more than 10%.
- No jump scares, no sudden full-screen visual changes, and no sudden sounds. Sound only plays when the user turns on "Read aloud (approximation)".

| Animation | Limits |
|---|---|
| Fog drift | Two layered blurred SVG gradients, `translateX` over 90 s, linear, infinite, opacity at most 0.25 |
| Candle flicker | Flame opacity 0.92 to 1.0 and a scale change of 1 to 3%, on an irregular 3 to 4 s cycle |
| Ghost float | `translateY` ±6 px over 6 s, ease-in-out |
| Focus glow pulse | Opacity 0.7 to 1.0 over 2.5 s |
| Waveform | Bar heights ease between precomputed values every 300 ms, only while playing |
