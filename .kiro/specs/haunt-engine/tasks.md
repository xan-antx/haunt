# Implementation Plan: Haunt Engine

## Overview

These tasks build the engine in `engine/`, bottom-up. Phase 1 (tasks 1 to 15) covers the project, the contract schema, safety, missions, the run core, the CLI and The Listener, and ends with The Listener's end-to-end test and one demo run. Phase 2a (tasks 16 to 26) starts only after task 14 passes, and adds the shared visual body and mind, The Phantom and Bebe.

Rules for every task:

- Never create, change or delete files in `dashboard/`, `demo-site/` or `runs/`. The only file outside `engine/` is `contract/run.schema.json` (the contract-guard hook will ask for confirmation).
- Tests write only into `engine/test-output/` and always pass `--out`.
- Use the file tools to create and edit files. Use the terminal only for `npm`, `npx`, `node` and read-only `git` commands, from `engine/`, in PowerShell.
- Every property test and end-to-end test is required. Never weaken or delete a test to make it pass. If a ghost gets stuck in an unexpected way, fix the engine.
- Each task ends with `npm run build` and `npm test` in `engine/` passing, unless the task says otherwise.

## Tasks

### Phase 1: The Listener

- [ ] 1. Set up the engine project
  - Create `engine/package.json`: `"name": "haunt"`, `"private": true`, `"type": "module"`, `"bin": { "haunt": "bin/haunt.mjs" }`, `"engines": { "node": ">=24" }`, and the scripts from the design's "npm scripts" section
  - Dependencies: `playwright` ^1.65.0, `tsx` ^4.23.15, `ajv` ^8. Dev dependencies: `typescript` ^7.0.2, `vitest` ^5.1.0, `fast-check` ^4.10.2, `@types/node` ^24.19.2 (same versions as `dashboard/package.json` where shared)
  - `tsconfig.json` (strict, `module`/`moduleResolution` for bundler-style imports, `noEmit`, includes `src`, `test`, `e2e`, `scripts`), `vitest.config.ts` (excludes `e2e/**`, `env: { HAUNT_UNDER_TEST: '1' }`) and `vitest.e2e.config.ts` (as in the design)
  - `engine/.gitignore` with `node_modules/` and `test-output/`
  - `bin/haunt.mjs` that registers `tsx` and calls `main()` from `src/cli/main.ts`; a temporary `main` that prints the usage
  - Run `npm install` and `npx playwright install chromium`, then confirm in PowerShell that `npx haunt --help` prints the usage and exits 0
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 2.9_

- [ ] 2. Contract types, Run_Schema and invariants
  - [ ] 2.1 Write `contract/run.schema.json` exactly as in the design
    - _Requirements: 3.1, 3.3_
  - [ ] 2.2 Write `src/contract/types.ts` (Run, Step, Finding, FocusBox, GhostId, FindingType, RunResult) and `src/contract/schema.ts` (Ajv 2020 compile of the Run_Schema, `validateSchema(run)` → `{ path, message }[]`)
    - _Requirements: 3.1, 3.4_
  - [ ] 2.3 Write `src/contract/invariants.ts` with every rule in the design's invariant table, and `validate(run, screenshotNames)` combining both layers
    - _Requirements: 3.4, 6.2, 6.4, 6.6, 6.9_
  - [ ] 2.4 Unit tests: `contract/example-run.json` and both `runs/samples/*/run.json` pass the schema; derived invalid copies are rejected: `ghost: "poltergeist"`, `result: "success"`, `type: "keyboard_trap"`, an extra top-level field, an extra step field, empty `steps`, `n: 0`, negative `waitMs`. Invariant tests for gaps, missing finding steps, bad screenshot names, bad Run_Ids and zero-sized boxes
    - _Requirements: 3.2, 3.3, 3.4_

- [ ] 3. Configuration and address safety
  - [ ] 3.1 Write `engine/haunt.config.json`, `schemas/config.schema.json` and `src/config/loadConfig.ts` (missing file, bad JSON and schema failure each give a clear error)
    - _Requirements: 4.4, 4.5, 2.5_
  - [ ] 3.2 Write `src/config/address.ts` with the pure `isAllowedAddress(url, config)` and the refusal message
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ] 3.3 Write `src/config/guard.ts`: `context.route` with a predicate, `routeWebSocket`, blocked URLs printed to standard error; the context is created with `serviceWorkers: 'block'`
    - _Requirements: 4.6_
  - [ ] 3.4 Unit tests: allowed and refused examples (`http://localhost:3000`, `http://127.0.0.1:5173/x`, `http://LOCALHOST`, `http://[::1]`, `http://0.0.0.0`, `http://user:pw@localhost`, `ftp://localhost`, `http://localhost.`, a subdomain of an allowed domain, `javascript:alert(1)`); config errors; a fixture page whose script requests `http://example.com/` gets the request aborted and logged
    - _Requirements: 4.1–4.6_
  - [ ] 3.5 Write property test for address refusal in `test/address.properties.test.ts`
    - **Property 2: Disallowed addresses are always refused before a browser starts**
    - Uses an independent oracle and an injected launcher that counts calls; at least 100 runs
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**

- [ ] 4. Missions
  - [ ] 4.1 Write `schemas/mission.schema.json` and `src/missions/loadMission.ts` (id equals file name, `do: "type"` requires `value`, patterns compile with `iu`)
    - _Requirements: 5.1, 5.2, 5.3, 5.9_
  - [ ] 4.2 Write `engine/missions/pay-bill.json` exactly as in the design, and `src/missions/templates.ts` for `{{futureExpiry}}`
    - _Requirements: 5.4, 5.6, 5.7_
  - [ ] 4.3 Write `src/missions/patterns.ts`: NFC normalisation, whitespace collapsing, language-ordered matching
    - _Requirements: 9.5, 14.1, 18.1_
  - [ ] 4.4 Unit tests: `pay-bill` loads; its `requirement` equals the text of Requirement 2, criterion 9 read from `.kiro/specs/lantern-bills/requirements.md`; `{{futureExpiry}}` gives `11/28` for a November 2026 start and rolls over correctly in December; invalid mission files are rejected with their JSON path; the submit patterns don't match "Pay this bill"
    - _Requirements: 5.1–5.9_

- [ ] 5. Run recording and writing
  - [ ] 5.1 Write `src/core/runId.ts` (format and `-2`, `-3`… suffixes), `src/core/git.ts` (short commit from the repository root, `unknown` with a warning) and `src/core/rng.ts` (mulberry32)
    - _Requirements: 2.3, 2.4, 3.7_
  - [ ] 5.2 Write `src/core/recorder.ts`: Step numbering, `page`, `shots/NNN.png`, focusBox conversion to screenshot pixels and omission rules, `waitMs`, seen screenshots kept in memory
    - _Requirements: 6.1, 6.2, 6.4, 6.6, 6.7_
  - [ ] 5.3 Write `src/core/finalize.ts` (build the run JSON from the mission, site config, URL, commit and recorder; validate) and `src/core/writer.ts` (temp folder, rename, cleanup on failure)
    - _Requirements: 3.4, 3.5, 3.6, 3.8, 3.9, 3.10, 2.1, 2.2_
  - [ ] 5.4 Unit tests: a valid run writes `run.json` plus exactly the referenced shots; an invalid run leaves the out folder unchanged; a simulated rename failure leaves no folder; `site.url` has no trailing slash for `/`
    - _Requirements: 3.5, 3.6, 3.8_
  - [ ] 5.5 Write property test for saved runs in `test/finalize.properties.test.ts`
    - **Property 1: Saved runs always pass the schema and the invariants**
    - Generated runs for all three ghosts, including bad ones; compare the out folder before and after; at least 100 runs
    - **Validates: Requirements 3.4, 3.5, 3.6, 12.1, 20.1**
  - [ ] 5.6 Write property test for Run_Ids in `test/runId.properties.test.ts`
    - **Property 8: Run_Ids are well-formed and unique**
    - **Validates: Requirements 2.3, 2.4**

- [ ] 6. Run loop and detector framework
  - [ ] 6.1 Write `src/core/types.ts` with the interfaces from the design (`Body`, `Mind`, `Decision`, `Detector`, `DetectedProblem`, `DetectorContext`, `StepTrace`, `Probe`, `Ghost`)
    - _Requirements: 7.2, 7.4_
  - [ ] 6.2 Write `src/core/detectors.ts`: run every detector after each Step, de-duplicate by `key`, reject a `stepN` that isn't recorded, `finish()` at the end, read-only `inspect` and CDP wrappers, and turn a thrown error into result `error` with the detector name in the last thought
    - _Requirements: 7.1, 7.3, 7.5, 7.6, 7.8_
  - [ ] 6.3 Write `src/core/runLoop.ts` following the design's pseudocode: Step 1 opens the URL; after each Step run detectors, then the success check, then the ghost's stop rule, then the 60-step limit; give-up thoughts from the Mind; `error` handling
    - _Requirements: 5.8, 6.3, 6.9, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ] 6.4 Unit tests with fake ghosts: success ends the Run even with Findings on that Step; the stop rule gives `gave_up` with the Give_Up_Thought appended; the 60th Step ends the Run; a throwing body gives `error`. Detector purity test on a fixture page: a sample detector's `inspect` calls cause no DOM mutation, focus change or scroll
    - _Requirements: 7.6, 11.1–11.6_
  - [ ] 6.5 Write property test for finding steps in `test/runLoop.properties.test.ts`
    - **Property 3: Every finding points to an existing step**
    - **Validates: Requirements 7.3, 12.1, 20.1**
  - [ ] 6.6 Write property test for step numbering in `test/runLoop.properties.test.ts`
    - **Property 4: Steps are numbered 1 to N with no gaps**
    - **Validates: Requirements 6.2, 6.9, 12.1, 20.1**

- [ ] 7. CLI
  - [ ] 7.1 Write `src/cli/main.ts` with `parseArgs`: `run` and `--help`, all options, checks in the design's order (config, mission, site, address, Out_Root test guard, Chromium), browser launch through an injectable launcher, progress lines, the absolute `run.json` path as the last line, exit codes 0/1/2/3/130, and Ctrl+C handling
    - _Requirements: 1.5, 2.1, 2.2, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 4.3, 4.4, 5.9_
  - [ ] 7.2 Unit tests: each argument error exits 2 without launching; `--help` exits 0 and lists the ghosts; `--out` inside `runs/` is refused under the test runner; a missing Chromium executable prints `npx playwright install chromium` and exits 1
    - _Requirements: 1.5, 2.7, 2.9, 2.10_

- [ ] 8. Checkpoint: core
  - Run `npm run build`, `npm test` and `npm run test:properties` in `engine/`. Confirm Properties 1, 2, 3, 4 and 8 ran and passed, and `git status --porcelain -- dashboard demo-site runs` is empty

- [ ] 9. The Listener's body
  - [ ] 9.1 Write the page scripts `src/page/changeClock.ts`, `liveRegions.ts` and `elementKeys.ts`, installed with `addInitScript`
    - _Requirements: 8.4_
  - [ ] 9.2 Write `src/ghosts/listener/profile.ts` and `ax.ts` (CDP full AX tree → `Heard`, opaque refs, focus, dialog and region)
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ] 9.3 Write `src/ghosts/listener/body.ts` with the `KeyboardOnlyPage` facade, keys, typing, heading and landmark jumps (reading position only), field and button jumps (Tab with the press limit), per-press trace entries, Settle, and focusBox
    - _Requirements: 8.5, 8.6, 8.7, 8.8, 8.10, 8.11, 6.6_
  - [ ] 9.4 Write `src/ghosts/listener/speech.ts` with the rules and role words from the design
    - _Requirements: 8.9_
  - [ ] 9.5 Unit tests on fixture pages: the speech examples (`Pay this bill, button`, `button`, dialog entry, checkbox state, a `role="alert"` announcement); jumps skip non-matching kinds and stop after one cycle; heading jumps don't move focus; the facade has no mouse, click, fill, focus or evaluate; a serialised `Heard` contains no coordinates, sizes, CSS, HTML or image data
    - _Requirements: 8.2–8.10_

- [ ] 10. The Listener's mind
  - [ ] 10.1 Write `src/ghosts/listener/mind.ts`: Intentions in order, `doneWhen`, matching with used refs excluded, the orientation heading jump, jump search with Full_Pass, the dialog search (Tab round, Shift+Tab round, Escape), last resort on unnamed buttons, and giving up
    - _Requirements: 9.1–9.10_
  - [ ] 10.2 Write `src/ghosts/listener/thoughts.ts`: per-decision thoughts and the Give_Up_Thoughts for `trapped`, `no_match` and `step_limit`, built from the Mind's memory
    - _Requirements: 6.8, 9.8, 11.4_
  - [ ] 10.3 Unit tests with scripted `Heard` sequences that copy Lantern Bills' tree: the decisions match the design's expected walk; the same inputs give the same decisions; with no unnamed buttons the Mind gives up with `no_match`
    - _Requirements: 9.1–9.10_

- [ ] 11. The Listener's detectors
  - [ ] 11.1 Write `src/detectors/unlabeledButton.ts`
    - _Requirements: 10.1, 10.2_
  - [ ] 11.2 Write `src/detectors/focusTrap.ts` and the Listener stop rule (`trapped`)
    - _Requirements: 10.3, 10.4, 11.1_
  - [ ] 11.3 Write `src/detectors/errorWords.ts` and `src/detectors/unannouncedError.ts`
    - _Requirements: 10.5, 10.6_
  - [ ] 11.4 Fixture pages and tests, one positive and one negative per detector: an icon-only button versus one with `aria-label`; a trapping dialog with `tabindex="-1"` controls and no Escape versus a dialog whose controls are all reachable and that closes on Escape; an error shown silently versus one in `role="alert"` and one linked by `aria-describedby`. Evidence strings contain the measured facts listed in the requirements
    - _Requirements: 10.1–10.6, 12.2_

- [ ] 12. Register The Listener and run it once by hand
  - Wire `listener` into the ghost registry with its profile, body, mind, detectors and stop rule
  - Start the harness from task 13.1 or run `npm run dev` in `demo-site/` yourself, then run `npx haunt run --ghost listener --mission pay-bill --url http://localhost:3000 --out test-output/manual` in `engine/`. Compare the steps with the design's expected walk and fix differences in the engine
  - _Requirements: 2.1, 8, 9, 10, 11_

- [ ] 13. Lantern_Bills_Harness and The Listener's end-to-end test
  - [ ] 13.1 Write `e2e/harness/lanternBills.ts` as in the design: node_modules check, git status snapshot, port check on IPv4 and IPv6, Vite build into `test-output/.lantern-bills-build` with base `/`, `vite preview` on port 3000 with `--strictPort`, 200 check, and `stop()` without a shell
    - _Requirements: 12.5, 12.6, 12.8, 12.9, 12.10_
  - [ ] 13.2 Write `e2e/listener.e2e.test.ts`: run the CLI 10 times in sequence with `--out test-output/e2e/listener`; require at least 9 runs with `gave_up` and both `unlabeled_button` and `focus_trap`; every run passes the Run_Schema, the Run_Invariants and the dashboard's `validateRun` with no errors; `git status --porcelain -- demo-site` is unchanged; on failure print a table of result, finding types and last thought per run
    - _Requirements: 12.3, 12.4, 12.9_
  - [ ] 13.3 Harness tests: with a dummy server on port 3000 the harness fails with the port message; the server is stopped after a failing test
    - _Requirements: 12.5, 12.6_

- [ ] 14. Checkpoint: The Listener works
  - Run `npm run build`, `npm test` and `npm run test:e2e:listener` in `engine/`. Fix real failures in the engine; never change the thresholds, the demo site or the tests' expectations. Confirm that nothing under `dashboard/`, `demo-site/` or `runs/` changed

- [ ] 15. Listener demo run
  - Write `scripts/demo.ts` (empty `test-output/demo-run/`, start the harness, run The Listener with `--out test-output/demo-run`, validate the `run.json` against the Run_Schema, print its absolute path, stop the server in `finally`)
  - Run `npm run demo` in `engine/` and report the printed path
  - _Requirements: 12.7_

### Phase 2a: The Phantom and Bebe

- [ ] 16. Shared visual body
  - [ ] 16.1 Write `src/page/sight.ts` (Seen_Items, looks, occlusion check, visible text per character, probe item keys), `src/page/clickLog.ts` and `src/page/layoutShifts.ts`
    - _Requirements: 13.2, 17.2, 15.3, 15.4_
  - [ ] 16.2 Write `src/ghosts/visual/body.ts`: Sight then screenshot, click after the Reaction_Delay at the seen centre, typing with the ghost's delay, scroll over the viewport centre, wait, back, Settle on the Page_Change_Clock, waiting spans for `slow_wait`, focusBox of the aimed box
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 17.3, 17.4, 17.5, 6.6_
  - [ ] 16.3 Unit tests on fixture pages: clipped text gives only the visible characters; items under a modal backdrop are left out; a link with `role="button"` looks like a link; the click lands at the centre seen earlier even when the page moved
    - _Requirements: 13.2, 13.4, 17.2_
  - [ ] 16.4 Write property test for visual perception purity in `test/sight.properties.test.ts`
    - **Property 5: Visual perceptions carry no accessibility data**
    - Generated HTML rendered in Chromium through both profiles; at least 100 runs
    - **Validates: Requirements 13.2, 17.2, 20.2**

- [ ] 17. Shared visual mind
  - [ ] 17.1 Write `src/ghosts/visual/mind.ts` and `thoughts.ts`: language-ordered matching, field labels above or to the left, used items skipped, two-Step type intentions, last resort on empty-text buttons, unexpected-page recovery marked `recovery: true`, waiting on empty Sights, scroll search down then up, `no_match`, and the Give_Up_Thoughts
    - _Requirements: 14.1–14.5, 18.1, 18.2, 18.4, 18.5, 16.4_
  - [ ] 17.2 Unit tests with scripted Sights copying Lantern Bills in English and in Punjabi: the decisions match the design's expected walks; "Pay this bill" is found through the `en` fallback for Bebe; the autopay page triggers "Back to bill" as a recovery
    - _Requirements: 14.1–14.5, 18.1–18.4_

- [ ] 18. The Phantom
  - [ ] 18.1 Write `src/ghosts/phantom/profile.ts` (viewport, scale, mobile, touch, user agent, locale) and the CDP throttling setup; Settle 1200 ms; Reaction_Delay 550–650 ms from the seed; typing 120 ms
    - _Requirements: 13.1, 13.3, 13.4, 13.5_
  - [ ] 18.2 Throttling test: a 100 000-byte fixture loaded through The Phantom's profile with the request guard on takes at least 2 seconds, and the same file without throttling takes less than 1 second
    - _Requirements: 20.3_
  - [ ] 18.3 Write property test for reaction delays in `test/delays.properties.test.ts`
    - **Property 6: Reaction delays stay in range**
    - Covers The Phantom and Bebe
    - **Validates: Requirements 13.4, 17.4, 20.2**

- [ ] 19. The Phantom's detectors and stop rules
  - [ ] 19.1 Write `src/detectors/misclick.ts` (aimed versus hit element key, layout-shift entries in the window, seen and after screenshots)
    - _Requirements: 15.3, 15.4_
  - [ ] 19.2 Write `src/detectors/slowWait.ts` (no-progress spans across waiting Steps)
    - _Requirements: 15.1, 15.2_
  - [ ] 19.3 Write `misclickStreak` and The Phantom's stop rules (`slow_wait`, `misclicks`)
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [ ] 19.4 Fixture pages and tests: a button that moves 1 s after load under a link versus a stable button; a page blank for 12 s after load versus a page with a visible spinner for 12 s; `NNN-seen.png` is written only when a Finding refers to it
    - _Requirements: 15.1–15.4, 20.3_
  - [ ] 19.5 Write property test for the misclick streak in `test/misclick.properties.test.ts`
    - **Property 7: Two misclicks in a row end the Run exactly then**
    - **Validates: Requirements 16.2, 20.2**

- [ ] 20. Bebe
  - [ ] 20.1 Write `src/ghosts/bebe/profile.ts` (640×400, scale 2, `pa-IN`, Accept-Language), Settle 2000 ms, Reaction_Delay 1300–1700 ms, typing 300 ms, languages `pa`, `hi`, `en`; no stop rule from Findings
    - _Requirements: 17.1, 17.3, 17.4, 17.5, 18.3_
  - [ ] 20.2 Write `src/detectors/cutOffText.ts`
    - _Requirements: 19.1, 19.4_
  - [ ] 20.3 Write `src/detectors/untranslated.ts` (allowed terms from the site config, acronyms, digit tokens, typed values left out)
    - _Requirements: 19.2, 19.4_
  - [ ] 20.4 Write `src/detectors/money.ts` and `src/detectors/darkPattern.ts` (bill amount from the first page, pre-ticked paid checkbox not touched by the ghost, total higher than the bill)
    - _Requirements: 19.3, 19.4, 19.5_
  - [ ] 20.5 Fixture pages and tests, one positive and one negative per detector: clipped versus scrollable overflow; English words versus allowed terms, acronyms and numbers on a `lang="pa"` page; a pre-ticked ₹99 option versus an unticked one and one the ghost ticked itself; a raised total versus an equal one. The viewport-or-first-present step rule is tested with an element below the fold
    - _Requirements: 19.1–19.4, 20.3_

- [ ] 21. Register The Phantom and Bebe and run each once by hand
  - Wire both into the ghost registry. Run each against Lantern Bills (through the harness) with `--out test-output/manual --seed 1`, compare with the design's expected walks, and fix differences in the engine
  - _Requirements: 13–19_

- [ ] 22. Checkpoint: Phase 2a core
  - Run `npm run build`, `npm test` and `npm run test:properties`. Confirm Properties 1 to 8 ran and passed, and that Properties 1, 3 and 4 generate runs for all three ghosts
  - _Requirements: 20.1, 20.2_

- [ ] 23. The Phantom's end-to-end test
  - Write `e2e/phantom.e2e.test.ts`: harness, 10 sequential CLI runs with seeds 1 to 10 and `--out test-output/e2e/phantom`; require a `misclick` Finding in at least 9 runs; schema, invariants and dashboard `validateRun` with no errors; `demo-site` git status unchanged; per-run table on failure
  - _Requirements: 20.4, 20.6_

- [ ] 24. Bebe's end-to-end test
  - Write `e2e/bebe.e2e.test.ts`: harness, 10 sequential CLI runs with seeds 1 to 10 and `--out test-output/e2e/bebe`; require `cut_off_text`, `untranslated` and `dark_pattern` Findings in at least 9 runs; schema, invariants and dashboard `validateRun` with no errors; `demo-site` git status unchanged; per-run table on failure
  - _Requirements: 20.5, 20.6, 19.5_

- [ ] 25. Checkpoint: all ghosts
  - Run `npm run build`, `npm test` and `npm run test:e2e` in `engine/`. Fix real failures in the engine; if The Phantom's misclick rate is below 9 of 10, check the timing analysis in the design (Settle length, when the Sight is taken) rather than the threshold. Confirm nothing under `dashboard/`, `demo-site/` or `runs/` changed

- [ ] 26. Demo runs for every ghost
  - Extend `scripts/demo.ts` with `--all`: empty `test-output/demo-runs/`, write one run per ghost (The Listener, The Phantom and Bebe, seed 1), validate each `run.json` against the Run_Schema, print each absolute path, and stop the server
  - Update `engine/README.md` with install steps, the `haunt run` command and options, exit codes, the safety rules, and the test and demo scripts, all as PowerShell commands
  - Run `npm run demo:all` in `engine/` and report the three printed paths. Confirm with `git status --porcelain -- dashboard demo-site runs` that nothing changed there
  - _Requirements: 20.7, 1.3, 1.7_
