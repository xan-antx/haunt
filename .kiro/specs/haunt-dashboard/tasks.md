# Implementation Plan: Haunt Dashboard

## Overview

These tasks build the Haunt dashboard in `dashboard/` as a static React + Vite + TypeScript site on port 3001. Work goes bottom-up: project setup, then the Collect_Step and Data_Module, then the pure models, then the shared components and theme, then the seven screens, and finally accessibility and network checks. Test sub-tasks marked `*` are optional.

## Tasks

- [x] 1. Set up the dashboard project
  - Create `dashboard/package.json` with dependencies at the versions used in `demo-site/package.json` (react 18, react-dom, react-router-dom, typescript, vite), plus `@fontsource/im-fell-english` and `@fontsource/atkinson-hyperlegible`
  - Add dev dependencies: `@vitejs/plugin-react`, `tsx`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `fast-check`, `axe-core`, `@playwright/test`, `@types/node`, `@types/react`, `@types/react-dom`
  - Scripts: `collect-runs` (`tsx scripts/collect-runs.ts`), `predev` and `prebuild` → `npm run collect-runs`, `dev` (`vite`), `build` (`tsc -b && vite build`), `preview` (`vite preview`), `test` (`vitest --run`), `test:properties` (`vitest --run -t "Feature: haunt-dashboard, Property"`), `test:e2e` (`playwright test`)
  - `vite.config.ts`: React plugin, `base: './'`, `server.port` and `preview.port` 3001 with `strictPort: true`, Vitest config (jsdom, setup file)
  - `tsconfig.json` in strict mode; `index.html` with `lang="en"` and a title
  - `dashboard/.gitignore` with `public/runs/`
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

- [x] 2. Contract types and validation
  - [x] 2.1 Write `src/data/types.ts` with `Run`, `Step`, `Finding`, `FocusBox`, `RunIndex`, `RunIndexEntry`, `ValidationIssue`, `LoadedRun`, `GhostId`, `RunResult`
    - _Requirements: 3.2, 3.4_
  - [x] 2.2 Write `src/data/validate.ts` (`validateRun`) following the validation table in the design: required fields and types, `formatVersion` 1, ISO `startedAt`, duplicate step numbers, `result` exactly one of `succeeded`/`gave_up`/`error`, finding `type` exactly one of the eight contract types (no aliases), zero-sized focusBox → null, findings that point to missing steps, unsafe screenshot paths, `ghost` exactly one of `listener`/`phantom`/`bebe`. It must never throw
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x] 2.3 Unit tests for each validation rule, using both samples (Listener: valid with no warnings; Bebe: valid with only the zero-sized focusBox warning) and derived invalid fixtures in `src/__tests__/fixtures/`, including `result: "success"`, `type: "keyboard_trap"` and `ghost: "poltergeist"`, which must all be rejected
    - _Requirements: 4.1–4.8_
  - [x] 2.4 Property tests 1, 2 and 7: `validateRun` never throws; contract-shaped runs always validate; only the exact contract `ghost`, `result` and `type` values are accepted
    - _Requirements: 4.1, 4.9_

- [x] 3. Collect_Step
  - [x] 3.1 Write `scripts/collect-runs.ts`: delete `public/runs/`, find `runs/**/run.json` in sorted path order, copy each run folder, validate with the shared `validateRun`, compute keys (runId, or the folder path with `/` → `--`), mark duplicate runIds, write `public/runs/index.json`, print warnings, never write to `runs/`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [x] 3.2 Tests on a temporary folder tree: nested runs, an invalid file, a duplicate runId, re-running removes stale files, source files unchanged
    - _Requirements: 2.1–2.8_

- [x] 4. Data_Module
  - [x] 4.1 Write `src/data/source.ts` (`RunSource` interface and `selectRunSource()`), `staticSource.ts` (fetch relative to `BASE_URL`, cache each file once per page load, turn fetch and parse failures into `ok: false`), and `screenshots.ts` (safe path check and URL resolution)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.7_
  - [x] 4.2 Write `src/data/hooks.ts`: `useRunIndex`, `useAllRuns`, `useRun` with loading, error and invalid states
    - _Requirements: 3.1, 3.4, 4.9, 4.12_
  - [x] 4.3 Unit tests with mocked `fetch`: caching, 404, bad JSON, missing index
    - _Requirements: 3.5, 4.12_

- [x] 5. Routes
  - Write `src/routes.ts` with URL builders and parsers for every screen in the design's route table, site-key slugging, and `#/run/:key` → step 1 redirect
  - _Requirements: 6.1, 6.2, 6.3, 6.8_
  - [x] 5.1 Property test 6: route round trip for step URLs
    - _Requirements: 6.2_

- [x] 6. Pure models
  - [x] 6.1 `ghosts.ts` (names, descriptions and accent tokens from `.kiro/steering/dashboard-design.md`, plus result copy) and `findingLabels.ts` (`FINDING_LABELS`: label and "helped" text for each of the eight finding types, typed as `Record<FindingType, …>` so a missing type fails to compile)
    - _Requirements: 9.3, 9.4, 15.2, 15.4, 16.6_
  - [x] 6.2 `haunts.ts` (`groupHaunts`, `startHereTarget`)
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_
  - [x] 6.3 `coldSpots.ts` (`buildRooms`, `coldSpotSize`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 6.4 `graveyard.ts` (`buildGraveyard` with site and ghost filters)
    - _Requirements: 9.1, 9.2, 9.6_
  - [x] 6.5 `seance.ts` (`answer` for the four questions, using the design's templates and the "what would have helped" table, with step citations)
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9_
  - [x] 6.6 `exorcise.ts` (`compareRuns` with multiset matching by type and page, the not-reached rule, the different-ghost flag and the different-mission error)
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_
  - [x] 6.7 `coverage.ts` (`buildCoverage` with latest run per ghost and the requirement-changed flag)
    - _Requirements: 14.1, 14.2, 14.3, 14.5_
  - [x] 6.8 `reproduce.ts` (`reproduceCommand` with shell quoting) and `waveform.ts` (`waveformBars`)
    - _Requirements: 5.3, 5.4, 10.4_
  - [x] 6.9 Unit tests checking the expected sample outputs listed under "Data Models" in the design (one Haunt, 3 findings, rooms `/` and `/bill`, 3 cold spots, Start here → step 9, coverage cells)
    - _Requirements: 7.1–7.6, 8.1–8.4, 9.1–9.3, 14.1–14.5_
  - [x] 6.10 Property tests 3, 4, 5 and 8
    - _Requirements: 8.4, 12.3, 12.9, 13.3–13.7, 5.3_

- [x] 7. Checkpoint: data foundation
  - Run `npm run collect-runs` and `npm test`. Confirm `public/runs/index.json` lists both samples as valid, and no file under `runs/` changed

- [x] 8. Theme, fonts and motion
  - [x] 8.1 Write `src/styles/tokens.css` and `tokens.ts` with the color values, focus ring rules and font stacks from `.kiro/steering/dashboard-design.md`. Import the two Fontsource fonts in `main.tsx`
    - _Requirements: 16.1, 16.2, 16.3, 18.2, 18.6, 19.2_
  - [x] 8.2 Write `src/styles/motion.css` with fog, candle flicker, ghost float and glow pulse, following the motion limits in `.kiro/steering/dashboard-design.md`. Add a `useReducedMotion` hook
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [x] 8.3 Contrast test that recomputes every documented token pair against the AA thresholds
    - _Requirements: 18.5, 18.6_

- [x] 9. Ghost characters
  - Draw original inline SVG components for The Listener, The Phantom and Bebe, each with the silhouette, icon and accent from `.kiro/steering/dashboard-design.md`. Build `GhostBadge` (icon plus name) and the accessible-name rules
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 10. App shell and shared components
  - [x] 10.1 `App.tsx` with `createHashRouter`, layout (SkipLink, header with nav to all screens, main, footer), `RouteAnnouncer` (document title, focus on h1), error boundary, and `NotFoundScreen`
    - _Requirements: 6.1, 6.6, 6.9, 18.1, 18.3, 18.7_
  - [x] 10.2 `LiveRegion`, `CandleButton` (lit and unlit), `ResultBadge` (icon plus text), `ProvenancePanel` (local time plus ISO, commit, URL, reproduce command, copy button with announcement and fallback), `RunErrorPanel`, `Fog`
    - _Requirements: 4.9, 4.10, 5.1, 5.2, 5.3, 5.5, 18.9_
  - [x] 10.3 `Screenshot` with `FocusGlow` (ResizeObserver scaling), the Placeholder (16:10, 1280×800 reference) and `onError` fallback
    - _Requirements: 10.2, 10.3_
  - [x] 10.4 `Tombstone` component
    - _Requirements: 9.2, 9.5_

- [x] 11. Home screen
  - Haunt cards, the Start here button (target from `startHereTarget`, unavailable with a reason when null), the Summon a live ghost button (`aria-disabled`, focusable, no-op, "Coming soon" text), the Restless files section and the empty state
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 4.12_

- [x] 12. Ghost Cam screen
  - [x] 12.1 Layout with mission, result and provenance header, screenshot on the left, SpokenPanel (black, waveform) or ThoughtPanel on the right, step info, the finding callout and "gave up here" copy, and a warnings disclosure
    - _Requirements: 10.1, 10.4, 10.5, 10.6, 10.12, 10.13, 10.15, 4.10_
  - [x] 12.2 Controls (Play/Pause toggle, Step back, Step forward with unavailable states), 1500 ms playback that stops at the last step and when the tab is hidden, URL replace on each step, and the polite live-region announcement without moving focus
    - _Requirements: 6.4, 6.5, 10.7, 10.8, 10.9, 10.14_
  - [x] 12.3 Timeline as an ordered list of step buttons with finding marks, labels and `aria-current="step"`
    - _Requirements: 10.10, 10.11_
  - [x] 12.4 `useApproximateVoice` and the voice toggle: Listener only, off by default, local voices only, cancel on step change, toggle off and unmount, unavailable state with reason, approximation disclaimer
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 17.5_
  - [x] 12.5 Unknown run key and out-of-range step messages
    - _Requirements: 6.6, 6.7_
  - [x] 12.6 Tests with both samples: panel by ghost, Placeholder, playback with fake timers, deep link to step 9 opens paused, timeline `aria-current`, voice behavior with mocked `speechSynthesis`
    - _Requirements: 10.1–10.15, 11.1–11.7_

- [x] 13. Haunted Map screen
  - Rooms as a list with h2 per page, ghost badges, cold spot buttons sized by `coldSpotSize` with text and accessible names linking to the Ghost Cam, ghost filter in the URL with fog and "Not visited by" text
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 14. Graveyard screen
  - Tombstone grid with site and ghost filters stored in the URL query, and links to Ghost Cam steps
  - _Requirements: 9.1, 9.2, 9.5, 9.6, 6.8_

- [x] 15. Séance screen
  - Run picker, the four question buttons, an answer panel in a polite live region, step citations as links, and URL state `#/seance/:runKey/:questionId`. No outside calls
  - _Requirements: 12.1, 12.2, 12.3, 12.8_

- [x] 16. Exorcise screen
  - Before and after pickers (the after list filtered by `mission.id`, with a default pair), side-by-side summaries with provenance, a status table with icon plus text, the different-ghost warning, the different-mission error, and URL state
  - _Requirements: 13.1, 13.2, 13.8, 13.9, 13.10_
  - [x] 16.1 Tests using a derived "after" fixture of the Listener sample with the `unlabeled_button` finding removed, plus a fixture that never reaches `/bill`
    - _Requirements: 13.4, 13.5, 13.6, 13.7_

- [x] 17. Spec Coverage screen
  - Mission table with requirement and goal, per-ghost status cells with icon plus text and links, "Not yet haunted", and the requirement-changed note
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 18. Checkpoint: all screens
  - Run `npm run dev` manually and walk all seven screens with the sample data. Confirm `http://localhost:3001/#/run/2026-11-03-listener-pay-bill/step/9` opens at step 9. Run `npm test`

- [x] 19. Privacy and build
  - [x] 19.1 Vite plugin that injects the CSP meta tag in production builds only
    - _Requirements: 19.1, 19.3_
  - [x] 19.2 Confirm `npm run build` output contains `runs/index.json`, both sample runs and the bundled font files, and that `npm run preview` serves it on port 3001
    - _Requirements: 1.4, 1.5, 1.6, 19.2_

- [x] 20. Accessibility and end-to-end checks
  - [x] 20.1 axe-core checks on every rendered screen in Vitest
    - _Requirements: 18.10_
  - [x] 20.2 Playwright suite against `npm run preview`: keyboard-only walk with no traps and visible focus, deep links, a network guard that fails on any request outside `localhost:3001`, reduced-motion check (no running animations), 320 px and 200% zoom with no horizontal scroll, axe scans in a real browser
    - _Requirements: 6.5, 17.2, 18.1, 18.2, 18.5, 18.8, 18.10, 19.1_

- [x] 21. Documentation
  - Update `dashboard/README.md` with commands, port, where runs come from, deep-link format with example links, how to add a live `RunSource`, and font licenses
  - _Requirements: 1.2, 3.3, 6.2_

- [x] 22. Final checkpoint
  - Run `npm run build`, `npm test` and `npm run test:e2e`. Confirm every requirement has at least one implementing task, and that no file under `runs/` or `contract/` was modified

## Amendment tasks

These tasks implement the amendment in the design (Req 1.8–1.11, 5.6–5.11, 7.2, 7.10–7.19, 10.4–10.5, 10.15–10.27, 16.7–16.10 and Properties 9–12). Tasks 23 to 28 each end with `npm run build` and `npm test` in `dashboard/`. Playwright runs only once, in task 29. Property-test sub-tasks are required.

- [x] 23. Ghost Cam Transcript
  - [x] 23.1 Add the transcript fade tokens
    - Add `--spoken-fade-1`, `--spoken-fade-2`, `--spoken-fade-3`, `--thought-fade-1` and `--thought-fade-3` to `src/styles/tokens.css` and `src/styles/tokens.ts` with the values in the design's fade table
    - Add the eight fade pairs (levels 0–3 on `--spoken-bg` and on `--surface`) to `COLOR_PAIRS`, and extend the contrast test so each level is lower than the one before it and at least 4.5:1
    - _Requirements: 10.19, 18.5_
  - [x] 23.2 Write `src/model/transcript.ts` with `buildTranscript(run, currentN)` and `fadeLevel(distance)`
    - One line per step from index 0 to the index of `currentN`, in ascending `n`; repeated texts kept as separate lines
    - `spoken` text for The Listener, `thought` text for The Phantom and Bebe; empty, whitespace-only or `undefined` text gives `empty: true` and "Nothing was spoken at this step." or "Nothing was thought at this step."
    - `current` only on the last line; `fade = min(3, lastIndex - i)`; returns `[]` when `currentN` is not in the run
    - _Requirements: 10.4, 10.5, 10.16, 10.17, 10.18, 10.19, 10.22, 10.27_
  - [x] 23.3 Write property test for transcript lines in `src/__tests__/transcript.properties.test.ts`
    - **Property 9: Transcript has exactly one line per step up to the current step**
    - Top-level `describe('Feature: haunt-dashboard, Property 9: …')`, at least 100 runs, text arbitraries include `''`, `'   '` and repeated values
    - **Validates: Requirements 10.4, 10.5, 10.16, 10.17, 10.18, 10.22, 10.27**
  - [x] 23.4 Write property test for transcript fading in `src/__tests__/transcript.properties.test.ts`
    - **Property 10: Transcript fading is monotonic and stays readable**
    - Map each `fade` to its token color and use `contrastRatio` from `tokens.ts` for both panel backgrounds
    - **Validates: Requirements 10.19, 18.5**
  - [x] 23.5 Write `src/hooks/useScrollOverflow.ts` with `useScrollOverflow(ref, axis)` and `scrollKeys(axis)`
    - `overflowing` is `scrollHeight > clientHeight + 1` (or the width version for `'x'`), measured in `useLayoutEffect` and in a `ResizeObserver` callback; works without `ResizeObserver`
    - `scrollKeys('y')` scrolls by 40 px on ArrowUp and ArrowDown; `scrollKeys('x')` does the same for ArrowLeft and ArrowRight and also handles Home and End; each calls `preventDefault()`
    - Add a small `ResizeObserver` stub to the Vitest setup file
    - _Requirements: 10.20, 10.21, 5.8, 5.11_
  - [x] 23.6 Build the `Transcript` component and use it in the Spoken_Panel and Thought_Panel
    - Render it from `buildTranscript(run, step.n)` in `src/screens/ghostcam/Panels.tsx` in place of the single current-step paragraph; keep the thought-bubble shape and keep the waveform below the Spoken_Panel, driven by the Current_Line's text
    - `role="region"`, `aria-label` "Spoken transcript" or "Thought transcript", `tabIndex={0}` only while overflowing, `scrollKeys('y')`
    - Each `li` shows "Step n" in text; the Current_Line has `aria-current="step"`, a 4 px `--spectral` left border, a `▸` marker in `::before` and weight 700; earlier lines get a transparent 4 px border and their fade token color; empty lines are italic
    - Scroller uses `overflow-y: auto; overscroll-behavior: contain`; a `useLayoutEffect` keyed on `step.n` sets `scrollTop = scrollHeight - clientHeight` (no `scrollIntoView`, no focus change)
    - The live region still announces only the new step; for empty text it says "Step n: nothing was spoken" (or "thought"); the transcript is not a live region
    - _Requirements: 10.4, 10.5, 10.14, 10.17, 10.18, 10.19, 10.20, 10.21, 10.22, 10.23, 10.27_
  - [x] 23.7 Write unit tests for `buildTranscript` and the `Transcript` component
    - Sample values from the design (Listener fades `3,3,3,3,3,3,2,1,0`, Bebe `3,3,3,2,1,0`)
    - `aria-current="step"` only on the last `li`; after Step back only lines 1..n render; `scrollTop` equals `scrollHeight - clientHeight` with stubbed sizes; `document.activeElement` unchanged during playback; live region holds only the new step; `tabIndex` 0 only when overflowing; ArrowUp and ArrowDown change `scrollTop`; axe passes
    - _Requirements: 10.16, 10.17, 10.18, 10.20, 10.21, 10.22, 10.23, 10.27_
  - [x] 23.8 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 10.4, 10.5, 10.16–10.23, 10.27_

- [x] 24. Ghost Cam layout fit at 1920×1080 and Provenance_Panel below the timeline
  - [x] 24.1 Reorder the Ghost Cam DOM in `src/screens/GhostCamScreen.tsx`
    - Order: Run_Summary, screenshot, right column (panel plus finding callouts), step info, Controls and voice toggle, Timeline, run-file notes, Provenance_Panel
    - Move the finding callouts into the right column after the panel; keep the Provenance_Panel after the Timeline
    - _Requirements: 10.1, 10.15, 10.25, 10.26, 18.1_
  - [x] 24.2 Add fit mode and stacked mode CSS
    - In `src/screens/ghostcam/GhostCam.module.css`, under `@media (min-width: 1280px) and (min-height: 900px)`: the `.cam` grid with areas `summary / shot panel / controls panel / timeline / rest`, `--cam-shot-max: calc(100vh - 32rem)`, the absolutely filled right column, the flexible transcript, and the compact Run_Summary (64 px ghost, two-column `dl`); timeline heading `margin-top: 0`
    - Cap the screenshot height (`max-height: var(--cam-shot-max); width: auto`) and the Placeholder width (`min(100%, calc(var(--cam-shot-max) * 1.6))`) in `src/components/Screenshot.module.css` without changing FocusGlow scaling
    - Stacked mode: keep the 3fr/2fr stage between 900 and 1279 px, one column below 900 px, transcript `max-height: 50vh`, only the screenshot area scrolls sideways
    - _Requirements: 10.1, 10.2, 10.3, 10.24, 10.26, 18.8_
  - [x] 24.3 Write a unit test for Ghost Cam DOM order
    - Use `compareDocumentPosition` to check Run_Summary, screenshot, panel, controls, timeline, Provenance_Panel for both samples
    - _Requirements: 10.25, 10.26_
  - [x] 24.4 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 10.1, 10.15, 10.24, 10.25, 10.26_

- [x] 25. Nav_Fog full width fix
  - [x] 25.1 Fix the fog layer clamp in `src/components/layout/Fog.module.css`
    - `.layer { max-width: none; width: 200%; }`; keep `overflow: hidden` on the header, `pointer-events: none` and `aria-hidden="true"` on the fog; do not use `100vw`
    - _Requirements: 16.7, 16.8, 16.9, 16.10_
  - [x] 25.2 Add a `blend(fg, bg, alpha)` helper to `src/styles/tokens.ts`
    - _Requirements: 16.10, 18.5_
  - [x] 25.3 Extend the contrast test with the fog blend pairs
    - `--text` and `--spectral` against `blend(spectral, bg, 0.25)` at 4.5:1 or more
    - _Requirements: 16.10, 18.5_
  - [x] 25.4 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 16.7–16.10_

- [x] 26. Home: logo h1, card h2s, Outcome_Line and wide layout
  - [x] 26.1 Write `src/model/outcome.ts` with `outcomeLine(run)`
    - Follow the design's Outcome_Line table in order: empty steps, `succeeded`, `error`, `gave_up` with a `focus_trap` first finding at the last step, `gave_up` with another type, `gave_up` with no finding at the last step
    - Use `FINDING_LABELS` and `plural` from `format.ts`
    - _Requirements: 7.14, 7.15, 7.16, 7.17, 7.18, 7.19, 9.4_
  - [x] 26.2 Write property test for Outcome_Line in `src/__tests__/outcome.properties.test.ts`
    - **Property 11: Outcome_Line follows the rules for every run**
    - Independent oracle written from the requirement text; step-count arbitrary includes 0 and 1; several findings at the last step; every finding type; at least 100 runs; top-level describe
    - **Validates: Requirements 7.14, 7.15, 7.16, 7.17, 7.18, 7.19**
  - [x] 26.3 Add `recentRuns(runs, count)` to `src/model/haunts.ts`
    - Newest first by `startedAt`, at most `count` runs
    - _Requirements: 7.12_
  - [x] 26.4 Make the logo the single h1 and show the Outcome_Line in `src/screens/HomeScreen.tsx`
    - Hero h1 holds an inline `HauntLogo` SVG mark (`aria-hidden="true"`) and the wordmark "Haunt"; no other "Haunt" text in the hero; header brand link unchanged
    - `HauntCard` title becomes `h2`; remove the hidden "Haunted sites" h2 and give the section `aria-label="Haunted sites"`
    - Replace `resultSentence` in each ghost row with `<p>{outcomeLine(summary.latest)}</p>` beside the `ResultBadge` of the same run; earlier-runs list keeps `resultSentence`
    - _Requirements: 7.2, 7.10, 7.11, 7.18, 18.7_
  - [x] 26.5 Add the wide layout and the "Recent ghost walks" side panel
    - Wrap cards and side panel in `.body`; at 1280 px and wider use `minmax(0, 2fr) minmax(18rem, 1fr)`; `.cards` uses `repeat(auto-fit, minmax(min(100%, 24rem), 1fr))`
    - `<aside aria-labelledby="recent-heading">` with h2 "Recent ghost walks": six runs from `recentRuns`, each with ghost icon and name, site, local date, Outcome_Line and a "Watch {ghost} in the Ghost Cam" link; then run counts per ghost in ghost order
    - Below 1280 px: one column in DOM order (hero, cards, side panel, Restless files)
    - _Requirements: 7.12, 7.13, 18.1, 18.8_
  - [x] 26.6 Write unit tests for `outcomeLine`, `recentRuns` and Home
    - Sample values ("Trapped by a keyboard trap at step 9", "Made it through in 6 steps") and one example per Outcome_Line table row
    - Exactly one h1 named "Haunt"; "Haunt" appears once in the hero; card titles are h2; each Outcome_Line differs from its badge text; "Recent ghost walks" heading exists; axe passes
    - _Requirements: 7.2, 7.10, 7.11, 7.12, 7.14–7.19_
  - [x] 26.7 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 7.2, 7.10–7.19_

- [x] 27. Reproduce_Command without mid-word breaks
  - [x] 27.1 Put the command in a horizontal scroll box in `src/components/ProvenancePanel.tsx` and `ProvenancePanel.module.css`
    - `.code`: `display: block; width: max-content; white-space: pre; word-break: normal; overflow-wrap: normal`
    - `.commandBox`: `min-width: 0; max-width: 100%; overflow-x: auto; overflow-y: hidden`; `.list > div` uses `minmax(7rem, max-content) minmax(0, 1fr)`
    - Box has `role="region"`, `aria-label="Reproduce command"`, `tabIndex={0}` only while `useScrollOverflow(box, 'x')` reports overflow, and `scrollKeys('x')` for arrows, Home and End
    - _Requirements: 5.6, 5.7, 5.8, 5.11, 18.8_
  - [x] 27.2 Make copying exact and the failure path clear
    - `navigator.clipboard.writeText(command)` with `command` from `reproduceCommand(run)` in the same render, never DOM text
    - Announce "Command copied" only after `writeText` resolves; on rejection or missing clipboard, select the text and announce "Couldn't copy. Select the command and copy it yourself."; the button is never disabled
    - _Requirements: 5.4, 5.5, 5.9, 5.10_
  - [x] 27.3 Write unit tests for the Provenance_Panel
    - `writeText` receives exactly `reproduceCommand(run)`; a rejected `writeText` gives the failure text, no "Command copied", and an enabled button; the box has `role="region"` and name "Reproduce command"; `tabIndex` 0 only while overflowing, re-checked when the `ResizeObserver` stub fires
    - _Requirements: 5.8, 5.9, 5.10, 5.11_
  - [x] 27.4 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 5.6–5.11_

- [x] 28. Widen `npm run test:properties` to every spec
  - [x] 28.1 Write `scripts/propertyTestPattern.ts` with `PROPERTY_TEST_PATTERN` and `isPropertyTestName`
    - Pattern `^Feature: [a-z0-9]+(-[a-z0-9]+)*, Property`
    - _Requirements: 1.8, 1.9_
  - [x] 28.2 Write property test for the name filter in `scripts/__tests__/propertyTestPattern.properties.test.ts`
    - **Property 12: Property_Test name filter matches exactly the Property_Tests**
    - Near misses: lowercase `feature:`, missing comma, `Property` later in the name, leading spaces, an outer describe name in front; at least 100 runs; top-level describe
    - **Validates: Requirements 1.8, 1.9**
  - [x] 28.3 Write `scripts/test-properties.ts` and point the `test:properties` script at it
    - Spawn `npx vitest run -t "<PROPERTY_TEST_PATTERN>" --reporter=default --reporter=json --outputFile.json=<os tmpdir>/haunt-properties.json` with inherited stdio
    - Export a pure `decideExit(report, vitestExitCode)`: zero tests ran → exit 1 with the "No Property_Tests ran…" message; any failure or non-zero Vitest exit → exit 1; otherwise 0; missing report → exit 1 with "Vitest did not produce a report."
    - `package.json`: `"test:properties": "tsx scripts/test-properties.ts"`
    - _Requirements: 1.8, 1.9, 1.10, 1.11_
  - [x] 28.4 Widen the Vitest `include` in `vite.config.ts`
    - `include: ['**/*.{test,spec}.{ts,tsx}']`, `exclude: ['node_modules/**', 'dist/**', 'e2e/**', 'test-results/**']`
    - _Requirements: 1.8, 1.9_
  - [x] 28.5 Write unit tests for `decideExit` and the Vitest config
    - 0 tests → exit 1 with the message; failures → exit 1; passes only → exit 0; missing report → exit 1; `exclude` contains `e2e/**`
    - _Requirements: 1.9, 1.10, 1.11_
  - [x] 28.6 Run `npm run test:properties` in dashboard/ and confirm it runs Properties 1–12 of `haunt-dashboard` and both `exorcise-different-ghost-fix` Property_Tests, with no other tests executed
    - _Requirements: 1.8, 1.9, 1.10_
  - [x] 28.7 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 1.8–1.11_

- [x] 29. Playwright end-to-end checks for the amendment
  - [x] 29.1 Add Ghost Cam layout checks in `e2e/ghostcam-layout.spec.ts`
    - At 1920×1080 and 100% zoom for both samples: Run_Summary, screenshot or Placeholder, panel, controls and timeline all have `bottom ≤ innerHeight` with `scrollY` 0; Provenance_Panel top is below the timeline bottom
    - Stacked at 320 px, 899 px and 200% zoom (960×540): vertical order matches Req 10.26 and `scrollWidth ≤ clientWidth`
    - _Requirements: 10.24, 10.25, 10.26, 18.8_
  - [x] 29.2 Add Nav_Fog width checks in `e2e/nav-fog.spec.ts`
    - At 320, 768, 1280, 1920 and 2560 px and 200% zoom: `.fog` left within 1 px of 0 and right within 1 px of `clientWidth`; each layer at least twice the fog width; repeat after `setViewportSize` without reload; `scrollWidth ≤ clientWidth`; `elementFromPoint` at each nav link's centre returns the link
    - _Requirements: 16.7, 16.8, 16.9, 16.10_
  - [x] 29.3 Add Reproduce_Command checks in `e2e/reproduce.spec.ts`
    - At 320, 1280 and 2560 px and 100%, 200% and 400% zoom: the `code` element is one line box; the page has no horizontal scroll
    - At 320 px the box has `tabindex="0"` and End or repeated ArrowRight brings `scrollLeft` to `scrollWidth - clientWidth`; at 2560 px without overflow the box has no `tabindex`
    - _Requirements: 5.6, 5.7, 5.8, 5.11_
  - [x] 29.4 Add Transcript checks in `e2e/transcript.spec.ts`
    - Step through the Listener sample from step 1 to 9: line count grows by one per step and repeated texts stay as separate lines
    - At step 9: the last line has `aria-current="step"`, a visible left border and the highest computed contrast; its box is inside the scroller's visible box; `window.scrollY` did not change while stepping
    - _Requirements: 10.16, 10.18, 10.19, 10.20, 10.22_
  - [x] 29.5 Add Home checks in `e2e/home.spec.ts`
    - Exactly one h1 named "Haunt"
    - At 1280 and 1920 px: the side panel is to the right of the cards and no empty grid track is wider than a card
    - _Requirements: 7.10, 7.11, 7.12_
  - [x] 29.6 Run `npm run build` and then `npm run test:e2e` once in dashboard/, and fix real failures in the dashboard code
    - Never weaken or delete tests; if the fit test fails, tune `--cam-shot-max` rather than shrinking text
    - _Requirements: 5.6–5.11, 7.10–7.12, 10.16–10.26, 16.7–16.10_

## Second amendment tasks

These tasks implement the second design amendment: the Ghost Cam one-screen layout (Req 10.12, 10.13, 10.15, 10.24–10.34) and the Home hero (Req 7.10–7.12, 7.20–7.25). They change behaviour that tasks 24 and 26.4 delivered under the earlier design (fit at 1920×1080 only, logo as the h1). Those tasks stay checked as history. Where a test written for the earlier requirement now contradicts the current requirement (for example "exactly one h1 named Haunt"), the test is rewritten to assert the current requirement, with the same or stricter checks. No test is weakened or deleted to make it pass. Tasks 30 to 32 each end with `npm run build` and `npm test` in `dashboard/`. Playwright runs only in task 34.

- [x] 30. Stuck_Notice model
  - [x] 30.1 Write `src/model/stuckNotice.ts` with `stuckNotice(run, step)`
    - Returns `StuckNotice { lines: string[]; fullText: string }` or `null`; follow the design's table: no findings and not the last step of a `gave_up` run gives `null`
    - Line 1: "{Ghost} gave up here." (give-up only); "{lead}." (finding only); "{lead} and gave up here." (both). `{lead}` is "The Listener got trapped here" for a Listener `focus_trap` first finding, otherwise "{Ghost} hit a problem here"
    - Line 2 (findings only): the first finding's label from `FINDING_LABELS` and its title, plus " (+N more at this step)" when there is more than one finding; line 3: the first finding's evidence; never more than 3 lines
    - "Last step" means the highest `n` in the run
    - _Requirements: 10.12, 10.13, 10.30, 10.31_
  - [x] 30.2 Write property test for the Stuck_Notice in `src/__tests__/stuckNotice.properties.test.ts`
    - **Property 13: One merged Stuck_Notice per step**
    - Top-level `describe('Feature: haunt-dashboard, Property 13: …')`, at least 100 runs, independent oracle written from the requirement text; the generator puts several findings on one step, includes findings at non-last steps, all three results and all eight finding types
    - **Validates: Requirements 10.12, 10.13, 10.30, 10.31**
  - [x] 30.3 Write unit tests for `stuckNotice` with the samples
    - Listener step 9 gives "The Listener got trapped here and gave up here."; Listener step 7 gives "The Listener hit a problem here."; Bebe step 3 gives "Bebe hit a problem here."; Listener step 1 gives `null`; a three-finding step gives "(+2 more at this step)"
    - _Requirements: 10.12, 10.13, 10.30, 10.31_
  - [x] 30.4 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 10.12, 10.13, 10.30, 10.31_

- [x] 31. Ghost Cam one-screen layout
  - [x] 31.1 Reorder `src/screens/GhostCamScreen.tsx` and use one Stuck_Notice
    - Remove the separate finding callout and "gave up here" callout; render a single `StuckNotice` component fed by `stuckNotice(run, step)` in a full-width slot under the screenshot and panel row. The slot element is always rendered with a fixed height of three lines (`4.5rem`), empty when the model returns `null`, so it never moves other elements. Each line is clamped to one line with an ellipsis; the full text is in the DOM and in `title`
    - DOM and reading order: Run_Summary, screenshot, panel (Transcript, plus waveform for The Listener), Stuck_Notice slot, Control_Row, Timeline, run-file notes, Provenance_Panel
    - Control_Row is one element directly after the notice slot containing step info (step, page, action, wait time), Play/Pause, Step back, Step forward and, for The Listener, the "Read aloud (approximation)" toggle with its note; the Timeline follows it directly
    - _Requirements: 10.1, 10.12, 10.13, 10.25, 10.26, 10.30, 10.31, 10.32, 10.33, 18.1_
  - [x] 31.2 Make the Run_Summary two lines
    - Row 1 is the `h1`: ghost name and mission goal. Row 2 is a `<p>`: "Requirement: {requirement}" followed by the result badge and text, with the badge kept outside the ellipsised part
    - Each row uses `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` in fit mode and has a `title` with its full text; full text stays in the DOM. The ghost description and site name are shown in stacked mode only
    - _Requirements: 10.15, 10.29, 18.4_
  - [x] 31.3 Make the Provenance_Panel a disclosure on the Ghost Cam
    - Add a `collapsible` prop to `src/components/ProvenancePanel.tsx`: the `h2` "Where this run came from" holds a button with `aria-expanded` and `aria-controls`, and the body has `hidden` while collapsed. State starts collapsed and is keyed on the run key. Exorcise does not pass the prop, so its panels stay open
    - Collapse the "Notes about this run file" disclosure by default as well
    - Keep the Reproduce_Command box behaviour from task 27 (focusable only when overflowing, re-checked when the panel opens)
    - _Requirements: 10.15, 10.25, 5.6, 5.8, 5.11_
  - [x] 31.4 Rewrite the fit and stacked CSS in `GhostCam.module.css`, `Screenshot.module.css` and the new notice and summary styles
    - Fit mode under `@media (min-width: 1280px) and (min-height: 800px)`: grid areas `summary / shot panel / notice / controls / timeline / notes / prov`, `--cam-shot-max: calc(100vh - 31rem)`; the stage and the right column both get `height: var(--cam-shot-max)`, the image shrinks inside the stage with `max-width` and `max-height`, the right column is absolutely filled and the Transcript_Viewport takes the remaining height (`flex: 1 1 0; min-height: 6rem`), so no height depends on the step, the line count or the Stuck_Notice
    - Control_Row `flex-wrap: nowrap` in fit mode; timeline heading visually hidden in fit mode
    - Stacked mode (under 1280 px wide or under 800 px tall, including 200% zoom): the 3fr/2fr stage between 900 and 1279 px, one column under 900 px, Control_Row wraps, `.transcript { height: clamp(10rem, 40vh, 18rem) }`, the Stuck_Notice slot keeps three lines of `min-height`, and only the screenshot area scrolls sideways
    - Keep the FocusGlow scaling unchanged
    - _Requirements: 10.1, 10.2, 10.3, 10.24, 10.26, 10.28, 10.31, 10.33, 10.34, 18.8_
  - [x] 31.5 Write unit tests for the new Ghost Cam structure
    - DOM order via `compareDocumentPosition` for both samples: Run_Summary, screenshot, panel, Stuck_Notice slot, Control_Row, Timeline, Provenance_Panel
    - At most one Stuck_Notice element at any step; the slot exists at steps with no notice; Listener step 9 shows one notice with both phrases
    - Run_Summary rows each have a `title` equal to their full text; the Provenance_Panel toggle is `aria-expanded="false"` on first render, the body is `hidden`, the Reproduce_Command is not focusable while collapsed, activating the toggle expands it, and opening another run collapses it again; Exorcise renders its panels open
    - Control_Row contains the Controls and, for The Listener only, the Read aloud toggle; axe passes on both samples
    - _Requirements: 10.15, 10.25, 10.29, 10.30, 10.31, 10.32, 10.33_
  - [x] 31.6 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 10.1, 10.12–10.15, 10.24–10.34_

- [x] 32. Home hero
  - [x] 32.1 Make the Tagline the h1 and keep the logo only in the Top_Navigation
    - In `src/screens/HomeScreen.tsx` the Hero h1 reads "Haunt your app before your users do." and contains no `HauntLogo`; remove the logo and the standalone "Haunt" text from the Hero
    - `HauntLogo` is rendered only inside the header brand link in `Layout`; give its root `data-haunt-logo` so tests can find it. Haunt card titles stay h2 and the section keeps `aria-label="Haunted sites"`
    - _Requirements: 7.10, 7.11, 7.20, 18.7_
  - [x] 32.2 Build `src/components/HeroGhosts.tsx` and use it in the Hero
    - A `<ul>` of three `<li>` in the order The Listener, The Phantom, Bebe; each has the ghost's SVG character (`aria-hidden="true"`), the ghost's name as visible text in a `<p>`, and the one-sentence respectful description from `model/ghosts.ts` (screen reader's view and keyboard; slow 3G and an old phone; 200% zoom, Punjabi or Hindi, wary of tricky wording)
    - DOM order inside the Hero: h1, short intro, `HeroGhosts`. Set `data-float="hero"` and `--float-delay` of 0 s, 1.5 s and 3 s
    - Hero layout CSS: grid with `minmax(0, 1.2fr) minmax(0, 1fr)` columns from 900 px so the ghosts sit on the right; below 900 px one column with the ghosts under the h1; the list wraps (`flex: 1 1 8rem; min-width: 0`) so there is no horizontal scrolling at 320 px or 200% zoom
    - _Requirements: 7.20, 7.21, 7.22, 7.25, 15.2, 15.4, 18.8_
  - [x] 32.3 Add the hero float to `src/styles/motion.css`
    - Inside `@media (prefers-reduced-motion: no-preference)` only: `haunt-hero-float` moves `translateY(0)` to `translateY(-8px)` over 6 s, applied to `[data-float='hero']` with `animation-delay: var(--float-delay, 0s)`. Outside that query nothing animates, so the Hero_Ghosts are still under Reduced_Motion
    - _Requirements: 7.23, 7.24, 17.1, 17.2, 17.3_
  - [x] 32.4 Update and add unit tests for Home
    - Rewrite the earlier assertions that expect an h1 named "Haunt" so they assert the current requirement: exactly one h1 with the text "Haunt your app before your users do."; the Hero has no `[data-haunt-logo]` and no heading whose text is only "Haunt"; the header brand link has the logo, and it appears nowhere else on the page
    - `HeroGhosts` renders three items in order with visible names and `aria-hidden` SVGs, after the h1 in DOM order; card titles are h2; Outcome_Lines and the side panel checks from task 26.6 still pass; axe passes
    - A CSS source test that the float keyframes exist only inside a `prefers-reduced-motion: no-preference` block and that the travel is at most 12 px
    - _Requirements: 7.10, 7.11, 7.20, 7.21, 7.22, 7.23, 7.24_
  - [x] 32.5 Run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 7.10–7.12, 7.20–7.25_

- [x] 33. Update the Playwright specs (write only, do not run yet)
  - [x] 33.1 Rewrite `e2e/ghostcam-layout.spec.ts` for the new layout
    - Run at 1536×864, 1440×900 and 1920×1080, 100% zoom, for both samples and at every step of each: `documentElement.scrollHeight ≤ innerHeight`; Run_Summary, screenshot or Placeholder, panel, Stuck_Notice slot, Control_Row, timeline, collapsed Provenance_Panel and footer all have `bottom ≤ innerHeight` with `scrollY` 0; the Provenance_Panel is collapsed on load and sits below the timeline
    - Layout stability: the boxes of the screenshot stage, Transcript_Viewport, Stuck_Notice slot, Control_Row and timeline are identical within 1 px at step 1, a finding step and the last step of the Listener sample
    - Control_Row is under the panels and the timeline under the Control_Row; for The Listener the Read aloud toggle shares a row with the Controls; Run_Summary rows are one line each
    - Stacked checks at 320 px, 899 px and 200% zoom (960×540): vertical order per Req 10.26, `scrollWidth ≤ clientWidth`, Transcript_Viewport height identical at every step
    - Keep the existing transcript, order and 320 px checks; do not remove any assertion
    - _Requirements: 10.24, 10.25, 10.26, 10.28, 10.29, 10.31, 10.32, 10.33, 10.34_
  - [x] 33.2 Update `e2e/transcript.spec.ts` and `e2e/home.spec.ts`
    - Transcript: add a long fixture run (about 30 steps derived from the Listener sample) at 1536×864 where the scroller overflows, is focusable and ArrowUp brings an earlier line into view; the Current_Line stays fully visible and `scrollY` does not change
    - Home: replace the "h1 named Haunt" check with the Tagline h1 check; the logo mark appears once, inside the `header`, not in the Hero; at 900 px and wider the three Hero_Ghosts sit to the right of the h1 with names visible, at 899 px below it, `scrollWidth ≤ clientWidth` at 320 px and 200% zoom; with `reducedMotion: 'no-preference'` each Hero_Ghost has a running animation and its top moves by at most 12 px over one cycle; with `reducedMotion: 'reduce'` none animates and positions do not change over 2 seconds; keep the 1280 and 1920 px side panel checks
    - _Requirements: 7.10, 7.11, 7.20–7.25, 10.20, 10.21_

- [x] 34. Final end-to-end run
  - Confirm nothing is listening on port 3001 (check `list_processes` for a running `npm run dev` or `npm run preview` and stop it, and check that port 3001 is free), because the Playwright config starts its own server on that port and `strictPort` would fail otherwise
  - Run `npm run build` in dashboard/, then run the whole suite once with `npm run test:e2e`. Fix real failures in the dashboard code; if the fit test fails, tune `--cam-shot-max` or the Stuck_Notice slot height rather than shrinking text. Never weaken or delete tests
  - _Requirements: 5.6–5.11, 7.10–7.12, 7.20–7.25, 10.12–10.34, 16.7–16.10_

## Third amendment tasks: first visit in 60 seconds

These tasks implement Req 21–23 and the criteria marked "Revised" in Req 6, 7, 8, 9, 10, 12 and 20 (design section "First visit (third amendment)"). They replace behaviour from tasks 11, 13, 15 and the wayfinding work (the Screen_Guide, the seven-item navigation, the "Start here" button). Earlier tasks stay checked as history. Where an existing test asserts removed behaviour (for example the Haunted Map or Séance screens in the axe list), it is rewritten to assert the current requirement with the same or stricter checks; no test is weakened or deleted to make it pass. Tasks 35 to 40 each end with `npm run build` and `npm test` in `dashboard/`. Playwright runs once, in task 42.

- [x] 35. Screens table, routes and Old_Links
  - [x] 35.1 Five Screens in `src/model/screens.ts`
    - `ScreenId` is `home | ghostcam | graveyard | exorcise | coverage`; new Screen_Descriptions; `NAV_ORDER` and `GUIDED_PATH` are home, ghostcam, graveyard, exorcise, coverage; `screenOfRoute` maps `map` to graveyard and `seance` to ghostcam
    - `ScreenIcon` takes `IconId = ScreenId | 'map' | 'seance'`; `NextStop` shows "Back to the start" for Home
    - _Requirements: 20.6, 20.10, 20.11_
  - [x] 35.2 Routes in `src/routes.ts`
    - `graveyardPath({ site, ghost, view })`, `parseRoute` returns `view`; `askPath(runKey, n, ask)` and `parseAsk(value)`
    - _Requirements: 6.2, 9.7, 12.2_
  - [x] 35.3 Old_Link redirects
    - `MapRedirect` and `SeanceRedirect` in `src/screens/redirects.tsx`, routed from `PATTERNS.map`, `PATTERNS.seance` and `PATTERNS.seanceAnswer` with `<Navigate replace>`; the no-runs and unknown-run screens
    - _Requirements: 6.10, 6.11, 23.3_
  - [x] 35.4 Unit tests for the table, routes and redirects
    - `NAV_ORDER`, `nextStop` order and wrap; `graveyardPath`/`askPath`/`parseAsk`/`parseRoute`; each Old_Link lands on its new URL and content; unknown run; no runs
    - _Requirements: 6.10, 6.11, 20.11, 23.3_

- [x] 36. Map_View in the Graveyard
  - [x] 36.1 Move the room and cold-spot components into `src/screens/graveyard/MapView.tsx` with h2 "Map of {site}" and h3 room titles; remove `HauntedMapScreen.tsx` and its CSS module
    - _Requirements: 8.1–8.7_
  - [x] 36.2 Add the "View" choice (Tombstones / Map) with `data-tour="graveyard-views"`, shared site and ghost filters, `view=map` in the URL with replace, focus kept, and the per-view Screen_Intro
    - _Requirements: 9.6, 9.7, 9.8, 9.9_
  - [x] 36.3 Unit tests for the Map_View: rooms, cold spots, fog, view switch, focus
    - _Requirements: 8.1–8.7, 9.7, 9.8_

- [x] 37. Ask_Panel in the Ghost Cam
  - [x] 37.1 Write `src/screens/ghostcam/AskPanel.tsx` and the Ask_Button in the Run_Summary; `goTo` keeps `ask`; remove `SeanceScreen.tsx` and its CSS module
    - Panel overlays `grid-area: panel` with `contain: size` and internal scrolling; Close button; Escape; focus to the first question on open and back to the Ask_Button on close
    - _Requirements: 12.1, 12.2, 12.10, 12.11, 12.12, 10.24_
  - [x] 37.2 Unit tests for the Ask_Panel: open, question, citations, stepping, Escape, Close, focus, axe
    - _Requirements: 12.1–12.3, 12.10–12.12_

- [x] 38. Results first on Home
  - [x] 38.1 Write `src/model/results.ts` (`siteShortName`, `resultsHeading`, `missionVerb`, `resultHeadline`, `watchStep`) and add `blocker` and `thing` to `FINDING_LABELS`
    - _Requirements: 21.1, 21.4, 21.5, 9.4_
  - [x] 38.2 Write property test for the Result_Headline in `src/__tests__/results.properties.test.ts`
    - **Property 14: Result_Headline and Watch_Step follow the rules for every run**
    - **Validates: Requirements 21.4, 21.5, 21.6**
  - [x] 38.3 Render the Results_Sections in `HomeScreen.tsx` after the Hero, move "How Haunt works" below them, remove the Screen_Guide and the tour note about "Next stop"
    - _Requirements: 21.1–21.3, 21.5–21.8, 7.28, 20.8_
  - [x] 38.4 Unit tests for the results model and the Home Results_Section; update the Home tests that assumed the old order
    - _Requirements: 21.1–21.8, 7.28_

- [x] 39. The 60-second tour
  - [x] 39.1 Write `src/model/tour.ts` (`buildTour`, `sentenceCount`, `placeCallout`)
    - _Requirements: 22.1, 22.2, 22.5, 22.11_
  - [x] 39.2 Write property test for callout placement in `src/__tests__/tour.properties.test.ts`
    - **Property 15: The tour callout stays inside the viewport and off its target**
    - **Validates: Requirements 22.5, 22.10**
  - [x] 39.3 Write `src/components/tour/Tour.tsx` (`TourProvider`, `useTour`, the portalled dialog and highlight) and mount it in `Layout`; add `data-tour` targets on Exorcise and Spec Coverage
    - Inert background, focus to Next after each stop loads, Tab wrapping, Escape anywhere, focus return, reduced-motion scrolling, no animation
    - _Requirements: 22.1–22.11_
  - [x] 39.4 Replace "Start here" with "Take the 60-second tour" and its note
    - _Requirements: 7.26, 7.27, 20.12_
  - [x] 39.5 Unit tests for the tour model and component, including axe with the dialog open
    - _Requirements: 22.1–22.11_

- [x] 40. Calmer menu
  - [x] 40.1 One-line items with icon and name from 900 px; Menu_Button below 900 px with descriptions in the open list; Escape and link-follow close it
    - _Requirements: 20.1–20.5, 16.10_
  - [x] 40.2 Unit tests for the menu; run `npm run build` and `npm test` in dashboard/ and fix any failures (never weaken or delete tests)
    - _Requirements: 20.1–20.5_

- [x] 41. Playwright specs and config (write only)
  - [x] 41.1 Set `workers: process.env.CI ? undefined : 3` in `playwright.config.ts`
  - [x] 41.2 Write `e2e/first-visit.spec.ts` (results, tour by keyboard, reduced motion, axe with the tour open, Old_Links, Ask_Panel fit at 1536×864, narrow menu)
    - _Requirements: 6.10, 10.24, 12.10, 20.3, 20.4, 21.1–21.5, 22.1–22.10, 23.2, 23.3_
  - [x] 41.3 Update `haunt.spec.ts`, `nav-fog.spec.ts` and `home.spec.ts` for the five Screens, the Map_View URL, the Menu_Button and the tour button
    - _Requirements: 16.7–16.10, 18.1–18.10, 20.1–20.5_
  - [x] 41.4 Update `dashboard/README.md` with the current URLs and where each Old_Link leads
    - _Requirements: 23.4_

- [x] 42. Final end-to-end run
  - Confirm nothing is listening on port 3001, run `npm run build`, then run the whole suite once with `npm run test:e2e`. Fix real failures in the dashboard code; never weaken or delete tests
  - _Requirements: 10.24, 20.1–20.5, 21, 22, 23_

## Fourth amendment tasks: equal sizes, active copy and the developer's loop

These tasks implement the fourth amendment (design sections "Amendment: equal sizes, active copy and the developer's loop" and "Equal sizes and active copy (fourth amendment)"): Req 7.7, 7.15, 7.17, 7.19, 7.29, 7.30, 8.6, 9.10, 9.11, 10.27, 13.11, 20.7, 20.10, 21.4, 21.6, 21.9 and 21.10. They change only `dashboard/`. The demo site keeps its six deliberate problems. Earlier tasks stay checked as history. Where a test asserted the old wording, its expected string is updated to the new wording with the same checks; no test is weakened or deleted. Each of tasks 43 to 49 ended with `npm run build` and `npm test` in `dashboard/` (`npx vitest --run --maxWorkers=1` when the machine is busy, because parallel workers timed out while starting). Nothing changes the Ghost Cam layout, so Req 10.24 at 1536×864 is unaffected. Playwright runs once, in task 51.

- [x] 43. Graveyard filter bar of equal boxes
  - Make the Site filter a `<fieldset>` with `<legend id>Site</legend>` and a `<select aria-labelledby>` in `src/screens/GraveyardScreen.tsx`; remove `.siteFilter`; `.filters { align-items: stretch }` and `.filters > fieldset { display: flex; align-items: center }`
  - The select keeps the accessible name "Site" (`graveyard-map.test.tsx` finds it by that name)
  - _Requirements: 9.6, 9.10_

- [x] 44. Equal heights on Home
  - [x] 44.1 Haunt cards and "Recent ghost walks": `.body { align-items: stretch }` from 1280 px, `.sites` flex column, `.cards { flex: 1 }`, `.card` and the article (`.cardInner`) flex columns, map link `margin-top: auto`
    - _Requirements: 7.12, 7.29_
  - [x] 44.2 Hero_Ghosts: a `hero-ghosts` size container around the list, three equal columns, each item a three-row subgrid (`row-gap: 0`), `text-wrap: balance` on names and descriptions, one column when the container is narrower than 19 rem
    - _Requirements: 7.21, 7.25, 7.30, 18.8_
  - [x] 44.3 Result_Cards: card and inner flex, text column a flex column with `align-items: flex-start`, the candle (last child) `margin-top: auto`, ghost `align-self: flex-start`
    - _Requirements: 21.7, 21.10_

- [x] 45. Tombstones of equal size
  - `.grid`: drop `align-items: end`, add `grid-auto-rows: 1fr`; `.grid > li { display: flex }` with the article `flex: 1`; `.meta { margin-top: auto }` in `Tombstone.module.css`
  - _Requirements: 9.2, 9.11_

- [x] 46. Next_Stop_Link typography
  - `.name` in the body font, 1.25 rem, weight 700, `--spectral`; `.kicker` inherits the same font, size and weight in `--text`
  - _Requirements: 20.10_

- [x] 47. Active copy in the models
  - `outcome.ts` ("Hit a … at step N", "Hit a technical error at step N", "No steps in this run"), `results.ts` ("{ghost} hit a technical error and couldn't {verb}.", "{ghost} recorded no steps."), `ghosts.ts` `resultSentence`, `findingLabels.ts` (two "helped" answers and the `dark_pattern` blocker), `transcript.ts` (`NOTHING_SPOKEN`, `nothingThought(ghost)`, `nothingAnnounced(ghost)`, used by the Ghost Cam's live region), the Result_Card unlit reason
  - Update the expected strings in `outcome.test.ts`, `outcome.properties.test.ts` (Property 11 oracle), `results.test.ts`, `results.properties.test.ts` (Property 14 oracle), `transcript.test.tsx`, `transcript.properties.test.ts` (Property 9) and `home.test.tsx`
  - _Requirements: 7.15, 7.17, 7.19, 10.27, 12.7, 21.4, 21.6_

- [x] 48. Active copy on the screens
  - Map_View ("{ghost} never entered this room", "Ghosts who entered"), Restless files on Home and the restless screen, the missing-index screen ("No runs found"), the route error screen, the Exorcise different-missions, different-ghosts and Not reached texts, the Spec Coverage legend and changed-requirement note
  - Update the expected strings in `graveyard-map.test.tsx`, `a11y.test.tsx`, `Exorcise.test.tsx` and `e2e/first-visit.spec.ts` (written only; not run yet)
  - _Requirements: 4.12, 8.6, 13.9_

- [x] 49. Lantern Bills and the developer's loop
  - [x] 49.1 Write `src/model/sites.ts` (`siteAbout`) and render the Site_About sentence and the "Try Lantern Bills yourself" link after the Results_Section h2 in `HomeScreen.tsx`
    - _Requirements: 21.9, 19.1_
  - [x] 49.2 Hero Screen_Intro, the "Summon a live ghost" reason, the fourth How_It_Works step (with a 2×2 grid from 900 px and four columns from 1280 px), the Exorcise Screen_Intro, the "No after run yet" hint with the samples-only sentence, and Tour stop 7's body
    - _Requirements: 7.7, 13.11, 20.7, 20.13, 22.2, 22.11_

- [x] 50. Update the spec
  - `requirements.md`, `design.md` and this file describe the fourth amendment; the bugfix spec `exorcise-different-ghost-fix` is unchanged, because "No after run yet for {ghost}" is unchanged

- [ ] 51. Final end-to-end run (left for the House Builder to run when the computer is free)
  - Confirm nothing is listening on port 3001, run `npm run build`, then run the whole suite once with `npm run test:e2e`. Fix real failures in the dashboard code; never weaken or delete tests
  - Pay attention to `home.spec.ts` (Hero_Ghosts right of the h1 from 900 px, wide layout), `first-visit.spec.ts` (Map_View fog text, results heading inside 864 px), `ghostcam-layout.spec.ts` (fit at 1536×864) and the real-browser axe scans, which check the new Site_About contrast
  - _Requirements: 7.29, 7.30, 9.10, 9.11, 10.24, 18.5, 18.8, 18.10, 21.9, 21.10_

- [ ]* 52. Add automated checks for the new layout criteria
  - Playwright: on Home at 1280 px the haunt card column and the side panel have equal heights; the three Hero_Ghost names share one top within 1 px at 900, 1280 and 1920 px; Result_Card candles share a bottom; on the Graveyard the three filter boxes share a height and all Tombstones share a height and their links a bottom; the Next_Stop_Link's kicker and name have the same computed font
  - Unit: `siteAbout` returns the Lantern Bills entry and null for other names; Home shows the Site_About sentence and link after the results h2; the Exorcise notice shows the samples-only sentence only while every Run comes from `runs/samples/`
  - _Requirements: 7.29, 7.30, 9.10, 9.11, 13.11, 20.10, 21.9, 21.10_

## Fifth amendment tasks: real runs win

These tasks implement Req 24 and the criteria marked "(Revised in the fifth amendment)" or "(Added in the fifth amendment)" in Req 7, 10, 12, 18 and 21 (design sections "Amendment: real runs win" and "Real runs and plain words (fifth amendment)"). They change only `dashboard/` and the spec. `runs/` and `runs/samples/` are unchanged. Where a test asserted the old behaviour (a page path in a sentence, the old "Where did you get stuck?" wording, the Listener sample as the Start_Here_Step), it is rewritten to assert the new requirement with the same or stricter checks; no test is weakened or deleted.

- [x] 53. Real runs win
  - [x] 53.1 Write `src/model/origin.ts` (`SAMPLE_LABEL`, `isSample`, `splitRuns`, `byRealThenNewest`, `newestRun`); `useAllRuns` returns `runs` (shown) and `hidden`
    - _Requirements: 24.1, 24.2_
  - [x] 53.2 `groupHaunts` picks `latest` with `newestRun`; `buildCoverage` orders each ghost's runs real first and takes the requirement text from the newest real run
    - _Requirements: 21.2, 24.2, 14.2_
  - [x] 53.3 `SampleTag` component and CSS; add it to the Result_Cards, haunt card rows and earlier-run links, Recent ghost walks, the Ghost Cam requirement row, Tombstones, Map_View Cold_Spots (and their names), Exorcise choices and summaries, and Coverage links
    - _Requirements: 24.2, 18.5, 18.9_
  - [x] 53.4 Hidden_Samples still open by URL: `SeanceRedirect` also looks in `hidden`; `ExorciseScreen` adds a named Hidden_Sample to its list; `useRun` already reads the whole index
    - _Requirements: 24.3_

- [x] 54. Blocking_Findings
  - `blockingFindings` and the revised `watchStep` in `results.ts`; `ghostWatchTarget` and `startHereTarget` in `haunts.ts`; the Phantom and Bebe fallback in `ghostCamTarget`
  - Update Property 14's oracle and the Start_Here fallback and Bebe tour stop unit tests
  - _Requirements: 7.5, 7.6, 21.5, 22.1, 24.4_

- [x] 55. Plain words
  - [x] 55.1 `stuck` and `summary` phrases in `FINDING_LABELS`; `src/model/findingWords.ts` (`trapPlace`, `stuckPhrase`, `evidenceSentence`)
    - _Requirements: 9.4, 10.36, 12.5_
  - [x] 55.2 `pageNames` and `pageName` in `sites.ts`; use it in "Why did you give up?", "Where did you get stuck?", the Exorcise "Not reached" note and the screenshot `alt`
    - _Requirements: 24.8_
  - [x] 55.3 Rewrite "Where did you get stuck?" in `seance.ts`
    - _Requirements: 12.3, 12.5, 12.9_

- [x] 56. One line, expandable
  - [x] 56.1 `components/Expand.tsx` (`ExpandButton`, `ExpandPanel`) and CSS
    - _Requirements: 10.29, 10.36, 18.1, 18.2_
  - [x] 56.2 Run_Summary: the requirement on one line at every size, "Full requirement" opening under it; fit-mode row no longer clips the focus ring
    - _Requirements: 10.24, 10.29_
  - [x] 56.3 Stuck_Notice: `details` in `stuckNotice()`, the Evidence_Sentence as line 3, "Full details" opening above the slot, keyed by step; update Property 13's oracle and the notice unit tests
    - _Requirements: 10.30, 10.31, 10.36_

- [x] 57. Fixed test data
  - [x] 57.1 `dashboard/fixtures/runs/` with copies of both samples and the first real run (no screenshots) and a README; `src/__tests__/fixtures/real.ts`; `realAndSampleFiles()` in `helpers.tsx`
    - _Requirements: 24.9_
  - [x] 57.2 `--runs` and `--out` in `scripts/collect-runs.ts`; `build:e2e` and `preview:e2e` scripts; `mode === 'e2e'` in `vite.config.ts` (`.e2e/public`, `.e2e/dist`); Playwright `webServer` uses them; `.e2e/` in `.gitignore` and the Vitest exclude
    - _Requirements: 24.9, 1.4_
  - [x] 57.3 Write `src/__tests__/realRuns.test.tsx` and update the unit tests listed in the design's "Fifth amendment: fixed test data and new tests"
    - _Requirements: 24.1–24.9, 10.29, 10.36, 12.5_
  - [x] 57.4 Point the Playwright specs at the Fixture_Runs (the real run's step 20 for The Listener) and add the new checks
    - _Requirements: 10.24, 10.29, 10.36, 18.10, 24.1–24.4_

- [x] 58. Update the spec and the README
  - `requirements.md` (Requirement 24, the Glossary and the revised criteria), `design.md` and this file; `dashboard/README.md` (fixtures, `build:e2e`, links to the real run)

- [x] 59. Verify
  - `npm run build` and `npm test` in `dashboard/`; confirm nothing is listening on port 3001; run `npm run test:e2e` once
  - Result: the full run passed 149 of 150. The axe scan of the Graveyard Map view found `label-content-name-mismatch`, because the "Sample run" text was inside a Cold_Spot link whose `aria-label` ends "— open in Ghost Cam". The label moved beside the link (`aria-hidden`, the name keeps " (Sample run)"), and the Map view, Old_Link, reflow and Nav_Fog checks then passed (12 of 12)
  - _Requirements: 1.4, 18.10, 24.9_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Property-test sub-tasks (23.3, 23.4, 26.2, 28.2, 30.2, 38.2, 39.2) are required.
- Every Property_Test describe must be top level and start with `Feature: haunt-dashboard, Property N`, so the pattern in task 28 finds it.
- Playwright ran in task 29 for the first amendment. For the second amendment it runs only once, in task 34. Task 33 only writes the specs.
- Tasks 24 and 26.4 are kept as history; tasks 31 and 32 supersede their layout and h1 behaviour.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["30.1", "31.3", "32.1"] },
    { "id": 1, "tasks": ["30.2", "30.3", "31.1", "32.2"] },
    { "id": 2, "tasks": ["31.2", "32.3"] },
    { "id": 3, "tasks": ["31.4", "32.4"] },
    { "id": 4, "tasks": ["30.4", "31.5"] },
    { "id": 5, "tasks": ["31.6"] },
    { "id": 6, "tasks": ["32.5"] },
    { "id": 7, "tasks": ["33.1", "33.2"] }
  ]
}
```
