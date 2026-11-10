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
| `--spoken-fade-1` | `#c8ccd4` | Spoken transcript line 1 step before the current line | on `--spoken-bg` 13.04 |
| `--spoken-fade-2` | `#a0a4ab` | Spoken transcript line 2 steps before the current line | on `--spoken-bg` 8.39 |
| `--spoken-fade-3` | `#85898f` | Spoken transcript lines 3 or more steps before the current line (floor) | on `--spoken-bg` 5.97 |
| `--thought-fade-1` | `#cbc5bc` | Thought transcript line 1 step before the current line | on `--surface` 8.84 |
| `--thought-fade-3` | `#aca69d` | Thought transcript lines 3 or more steps before the current line (floor) | on `--surface` 6.27 |
| `--ghost-listener` | `#8fc8ff` | The Listener's accent | on `--bg` 10.01 |
| `--ghost-phantom` | `#8fe0bf` | The Phantom's accent | on `--bg` 11.45 |
| `--ghost-bebe` | `#d4b6ff` | Bebe's accent | on `--bg` 10.06 |
| `--blush` | `#cc5f88` | Bebe's rosy cheeks only (decorative, never text) | on `--spectral` 3.12 |

Rules:

- Deep red (`--failure`) is only for failures: gave up, errored, new haunting. It is a fill with white text, never a text color.
- A `--failure` fill placed on `--surface` always gets a 2 px `--text` border, because red against the surface is only 2.79:1.
- Focus ring: a 3 px `--spectral` outline with a 2 px offset, so it sits against `--bg` or `--surface` (at least 12.5:1). Inside bone tombstones, the ring uses `--bone-ink` (11.21:1).
- Never convey a status by color alone. Every result, finding, exorcise status and coverage cell has text plus an icon or shape.
- Ghost Cam transcript lines fade with these tokens, never with opacity, so each ratio is exact. Spoken panel (on `--spoken-bg`): current line `--spoken-text` 19.72, then `--spoken-fade-1` 13.04, `--spoken-fade-2` 8.39, `--spoken-fade-3` 5.97. Thought panel (on `--surface`): current line `--text` 12.21, then `--thought-fade-1` 8.84, `--text-muted` 6.92, `--thought-fade-3` 6.27. Each level must be lower than the one before it and at least 4.5:1. The current line's highlight never relies on color alone (it also has a left border and a ▸ marker).
- Any new color pair must be added to the contrast test with its ratio, and must pass AA before use.

## Fonts

Both fonts use the SIL Open Font License and are installed through npm, so Vite bundles them. Never load fonts from a CDN.

- **Headings:** IM Fell English (`@fontsource/im-fell-english`), weight 400, italic for flourishes, 1.5 rem to 3 rem. The serif is for headings and short labels only (the logo, column headers, a ghost's name). Never set a sentence in it, and never in italic: the letters run together.
- **Body:** Atkinson Hyperlegible (`@fontsource/atkinson-hyperlegible`), weights 400 and 700, 1 rem on an 18 px root, line-height 1.6.
- **Sentences** (anything longer than a few words that is not a heading, such as the Result_Headline on a Result_Card) use the body font, normal style, normal weight (400), `--text` (12.21:1 on `--surface`), and may be a little larger than body text (the Result_Headline is 1.125 rem, line-height 1.5). Don't reuse a class name across rules in one CSS module: the Result_Headline once inherited the hero heading's amber italic serif because both were called `.headline`.
- Define system font fallbacks so text stays readable while fonts load.

## Ghost characters

All characters are original inline SVGs drawn for this project (`src/components/ghosts/Ghosts.tsx`). Don't copy or trace any existing illustration, and don't use copyrighted or trademarked characters or third-party art. The three ghosts are lively, friendly cartoon characters with big, readable features. They are told apart by shape and props, never by color alone, so they stay distinct in greyscale.

**Shared style.** Every ghost uses the same recipe:

- Body: `--spectral` fill with a ghost-accent outline.
- Props (headphones, phones, chunni): accent fill with a `--bg` ink outline (14.64:1 against the body).
- Faces: `--bg` ink.
- Outline weight: one per variant (`--line`, in units of the shared 130 × 160 viewBox: 3 for detailed, 7 for simple, so it is still about 1.4 px at 32 px).
- Glow: a soft `drop-shadow` in the ghost's accent (6 px detailed, 2 px simple). Badges on bone drop the glow and use `--bone-ink` for the accent.

| Ghost | Character | Hopeful (default) | Stuck (run gave up) | Icon | Accent | Description in the UI |
|---|---|---|---|---|---|---|
| The Listener | Tall, slim, calm ghost with big over-ear headphones and one hand cupped beside its ear | Eyes peacefully closed, gentle smile, three sound waves rippling out | The sound waves tangle into a knot; one eyebrow rises over one opened eye | Ear with sound waves | `--ghost-listener` | "Moves through the page by keyboard and listens to a screen reader." |
| The Phantom | Wispy, flickery ghost, like a buffering video, with shifted glitch slices; the bottom of its body breaks into small square pixels. Holds a cracked old phone (antenna, one signal bar, loading spinner), with a small hourglass beside it, and taps one foot | Bright eyes on the phone, small smile, foot tapping | Fades half-transparent with a broken (dashed) outline, eyes and mouth flat, frozen mid-load | Hourglass | `--ghost-phantom` | "Browses on slow 3G and an old phone." |
| Bebe | Short, round, cuddly grandmother ghost in a chunni draped over her head and a small shawl with phulkari-style diamonds. Thick round glasses on her nose, smile wrinkles, rosy cheeks (`--blush`), phone at arm's length, a tiny Gurmukhi speech bubble above her | Squints warmly at the phone; the bubble says "ਹਾਂ ਜੀ" (yes, dear) | Peers over glasses that have slid down her nose; the bubble says "ਕੀ?" (what?) | Magnifying glass | `--ghost-bebe` | "Reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording." |

**Variants.**

| Variant | Where | Notes |
|---|---|---|
| Detailed (`variant="detailed"`, the default) | Everything larger than 32 px: Home hero (120 px), Home Result_Cards (96 px), Home ghost rows (80 px) and Ghost Cam header (96 px, 40 px in the two-line summary) | All props and both expressions. Small character motions only with `lively` (see Motion limits). |
| Simple (`variant="simple"`) | Chips (`GhostBadge`, about 32 px) and anything 32 px or smaller. Never above 32 px | The detailed drawing in the same 130 × 160 frame, with fine detail dropped and thin parts drawn heavier. Never animates beyond the float. |

**The simple variant is a smaller copy, not a different character.** It keeps each detailed ghost's silhouette, face and main props, so a ghost looks the same in a chip and in the hero:

| Ghost | Kept in the simple variant | Dropped or reduced |
|---|---|---|
| The Listener | Tall slim body, headphones with big ear cups, hand cupped by the right ear, closed eyes and smile (stuck: knot, one raised eyebrow, one open eye) | Three sound waves become two; cushion lines |
| The Phantom | Wisp, glitch slices, pixelated bottom, tapping foot, phone with antenna, signal bar, spinner and crack, hourglass; bright eyes and smile (stuck: faded, dashed, flat face) | Pixels from ten to six; foot-tap marks, eye shine, bottom pixel row |
| Bebe | Chunni, shawl with diamonds, thick round glasses, rosy cheeks, phone at arm's length, Gurmukhi bubble (stuck: glasses slid down, "ਕੀ?") | Smile wrinkles, chunni trim dots, glint; five diamonds become three; the chunni band is wider so the heavier outline doesn't swallow it |

When you change a detailed drawing, change its simple drawing in the same commit. Check both at 240 px side by side and the simple one at 32 px.

The icons stay for the tightest spots, such as cold-spot markers on the Haunted Map. Chips show the simple character instead.

Rules:

- Bebe is portrayed with warmth and affection. Her age, glasses and language are never the joke.
- Pick the expression with `moodFor(run.result)`: stuck when the run gave up, hopeful otherwise (including errored runs and the Home hero).
- A ghost's name always appears as text next to its character or icon, or as its accessible name.
- A character shown alone gets `role="img"` (pass `labelled`), and its `aria-label` comes from `characterLabel()`. The label starts with the ghost's name and then gives the expression, for example "Bebe, stuck, peering over the glasses that slid down her nose". When the name is already shown beside it, the character is `aria-hidden`, so the name isn't read twice. The run's result is always in text nearby too.
- Text inside a character (Bebe's bubble) is decorative and carries `lang="pa"`.
- Describe every ghost respectfully, as a person with real needs. Copy is playful but clear and says plainly what happened, for example "Bebe gave up here." or "The Listener got trapped here."

## What each spooky element means

| Element | Meaning |
|---|---|
| Candle flame and flicker | A primary action. A lit candle means the action is available; an unlit candle means it is not (for example "Summon a live ghost"). |
| Fog | On the Haunted Map, fog covers rooms the selected ghost never entered. Elsewhere, a faint fog layer behind the header separates navigation from content. |
| Floating ghost | Which ghost a run belongs to. In the Ghost Cam, only the active ghost floats, and only while playing. Home ghost rows float too. |
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
| Character motions (`lively`, detailed and hopeful only: Home hero always, Ghost Cam only while playing; keyframes in `Ghosts.module.css`) | The Listener's sound waves: opacity 0.45 to 1 over 3 s, staggered. The Phantom: flicker, opacity 0.85 to 1 on a 4.2 s cycle; spinner, one turn per 2.6 s; foot tap, a double 16° tap and a pause on a 2.6 s cycle. Bebe's bubble: `translateY` 2 px over 4 s. Stuck characters never move. Like every ambient animation, no cycle is shorter than 2.5 s. |
| Focus glow pulse | Opacity 0.7 to 1.0 over 2.5 s |
| Waveform | Bar heights ease between precomputed values every 300 ms, only while playing |
