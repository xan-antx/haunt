# Implementation Plan: Haunt Dashboard

## Overview

These tasks build the Haunt dashboard in `dashboard/` as a static React + Vite + TypeScript site on port 3001. Work goes bottom-up: project setup, then the Collect_Step and Data_Module, then the pure models, then the shared components and theme, then the seven screens, and finally accessibility and network checks. Test sub-tasks marked `*` are optional.

## Tasks

- [ ] 1. Set up the dashboard project
  - Create `dashboard/package.json` with dependencies at the versions used in `demo-site/package.json` (react 18, react-dom, react-router-dom, typescript, vite), plus `@fontsource/im-fell-english` and `@fontsource/atkinson-hyperlegible`
  - Add dev dependencies: `@vitejs/plugin-react`, `tsx`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `fast-check`, `axe-core`, `@playwright/test`, `@types/node`, `@types/react`, `@types/react-dom`
  - Scripts: `collect-runs` (`tsx scripts/collect-runs.ts`), `predev` and `prebuild` → `npm run collect-runs`, `dev` (`vite`), `build` (`tsc -b && vite build`), `preview` (`vite preview`), `test` (`vitest --run`), `test:properties` (`vitest --run -t "Feature: haunt-dashboard, Property"`), `test:e2e` (`playwright test`)
  - `vite.config.ts`: React plugin, `base: './'`, `server.port` and `preview.port` 3001 with `strictPort: true`, Vitest config (jsdom, setup file)
  - `tsconfig.json` in strict mode; `index.html` with `lang="en"` and a title
  - `dashboard/.gitignore` with `public/runs/`
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7_

- [ ] 2. Contract types and validation
  - [ ] 2.1 Write `src/data/types.ts` with `Run`, `Step`, `Finding`, `FocusBox`, `RunIndex`, `RunIndexEntry`, `ValidationIssue`, `LoadedRun`, `GhostId`, `RunResult`
    - _Requirements: 3.2, 3.4_
  - [ ] 2.2 Write `src/data/validate.ts` (`validateRun`) following the validation table in the design: required fields and types, `formatVersion` 1, ISO `startedAt`, duplicate step numbers, `result` exactly one of `succeeded`/`gave_up`/`error`, finding `type` exactly one of the eight contract types (no aliases), zero-sized focusBox → null, findings that point to missing steps, unsafe screenshot paths, `ghost` exactly one of `listener`/`phantom`/`bebe`. It must never throw
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [ ]* 2.3 Unit tests for each validation rule, using both samples (Listener: valid with no warnings; Bebe: valid with only the zero-sized focusBox warning) and derived invalid fixtures in `src/__tests__/fixtures/`, including `result: "success"`, `type: "keyboard_trap"` and `ghost: "poltergeist"`, which must all be rejected
    - _Requirements: 4.1–4.8_
  - [ ]* 2.4 Property tests 1, 2 and 7: `validateRun` never throws; contract-shaped runs always validate; only the exact contract `ghost`, `result` and `type` values are accepted
    - _Requirements: 4.1, 4.9_

- [ ] 3. Collect_Step
  - [ ] 3.1 Write `scripts/collect-runs.ts`: delete `public/runs/`, find `runs/**/run.json` in sorted path order, copy each run folder, validate with the shared `validateRun`, compute keys (runId, or the folder path with `/` → `--`), mark duplicate runIds, write `public/runs/index.json`, print warnings, never write to `runs/`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ]* 3.2 Tests on a temporary folder tree: nested runs, an invalid file, a duplicate runId, re-running removes stale files, source files unchanged
    - _Requirements: 2.1–2.8_

- [ ] 4. Data_Module
  - [ ] 4.1 Write `src/data/source.ts` (`RunSource` interface and `selectRunSource()`), `staticSource.ts` (fetch relative to `BASE_URL`, cache each file once per page load, turn fetch and parse failures into `ok: false`), and `screenshots.ts` (safe path check and URL resolution)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.7_
  - [ ] 4.2 Write `src/data/hooks.ts`: `useRunIndex`, `useAllRuns`, `useRun` with loading, error and invalid states
    - _Requirements: 3.1, 3.4, 4.9, 4.12_
  - [ ]* 4.3 Unit tests with mocked `fetch`: caching, 404, bad JSON, missing index
    - _Requirements: 3.5, 4.12_

- [ ] 5. Routes
  - Write `src/routes.ts` with URL builders and parsers for every screen in the design's route table, site-key slugging, and `#/run/:key` → step 1 redirect
  - _Requirements: 6.1, 6.2, 6.3, 6.8_
  - [ ]* 5.1 Property test 6: route round trip for step URLs
    - _Requirements: 6.2_

- [ ] 6. Pure models
  - [ ] 6.1 `ghosts.ts` (names, descriptions and accent tokens from `.kiro/steering/dashboard-design.md`, plus result copy) and `findingLabels.ts` (`FINDING_LABELS`: label and "helped" text for each of the eight finding types, typed as `Record<FindingType, …>` so a missing type fails to compile)
    - _Requirements: 9.3, 9.4, 15.2, 15.4, 16.6_
  - [ ] 6.2 `haunts.ts` (`groupHaunts`, `startHereTarget`)
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_
  - [ ] 6.3 `coldSpots.ts` (`buildRooms`, `coldSpotSize`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ] 6.4 `graveyard.ts` (`buildGraveyard` with site and ghost filters)
    - _Requirements: 9.1, 9.2, 9.6_
  - [ ] 6.5 `seance.ts` (`answer` for the four questions, using the design's templates and the "what would have helped" table, with step citations)
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9_
  - [ ] 6.6 `exorcise.ts` (`compareRuns` with multiset matching by type and page, the not-reached rule, the different-ghost flag and the different-mission error)
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_
  - [ ] 6.7 `coverage.ts` (`buildCoverage` with latest run per ghost and the requirement-changed flag)
    - _Requirements: 14.1, 14.2, 14.3, 14.5_
  - [ ] 6.8 `reproduce.ts` (`reproduceCommand` with shell quoting) and `waveform.ts` (`waveformBars`)
    - _Requirements: 5.3, 5.4, 10.4_
  - [ ]* 6.9 Unit tests checking the expected sample outputs listed under "Data Models" in the design (one Haunt, 3 findings, rooms `/` and `/bill`, 3 cold spots, Start here → step 9, coverage cells)
    - _Requirements: 7.1–7.6, 8.1–8.4, 9.1–9.3, 14.1–14.5_
  - [ ]* 6.10 Property tests 3, 4, 5 and 8
    - _Requirements: 8.4, 12.3, 12.9, 13.3–13.7, 5.3_

- [ ] 7. Checkpoint: data foundation
  - Run `npm run collect-runs` and `npm test`. Confirm `public/runs/index.json` lists both samples as valid, and no file under `runs/` changed

- [ ] 8. Theme, fonts and motion
  - [ ] 8.1 Write `src/styles/tokens.css` and `tokens.ts` with the color values, focus ring rules and font stacks from `.kiro/steering/dashboard-design.md`. Import the two Fontsource fonts in `main.tsx`
    - _Requirements: 16.1, 16.2, 16.3, 18.2, 18.6, 19.2_
  - [ ] 8.2 Write `src/styles/motion.css` with fog, candle flicker, ghost float and glow pulse, following the motion limits in `.kiro/steering/dashboard-design.md`. Add a `useReducedMotion` hook
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [ ]* 8.3 Contrast test that recomputes every documented token pair against the AA thresholds
    - _Requirements: 18.5, 18.6_

- [ ] 9. Ghost characters
  - Draw original inline SVG components for The Listener, The Phantom and Bebe, each with the silhouette, icon and accent from `.kiro/steering/dashboard-design.md`. Build `GhostBadge` (icon plus name) and the accessible-name rules
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 10. App shell and shared components
  - [ ] 10.1 `App.tsx` with `createHashRouter`, layout (SkipLink, header with nav to all screens, main, footer), `RouteAnnouncer` (document title, focus on h1), error boundary, and `NotFoundScreen`
    - _Requirements: 6.1, 6.6, 6.9, 18.1, 18.3, 18.7_
  - [ ] 10.2 `LiveRegion`, `CandleButton` (lit and unlit), `ResultBadge` (icon plus text), `ProvenancePanel` (local time plus ISO, commit, URL, reproduce command, copy button with announcement and fallback), `RunErrorPanel`, `Fog`
    - _Requirements: 4.9, 4.10, 5.1, 5.2, 5.3, 5.5, 18.9_
  - [ ] 10.3 `Screenshot` with `FocusGlow` (ResizeObserver scaling), the Placeholder (16:10, 1280×800 reference) and `onError` fallback
    - _Requirements: 10.2, 10.3_
  - [ ] 10.4 `Tombstone` component
    - _Requirements: 9.2, 9.5_

- [ ] 11. Home screen
  - Haunt cards, the Start here button (target from `startHereTarget`, unavailable with a reason when null), the Summon a live ghost button (`aria-disabled`, focusable, no-op, "Coming soon" text), the Restless files section and the empty state
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 4.12_

- [ ] 12. Ghost Cam screen
  - [ ] 12.1 Layout with mission, result and provenance header, screenshot on the left, SpokenPanel (black, waveform) or ThoughtPanel on the right, step info, the finding callout and "gave up here" copy, and a warnings disclosure
    - _Requirements: 10.1, 10.4, 10.5, 10.6, 10.12, 10.13, 10.15, 4.10_
  - [ ] 12.2 Controls (Play/Pause toggle, Step back, Step forward with unavailable states), 1500 ms playback that stops at the last step and when the tab is hidden, URL replace on each step, and the polite live-region announcement without moving focus
    - _Requirements: 6.4, 6.5, 10.7, 10.8, 10.9, 10.14_
  - [ ] 12.3 Timeline as an ordered list of step buttons with finding marks, labels and `aria-current="step"`
    - _Requirements: 10.10, 10.11_
  - [ ] 12.4 `useApproximateVoice` and the voice toggle: Listener only, off by default, local voices only, cancel on step change, toggle off and unmount, unavailable state with reason, approximation disclaimer
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 17.5_
  - [ ] 12.5 Unknown run key and out-of-range step messages
    - _Requirements: 6.6, 6.7_
  - [ ]* 12.6 Tests with both samples: panel by ghost, Placeholder, playback with fake timers, deep link to step 9 opens paused, timeline `aria-current`, voice behavior with mocked `speechSynthesis`
    - _Requirements: 10.1–10.15, 11.1–11.7_

- [ ] 13. Haunted Map screen
  - Rooms as a list with h2 per page, ghost badges, cold spot buttons sized by `coldSpotSize` with text and accessible names linking to the Ghost Cam, ghost filter in the URL with fog and "Not visited by" text
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 14. Graveyard screen
  - Tombstone grid with site and ghost filters stored in the URL query, and links to Ghost Cam steps
  - _Requirements: 9.1, 9.2, 9.5, 9.6, 6.8_

- [ ] 15. Séance screen
  - Run picker, the four question buttons, an answer panel in a polite live region, step citations as links, and URL state `#/seance/:runKey/:questionId`. No outside calls
  - _Requirements: 12.1, 12.2, 12.3, 12.8_

- [ ] 16. Exorcise screen
  - Before and after pickers (the after list filtered by `mission.id`, with a default pair), side-by-side summaries with provenance, a status table with icon plus text, the different-ghost warning, the different-mission error, and URL state
  - _Requirements: 13.1, 13.2, 13.8, 13.9, 13.10_
  - [ ]* 16.1 Tests using a derived "after" fixture of the Listener sample with the `unlabeled_button` finding removed, plus a fixture that never reaches `/bill`
    - _Requirements: 13.4, 13.5, 13.6, 13.7_

- [ ] 17. Spec Coverage screen
  - Mission table with requirement and goal, per-ghost status cells with icon plus text and links, "Not yet haunted", and the requirement-changed note
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 18. Checkpoint: all screens
  - Run `npm run dev` manually and walk all seven screens with the sample data. Confirm `http://localhost:3001/#/run/2026-11-03-listener-pay-bill/step/9` opens at step 9. Run `npm test`

- [ ] 19. Privacy and build
  - [ ] 19.1 Vite plugin that injects the CSP meta tag in production builds only
    - _Requirements: 19.1, 19.3_
  - [ ] 19.2 Confirm `npm run build` output contains `runs/index.json`, both sample runs and the bundled font files, and that `npm run preview` serves it on port 3001
    - _Requirements: 1.4, 1.5, 1.6, 19.2_

- [ ] 20. Accessibility and end-to-end checks
  - [ ]* 20.1 axe-core checks on every rendered screen in Vitest
    - _Requirements: 18.10_
  - [ ]* 20.2 Playwright suite against `npm run preview`: keyboard-only walk with no traps and visible focus, deep links, a network guard that fails on any request outside `localhost:3001`, reduced-motion check (no running animations), 320 px and 200% zoom with no horizontal scroll, axe scans in a real browser
    - _Requirements: 6.5, 17.2, 18.1, 18.2, 18.5, 18.8, 18.10, 19.1_

- [ ] 21. Documentation
  - Update `dashboard/README.md` with commands, port, where runs come from, deep-link format with example links, how to add a live `RunSource`, and font licenses
  - _Requirements: 1.2, 3.3, 6.2_

- [ ] 22. Final checkpoint
  - Run `npm run build`, `npm test` and `npm run test:e2e`. Confirm every requirement has at least one implementing task, and that no file under `runs/` or `contract/` was modified
