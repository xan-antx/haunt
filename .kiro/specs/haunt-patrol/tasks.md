# Implementation Plan: Haunt Patrol

## Overview

Haunt Patrol is built in TypeScript (strict mode, Node 24 type stripping, vitest, fast-check) inside `crew-app/`. The plan builds the pure functions first (seed, command arguments, run-file extraction, records, diff, summary, exit codes 0 to 4, links, shared response-body builders), then the protection check, then the imperative shell (prerequisites, store, site controller, command runner, orchestrator, entry point), then the read-only backend with Crew proxy (HMAC) verification and the React page, and finally the README, the tsconfig and import-extension guards, and the final checkpoint.

Properties 3, 4, 5, 6, 11 and 12 each have a pure half and an integration half. The pure halves sit in early waves next to the functions they test. The integration halves are written after the store and `runPatrol` tasks (as Property 12 already was), because they need the orchestrator, the store and the fakes.

Constraints that apply to every task:

- Do not change anything under `engine/`, `dashboard/`, `demo-site/` or `demo-site-exorcised/`. The only edits outside `crew-app/` are `.gitignore` entries and the `runs/` output the engine already writes.
- Use only erasable TypeScript syntax in `crew-app/src` and `crew-app/scripts` (no enums, namespaces or parameter properties), because Node 24 runs the `.ts` files directly. Every relative import carries an explicit `.ts` extension, and type-only imports use `import type`.
- The Dashboard_Base_URL default is `http://localhost:3001` everywhere (code, tests, README, page text). `HAUNT_DASHBOARD_URL` overrides it.
- Never weaken or delete a test to make it pass. A ghost behaviour that fails a test is a finding to investigate.
- No test starts a browser or a server. Tests use fake `CommandRunner`, `SiteController`, `Probe`, `PatrolStore` and git, or a temporary directory.
- Each property test is tagged `Feature: haunt-patrol, Property N: <text>` and runs at least 100 times. A property with two halves has two separate tests, one per half, each tagged with the property number and its half.

## Tasks

- [x] 1. Scaffold the Crew App and pin the manifest risks
  - [x] 1.1 Create project scaffolding in `crew-app/`
    - Create `package.json` with `"type": "module"` (so `.ts` files and `vite.config.ts` load as ES modules under Node 24), engines `node >=24`, scripts `test`, `typecheck` as `tsc -p tsconfig.json && tsc -p ui/tsconfig.json`, `build:ui`, and `build` (UI bundle only, no emit for the scripts); dev dependencies `typescript`, `vitest`, `fast-check`, `@testing-library/react`, `jsdom`, `@types/node`. The `patrol` and `check:protected` scripts are added by tasks 5.6 and 3.1
    - Create `tsconfig.json` exactly as in the design: `target` ES2023, `module` and `moduleResolution` NodeNext, `strict: true`, `allowImportingTsExtensions: true`, `noEmit: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `skipLibCheck: true`, `types: ["node"]`, `include` of `src`, `scripts`, `test`, and `exclude` of `ui` and `node_modules` (the root config does not cover the UI sources)
    - Create `ui/tsconfig.json` exactly as in the design: `target` ES2022, `lib` `["ES2023", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `module` ESNext, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true`, `isolatedModules: true`, `skipLibCheck: true`, `types: []`, `include` of `src`
    - Create `vitest.config.ts` (it includes tests under `test/` and `ui/src/`) and `data/.gitkeep`
    - Add to the root `.gitignore`: `crew-app/data/*`, `!crew-app/data/.gitkeep`, `crew-app/.patrol/`, `crew-app/ui/dist/`, `crew-app/node_modules/`
    - Create empty `src/` and `test/` folders with a trivial passing smoke test (using an explicit `.ts` import) so `npm test` and `npm run typecheck` run
    - _Requirements: 1.4, 1.5, 1.6, 1.8, 1.9, 1.10, 1.11, 5.7_

  - [x] 1.2 Write the manifest, agent and skill
    - Create `app.json` exactly as in the design (name, version `0.1.0`, displayName, `permissions.network: false`, `permissions.cron: true`, `ui`, `backend` with `entryPoint` `src/backend/server.ts`, `setup`, and the `nightly-patrol` cron with `0 0 * * *`, `Asia/Kolkata`, `strict_schedule: true`, `command` `node crew-app/src/patrol.ts`, `timeout: 900`, `timeout_secs: 905`, no `message`, no `agent`)
    - Create `agents/patrol-guide.json` with `"tools": []` and `skills/reading-patrols/SKILL.md` with front matter and read-only rules
    - Keep the cron entry free of any reference to the agent
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 11.1, 11.2, 11.3_

  - [x] 1.3 Write the risk-pinning manifest test (`test/manifest.test.ts`)
    - Pin every value taken from the requirements but not verified against the Manifest reference: `command` present and equal to the chosen command, `timezone`, `strict_schedule`, `timeout` 900, `timeout_secs >= 905`, no `message` or `agent` on the cron entry, and `backend.type` and `setup.onInstall` shapes
    - Pin the other manifest fields: name, version, displayName, `network: false`, `cron: true`, `cron_expr`, directories `agents/`, `skills/`, `ui/` exist, agent `tools` is empty, the agent name does not appear in the cron entry
    - Put a comment above each unverified group naming the risk (design risks 1 to 5) and the instruction to re-check against the Manifest reference or a `kirocrew app` install before changing the expected value
    - This test is required, not optional, because it is the only guard on the unverified manifest fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 11.1, 11.2, 12.4_

- [x] 2. Implement the pure core
  - [x] 2.1 Implement `src/istDate.ts` and `src/ghosts.ts`
    - `istDate(now)` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', ... })`, `seedForDate(date)`
    - `GHOSTS`, `LANTERN_URL`, `MISSION`, `buildHauntArgs`, `interpretExit` (0 and 3 saved, 130 interrupted, everything else including `null` is `no_run`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10_

  - [x]* 2.2 Write property test for command arguments and shared seed (pure half)
    - **Property 3 (pure half): Command arguments and shared seed**
    - Test only `buildHauntArgs` and `seedForDate`: required arguments present, no `haunt-mcp`, seed is a safe integer
    - The integration half is task 5.13
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x]* 2.3 Write property test for exit code interpretation (pure half)
    - **Property 4 (pure half): Exit code interpretation**
    - Test only `interpretExit`: `saved` for 0 and 3 only (`withError` for 3), `interrupted` for 130 only, `no_run` for everything else including `null`
    - The integration half is task 5.14
    - **Validates: Requirements 4.5, 4.6, 4.7**

  - [x] 2.4 Implement `src/exitCode.ts`
    - `PatrolOutcome` with four variants (`prerequisite_missing`, `site_not_started`, `ran` with `savedRuns`, `crashed`), `EXIT` as `{ ok: 0, prerequisite: 1, siteNotStarted: 2, noRuns: 3, crashed: 4 }`, and pure `mapExitCode`
    - Code 3 means no ghost saved a run, and code 4 means the patrol crashed (an exception escaped or writing the Patrol_Record failed); each of 1, 2, 3 and 4 has exactly one cause
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 2.5 Write property test for exit code mapping (pure half, required)
    - **Property 12 (pure half): Exit code mapping**
    - Assert `mapExitCode` returns 0 exactly when at least one ghost has a saved run (including `gave_up`), 1 for a missing prerequisite, 2 for a site that did not start, 3 for a started site with no saved run, 4 for `crashed`, and that `EXIT` is `{0,1,2,3,4}` with four distinct non-zero failure codes
    - The integration half (an exception inside `runPatrol` after the site started, and a failing `writeRecord`, both give 4 with the site stopped) is covered in task 5.10
    - This test is required by Requirement 12.1
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.1**

  - [x] 2.6 Implement `src/runFile.ts` and `src/record.ts`
    - `extractRunSummary` (never throws, readable errors)
    - `savedRunPath(stdout)`: the last stdout line, trimmed, that is an absolute path (`path.isAbsolute` on the running platform) ending in `run.json`; other lines are ignored, and `null` when no line qualifies
    - `PatrolRecord`, `GhostEntry`, `serializeRecord`, `parseRecord`, `validateRecord` with every rule from the Data Models section (three ghosts once each, `no_run` implies null runId and no findings, counts and titles agree with `findings`)
    - _Requirements: 4.5, 4.6, 4.11, 5.2, 5.3, 5.5_

  - [x]* 2.7 Write property test for run file path extraction
    - **Property 18: Run file path extraction**
    - Generate stdout text with trailing non-path lines, relative paths, paths ending in other names and no qualifying line; for exit code 0 or 3 with a `null` path assert the entry is `no_run` with the "No run.json path was printed." text
    - **Validates: Requirements 4.5, 4.6, 4.11**

  - [x] 2.8 Write unit tests for the Patrol_Record schema (required)
    - A handful of valid records are accepted, and invalid ones are rejected: wrong `version`, bad date, unsafe seed, a missing or duplicated ghost, an unknown `result`, `no_run` with a runId or findings, counts or titles that disagree with `findings`
    - This test is required by Requirement 12.1
    - _Requirements: 5.2, 5.3, 12.1_

  - [x]* 2.9 Write property test for the patrol record round trip (pure half)
    - **Property 5 (pure half): Patrol record round trip**
    - Test only `serializeRecord` and `parseRecord`: `parseRecord(serializeRecord(record))` returns a record equal to the original
    - The integration half (the store writing the dated file and `latest.json`) is task 5.15
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x]* 2.10 Write property test for invalid run files (pure half)
    - **Property 6 (pure half): Invalid run files never count as saved runs**
    - Test only `extractRunSummary`: `ok: false`, non-empty error text, never throws
    - The integration half is task 5.16
    - **Validates: Requirements 5.5**

  - [x] 2.11 Implement `src/summary.ts`
    - `findingKey` (ghost, type, title joined by `\u0000`), `diffRecords` (plain set diff), `selectPrevious`, `PreviousState`, `buildSummary`
    - `buildSummary` applies the "Not checked tonight" rule on top of the diff: for each ghost whose current entry has `result: 'no_run'`, remove that ghost's previous findings from the `fixed` list and print them on a separate `Not checked tonight (<Ghost> had no saved run): ...` line; a Finding_Key counts as `fixed` only when its ghost has a Saved_Run in the current record
    - Plain-word results ("succeeded", "gave up", "error", "no saved run"), the "no previous patrol" message and the "unreadable" message with no comparison section
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 6.10_

  - [x]* 2.12 Write property test for summary coverage
    - **Property 7: Summary covers every ghost and finding**
    - **Validates: Requirements 6.2**

  - [x] 2.13 Write property test for finding classification and "Not checked tonight" (required)
    - **Property 8: Findings are classified as new, fixed or unchanged**
    - Assert that `diffRecords` classifies keys as new, fixed or unchanged with disjoint classes covering the union of keys, and that `resultChanges` are exactly the ghosts whose result differs
    - Assert that `buildSummary` lists a key as fixed only when its ghost has a saved run tonight, and lists every previous finding of a `no_run` ghost under "Not checked tonight" and never as fixed
    - This test is required by Requirement 12.1 (Summary_Builder diff)
    - **Validates: Requirements 6.3, 6.4, 6.10, 12.1**

  - [x] 2.14 Write property test for self-comparison (required)
    - **Property 9: Comparing a record with itself shows no change**
    - Assert zero new findings, zero fixed findings, zero result changes, and every finding unchanged, for `diffRecords(record, record)`
    - This test is required by Requirement 12.2
    - **Validates: Requirements 6.7, 12.2**

  - [x]* 2.15 Write property test for previous record selection
    - **Property 10: Previous record selection**
    - **Validates: Requirements 6.5, 6.6**

  - [x]* 2.16 Write property test for an unreadable previous record (pure half)
    - **Property 11 (pure half): Unreadable previous record**
    - Test only `buildSummary` with an `unreadable` previous state: the summary says the previous patrol was unreadable and has no new/fixed/unchanged comparison section
    - The integration half (`loadPrevious` and `runPatrol`) is task 5.17
    - **Validates: Requirements 6.9**

  - [x] 2.17 Implement `src/dashboardLink.ts`
    - `dashboardBaseUrl(env)` (default `http://localhost:3001`; `HAUNT_DASHBOARD_URL` when set and non-empty) and `dashboardRunUrl(base, runId)` as `<base without trailing slashes>/#/run/<encodeURIComponent(runId)>`
    - Do not read or edit `dashboard/vite.config.ts`
    - _Requirements: 9.5_

  - [x]* 2.18 Write property test for dashboard link construction
    - **Property 14: Dashboard link construction**
    - Include the default `http://localhost:3001` when the variable is unset or empty
    - **Validates: Requirements 9.5**

  - [x] 2.19 Implement the shared response-body builders in `src/backend/handler.ts`
    - Export `latestBody(record, dashboardBaseUrl)` returning `{ record, dashboardBaseUrl }` and `summaryBody(summary)` returning `{ summary }`, plus the `BackendFiles`, `BackendRequest`, `BackendOptions` and `BackendResponse` types from the design
    - Both the backend handler (task 6.2) and the static fallback export (task 5.2) call these functions, so the two bodies cannot drift apart
    - _Requirements: 10.3, 10.6, 10.7_

- [x] 3. Implement the protection check
  - [x] 3.1 Implement `src/protected.ts`, `scripts/check-protected.ts` and the npm script
    - `PROTECTED_FOLDERS`, pure `findProtectedPaths(lines)` (normalise `\` to `/`, strip a leading `./`, match when the first path segment equals a protected folder name, keep input order), `ProtectionDeps`, and `runProtectionCheck(deps)` which calls `git(['diff', '--name-only'])`, returns 1 and prints the error when git fails, prints each protected path and returns 1 when any is listed, and returns 0 otherwise
    - `scripts/check-protected.ts` is the thin runner: spawn `git` without a shell with `cwd` set to the repository root and call `process.exit(runProtectionCheck(...))`
    - Add the `check:protected` script (`node scripts/check-protected.ts`) to `crew-app/package.json`
    - _Requirements: 1.7, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x]* 3.2 Write property test and unit tests for the protection check
    - **Property 17: Protection check path matching**
    - **Validates: Requirements 1.7, 13.2, 13.3, 13.4, 13.5**
    - Unit tests with a fake git: no output gives 0; a path under each of the four folders gives non-zero and is printed; a git failure gives non-zero and prints the error; `engine-notes/x.md` and `crew-app/engine/x.ts` are not flagged
    - _Requirements: 13.2, 13.3, 13.4, 13.5_

- [x] 4. Checkpoint - Run the tests and fix failures
  - Run the tests and fix failures.

- [x] 5. Implement the imperative shell and orchestrator
  - [x] 5.1 Implement `src/prerequisites.ts`
    - `Probe`, `Missing`, `checkPrerequisites` in the documented order with the exact fix texts, reporting every missing item and installing nothing
    - Real Chromium probe that runs `node --input-type=module -e ...` with `cwd` = `engine/` and returns false when Playwright cannot be imported
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 5.2 Implement `src/store.ts`
    - `PatrolStore` over `<repoRoot>/crew-app/data/patrols/`: `loadPrevious` (dated-file pattern `^\d{4}-\d{2}-\d{2}\.json$`), atomic `writeRecord` (dated file and `latest.json`, same text, same-date overwrite), `writeSummary`
    - `exportStatic(record, summary, dashboardBaseUrl)` writes `ui/dist/data/latest.json` as `latestBody(record, dashboardBaseUrl)` (`{ record, dashboardBaseUrl }`) and `ui/dist/data/summary.json` as `summaryBody(summary)` (`{ summary }`), using the shared builders from task 2.19
    - `exportStatic` creates `ui/dist` and `ui/dist/data` when missing and overwrites both files on every call, so each patrol rewrites the fallback from the newest record; it deletes nothing else under `ui/dist`
    - The `latest.json` in `data/patrols/` holds the plain record only
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 6.6, 6.8, 9.5, 10.3, 10.4_

  - [x] 5.3 Implement `src/site.ts` and the real `CommandRunner`
    - Export the pure `buildSiteCommands(repoRoot)` returning the build and preview argument lists and the build `cwd`. Compute `buildDir = path.resolve(repoRoot, 'crew-app', '.patrol', 'site-build')` and pass it as the absolute `--outDir` value in both commands (never a relative path, because Vite resolves a relative `--outDir` against `demo-site/`, which would write into a protected folder)
    - `createSiteController` with port check, Vite build into `buildDir` (build `cwd` = `demo-site/`), `vite preview --strictPort` on port 3000, readiness polling for the `Lantern Bills` title, `taskkill /pid <pid> /T /F` on `win32` and `SIGKILL` elsewhere, `shell: false`, `HAUNT_UNDER_TEST` removed from the child environment; the controller takes its commands only from `buildSiteCommands`
    - `CommandRunner` that spawns `process.execPath` with `cwd` = `engine/`, a 180 s timeout, output bounded to 8 000 characters
    - Import nothing from `dashboard/`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 3.11_

  - [x]* 5.4 Write unit tests for the site controller with a fake spawner
    - Build and preview arguments including `--strictPort`, `shell: false`, ready polling, title mismatch gives not started, port conflict refuses to start, build failure gives not started with the reason, `taskkill /T /F` on `win32`, `SIGKILL` elsewhere
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11_

  - [x] 5.5 Implement `src/runPatrol.ts`
    - `PatrolDeps` (including `dashboardBaseUrl`) and `runPatrol` following the documented flow: prerequisites, site start, ghost loop with per-ghost error capture, `finally` stop, record, previous load, summary, writes, static export, printed summary, exit code from `mapExitCode`
    - For exit 0 or 3 take the path from `savedRunPath(stdout)`; when it is `null` record `no_run` with the text `No run.json path was printed.`
    - Call `store.exportStatic(...)` at the end of every patrol (after `writeRecord` and `writeSummary`), so the fallback files are rewritten each night
    - Do not swallow a `writeRecord` failure or any other escaping exception: they propagate after the site is stopped, so `patrol.ts` can map them to exit code 4
    - Run only the commands listed in the design; never `npm`, `npx` or `collect-runs`
    - _Requirements: 2.5, 3.9, 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 8.2, 8.3, 10.3, 10.4_

  - [x] 5.6 Implement the entry point `src/patrol.ts`
    - Export a `main(deps)` function so tests can inject a fake `runPatrol`; compute `repoRoot` from `HAUNT_REPO_ROOT` or `import.meta.url`, read `HAUNT_DASHBOARD_URL` once through `dashboardBaseUrl(process.env)`, and wire the real dependencies
    - Wrap `runPatrol` in a top-level `try`/`catch`: print the error text to standard error and exit with `mapExitCode({ kind: 'crashed' })`, which is 4 (not 3)
    - Add the `patrol` npm script
    - _Requirements: 2.5, 4.4, 7.4, 7.5, 7.6, 8.3_

  - [x]* 5.7 Write property test for the site always being stopped
    - **Property 1: Site is always stopped**
    - **Validates: Requirements 3.9**

  - [x]* 5.8 Write property test for ghost order and interruption
    - **Property 2: Ghosts run in fixed order and stop on interruption**
    - **Validates: Requirements 4.1, 4.8, 4.9**

  - [x]* 5.9 Write property test for the prerequisite report
    - **Property 13: Prerequisite report is exact and stops the patrol**
    - **Validates: Requirements 8.1, 8.2**

  - [x] 5.10 Write the fake-based tests for `runPatrol` and `main` (required)
    - Fake command runner, fake site controller, fake probe and in-memory store: summary printed and saved, `summary.md` and `latest.json` written, same-date overwrite, no `npm` or `collect-runs` call, exit 0 when a ghost gave up, exit 3 when no ghost saved a run, exit 2 when the site did not start, exit 1 when a prerequisite is missing
    - Exit 0 or 3 with no absolute `run.json` line gives a `no_run` entry with the text `No run.json path was printed.`
    - A ghost with no saved run tonight and findings last night gives a "Not checked tonight" line and no fixed entry for that ghost
    - Crash cases (integration half of **Property 12**): a fake `runPatrol` that throws inside `main`, a throwing command runner step after the site started, and a failing `writeRecord` each give exit 4 and the site is stopped
    - These tests are required by Requirement 12.3
    - _Requirements: 2.5, 3.9, 4.11, 5.6, 6.8, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 8.3, 12.3_

  - [x]* 5.11 Write unit tests for the store and the import rule
    - Store: `loadPrevious` ignores `latest.json`, a missing previous gives `none`, writes are atomic and the same-date write replaces the earlier file, `data/patrols/latest.json` holds the plain record
    - `exportStatic` writes both files under `ui/dist/data/`, and their bodies equal `latestBody` and `summaryBody`
    - Text-scan test that no file under `crew-app/src` imports `liveGhost` or anything from `dashboard/`, and none references `haunt-mcp`
    - _Requirements: 3.10, 4.4, 5.4, 5.6, 10.3_

  - [x] 5.12 Write the pure-function test for the site build command (required)
    - Test `buildSiteCommands(repoRoot)` in `test/siteCommands.test.ts` with no spawning: the build command's `--outDir` value satisfies `path.isAbsolute`, equals `path.resolve(repoRoot, 'crew-app', '.patrol', 'site-build')`, and lies under `<repoRoot>/crew-app/.patrol`
    - The preview command carries the same absolute `--outDir`; the build `cwd` is `demo-site/`; no argument names a path inside `demo-site/` or any other protected folder as output
    - Run it with at least two different `repoRoot` values (one Windows-style, one POSIX-style, using `path.win32` or `path.posix` helpers where the platform allows) so a relative path cannot slip through
    - This test is required because it guards the protected `demo-site/` folder (design risk 9)
    - _Requirements: 3.1, 1.7_

  - [x]* 5.13 Write property test for command arguments and shared seed (integration half)
    - **Property 3 (integration half): Command arguments and shared seed**
    - In `test/runPatrol.seed.test.ts`: for any clock instant, `runPatrol` with fake dependencies sends every command to the fake command runner with the same `--seed` equal to `seedForDate(istDate(instant))`, and that value is the `seed` in the Patrol_Record written to the store
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x]* 5.14 Write property test for exit code interpretation (integration half)
    - **Property 4 (integration half): Exit code interpretation**
    - In `test/runPatrol.exit.test.ts`: for any exit code the fake command runner returns for a ghost, the Patrol_Record entry carries that exit code, and its `result` is `no_run` whenever `interpretExit` gives `no_run` or `interrupted`
    - **Validates: Requirements 4.5, 4.6, 4.7**

  - [x]* 5.15 Write property test for the patrol record round trip (integration half)
    - **Property 5 (integration half): Patrol record round trip**
    - In `test/store.roundtrip.test.ts` with `PatrolStore` on a temporary directory: after `writeRecord` the dated file and `latest.json` are byte-identical and equal to `serializeRecord(record)`, and writing a second record with the same date replaces the first
    - **Validates: Requirements 5.1, 5.4, 5.6**

  - [x]* 5.16 Write property test for invalid run files (integration half)
    - **Property 6 (integration half): Invalid run files never count as saved runs**
    - In `test/runPatrol.invalid.test.ts`: for any non-run-file text returned by the fake file reader as a ghost's `run.json`, the Patrol_Record entry has `result: no_run`, `runId: null` and non-empty error text
    - **Validates: Requirements 5.5**

  - [x]* 5.17 Write property test for an unreadable previous record (integration half)
    - **Property 11 (integration half): Unreadable previous record**
    - In `test/store.previous.test.ts` with a temporary directory and fake dependencies: for any text that does not parse as a valid Patrol_Record placed in the file of the newest earlier date, `loadPrevious` returns the `unreadable` state with that date, and `runPatrol` still completes and prints a summary built from that state
    - **Validates: Requirements 6.9**

  - [x] 5.18 Write the static fallback survival tests (required)
    - In `test/staticFallback.test.ts` with a temporary directory: build the fallback with `exportStatic`, then simulate a UI rebuild by writing a new `ui/dist/index.mjs` into the same folder without clearing it, and assert `ui/dist/data/latest.json` and `ui/dist/data/summary.json` are still present with unchanged content
    - Run `runPatrol` with fake dependencies twice with different records and assert both data files are rewritten from the newest record each time; delete `ui/dist` before a patrol and assert the patrol recreates both files
    - Assert the static `latest.json` body equals `{ record, dashboardBaseUrl }` and the static `summary.json` body equals `{ summary }`
    - The `emptyOutDir` setting itself is checked in task 7.4
    - _Requirements: 10.3, 10.4_

- [x] 6. Implement the read-only backend with Crew proxy verification
  - [x] 6.1 Implement `src/backend/crewProxyConfig.ts` and `src/backend/crewProxy.ts`
    - `CREW_PROXY` config in one file: header name `x-crew-proxy` (documented), secret env var `HAUNT_CREW_PROXY_SECRET`, tolerance 300 seconds, Unix seconds, and the `signedString(timestamp, method, pathWithQuery, body)` function (`<timestamp>.<METHOD>.<path-with-query>.<body>`)
    - Mark each unverified assumption in a comment block (design risk 8: secret source, signed bytes, timestamp unit and tolerance, the gateway's own status code on signing failure) and add the instruction to re-check items (a) to (d) against the Crew docs or a real gateway request before relying on them
    - Pure, fail-closed `verifyCrewProxy(input)` (missing header, missing secret, malformed against `^(\d+):([0-9a-f]{64})$`, stale, bad signature via `crypto.timingSafeEqual` on equal-length buffers) and `signCrewProxy(secret, timestamp, method, path, body)` returning `<timestamp>:<hex hmac>`
    - _Requirements: 10.8, 10.9, 10.11_

  - [x] 6.2 Implement `handleRequest` in `src/backend/handler.ts`
    - Pure `handleRequest(req, files, options)` with `options` `{ dashboardBaseUrl, secret, nowMs }`: no clock, environment or file access of its own
    - Route order: (1) the method check first: any method other than `GET` or `HEAD` gets 405 with `Allow: GET, HEAD`, on every path including `/health`, with no file read; (2) if the path is exactly `/health` (GET or HEAD, any header, including none), return 200 with the body exactly `{"ok":true}` (no space) and no other field, with no header verification and no file read; (3) otherwise verify the Crew_Proxy_Header before any file is read: missing or invalid gives 401 `{"error":"unauthorized"}` and no file read, and the reason is logged to standard error without the secret or the header value; (4) `/latest` (200 `latestBody(record, options.dashboardBaseUrl)`, 404 `no_patrol`, 500 `unreadable` naming `latest.json`), `/summary` (200 `summaryBody(text)`, 404 `no_patrol`), 404 for any other path
    - Only the exact path `/health` is exempt: `/health/x`, `/healthz` and `/health?x` style variants other than the exact route go through verification and get 401 without a valid header
    - HEAD returns an empty body; files are read only through the two fixed names `latest.json` and `summary.md`
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 6.3 Implement `src/backend/server.ts`
    - Thin `node:http` shell on the port from the gateway environment: read the raw request body, read the signing secret from the env var named in `crewProxyConfig.ts`, read `HAUNT_DASHBOARD_URL` through `dashboardBaseUrl(process.env)`, read the clock, implement `files.read` with `fs.readFile` on the two fixed paths under `crew-app/data/patrols/`, and call `handleRequest` with `{ dashboardBaseUrl, secret, nowMs }`
    - The shell adds no routing, verification or health logic of its own: `/health` handling lives only in `handleRequest`
    - The server runs directly under Node 24 type stripping, so there is no backend build step
    - _Requirements: 10.1, 10.5, 10.6, 10.7, 10.8, 10.10, 10.11_

  - [x]* 6.4 Write property test for the Crew proxy verifier
    - **Property 16: Crew proxy verifier**
    - Include examples: a header from `signCrewProxy` verifies; a missing header, a missing secret, a wrong secret, a stale timestamp and a malformed value are each rejected; for every rejected request on a path other than `/health`, `handleRequest` returns 401 and the fake `files.read` is never called
    - **Validates: Requirements 10.8, 10.9, 10.11**

  - [x]* 6.5 Write property test for the backend
    - **Property 15: Backend serves only GET and HEAD, only fixed files**
    - Sign each request with a valid header and use paths other than `/health`; assert `/latest` returns `{ record, dashboardBaseUrl }` using the option passed in, `/summary` returns `{ summary }`, and the `/latest` body equals the static body from `exportStatic`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.5, 10.6, 10.7**

  - [x]* 6.6 Write property test and unit tests for the health route
    - **Property 19: Health is exempt and exact, everything else stays protected**
    - For GET and HEAD, any header value (missing, valid or invalid) and any secret, a request to the exact path `/health` returns 200 with a body that is exactly the string `{"ok":true}` (no space, no other field; HEAD has an empty body) and the fake `files.read` is never called
    - For any method other than GET and HEAD (including POST, PUT, DELETE and PATCH), a request to `/health` returns 405 with `Allow: GET, HEAD` and the fake `files.read` is never called
    - For any path other than exactly `/health` (including `/health/x`, `/healthz`, `/health/`, `/latest`, `/summary` and an unknown path), a GET or HEAD request with a missing or invalid header returns 401
    - Unit examples: `GET /health` with no header gives 200 `{"ok":true}`; with an invalid header it gives the same; `POST /health` gives 405; the body contains no `record`, `summary`, path or version text
    - **Validates: Requirements 10.2, 10.8, 10.9, 10.10**

- [x] 7. Implement the patrol page
  - [x] 7.1 Scaffold `ui/` and write `ui/src/model.ts`
    - `ui/package.json` and `vite.config.ts` as a library build (ES format, externals `react`, `react-dom`, `react/jsx-runtime`, `lucide-react`, `@kirocrew/app-sdk`) with output `dist/index.mjs` and `build.emptyOutDir: false`, so an update rebuild leaves `ui/dist/data/` intact. `ui/tsconfig.json` already exists from task 1.1
    - Pure `badgeLabel(result)` (`Succeeded`, `Gave up`, `Error`, `No run`), `countsText(counts)`, and the load-order logic: fetch both `/latest` (`{ record, dashboardBaseUrl }`) and `/summary` (`{ summary }`); a 404 from `/latest` gives the empty state; any other failure of either call falls back to static `data/latest.json` and `data/summary.json` (same bodies, no HMAC); a 404 on the static file also gives the empty state; a `record` that fails `validateRecord` gives the error naming `latest.json`
    - _Requirements: 9.1, 9.3, 9.4, 9.8, 9.9, 9.11, 10.3, 10.4_

  - [x] 7.2 Implement `ui/src/App.tsx`
    - Default-export page using `useAppApi` and `@kirocrew/app-sdk/ui`: header with IST date, summary card, one `<ul>` row per ghost with text badge and leading symbol, finding counts, "Open <Ghost>'s run in dashboard" link built from the `dashboardBaseUrl` the backend returned (visible text and `aria-label` name the ghost, `rel="noopener noreferrer"`, new tab), the `npm run collect-runs` note, empty and error states
    - The page reads data only through the two routes (or their static equivalents) and reads no file or environment value directly; it never runs `collect-runs`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_

  - [x]* 7.3 Write Testing Library tests for the page
    - Place the tests in `ui/src/App.test.tsx` (with `// @vitest-environment jsdom` and explicit `vitest` imports), so they are type-checked by `ui/tsconfig.json`
    - Four badge texts, link text names the ghost and its address uses the `dashboardBaseUrl` from the `/latest` body, the page fetches both `/latest` and `/summary`, no-patrol state, invalid-record error naming `latest.json`, the collect-runs note, backend failure (including 401) falls back to static data, links reachable by keyboard
    - _Requirements: 9.2, 9.3, 9.5, 9.6, 9.8, 9.9, 9.10, 9.11_

  - [x] 7.4 Write the `emptyOutDir` config test (required)
    - In `test/uiConfig.test.ts`, load `ui/vite.config.ts` (import its default export, or scan its text when it cannot be imported) and assert `build.emptyOutDir` is exactly `false`
    - Assert the build output is `dist/index.mjs`, so the rebuild writes only that file and leaves `ui/dist/data/` alone
    - This test is required because it guards the static fallback against `setup.onUpdate` rebuilds
    - _Requirements: 10.4_

- [x] 8. Document and guard the project
  - [x] 8.1 Write `crew-app/README.md`
    - Skipped nights: if the Crew gateway is not running, or the machine is off or asleep at midnight IST, that night is skipped with no catch-up run
    - Exit codes: 0 at least one ghost saved a run, 1 a prerequisite is missing, 2 the site did not start, 3 the site started but no ghost saved a run, 4 the patrol crashed; patrol exit code 3 is not the engine's exit code 3
    - Setup commands, the `HAUNT_REPO_ROOT`, `HAUNT_DASHBOARD_URL` (default `http://localhost:3001`) and `HAUNT_CREW_PROXY_SECRET` environment variables, the collect-runs note, the `check:protected` script and its limit (`git diff --name-only` lists unstaged changes to tracked files only)
    - Risk note: the unverified Crew proxy facts from design risk 8 (secret source, signed bytes, timestamp tolerance, the gateway's own status code on signing failure) and risk 10 (the dashboard port is owned by the dashboard team)
    - _Requirements: 2.6, 2.7, 7.8, 9.6, 10.11, 13.1_

  - [x]* 8.2 Write a README scan test
    - Read `crew-app/README.md` and assert it contains the skipped-night/no-catch-up statement and the exit-code statement, including that patrol exit code 3 is "not the engine's exit code 3"
    - _Requirements: 2.7, 7.8_

  - [x]* 8.3 Write the tsconfig, package and import-extension tests
    - Assert `tsconfig.json` has `allowImportingTsExtensions`, `noEmit` and `strict` set to `true`, and that its `exclude` contains `ui`
    - Assert `ui/tsconfig.json` has `jsx` set to `react-jsx`, `DOM` in `lib`, `moduleResolution` `bundler` and `strict` set to `true`
    - Assert `package.json` has `"type": "module"` and a `typecheck` script that runs both `tsc -p tsconfig.json` and `tsc -p ui/tsconfig.json`
    - Scan `crew-app/src` and `crew-app/scripts` and fail on any relative import specifier that does not end in `.ts`
    - _Requirements: 1.5, 1.8, 1.9, 1.10, 1.11_

- [x] 9. Final checkpoint - Run the tests and fix failures
  - Run the tests and fix failures.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. These tests are required (no `*`) because Requirement 12 demands them or because they guard a risk: task 1.3 (manifest risk pinning), 2.5 (Property 12 pure half, exit-code mapping), 2.8 (record schema), 2.13 (Property 8, summary diff), 2.14 (Property 9, self-comparison), 5.10 (fake-based runner tests, including the exit 4 crash cases and the Property 12 integration half), 5.12 (absolute `--outDir` under `crew-app/.patrol`), 5.18 (static fallback survival) and 7.4 (`emptyOutDir` is `false`).
- Each task references specific requirements for traceability. Section 10 citations use the renumbered requirements: 10.1 Node backend, 10.2 GET and HEAD only, 10.3 static fallback files, 10.4 fallback survives a rebuild, 10.5 files under `data/patrols/` only, 10.6 `/latest`, 10.7 `/summary`, 10.8 header verified before other processing, 10.9 401 without a valid header, 10.10 `/health` exempt and exactly `{"ok":true}`, 10.11 signing facts as configuration.
- Property tests validate the 19 correctness properties in the design. Properties 3, 4, 5, 6, 11 and 12 each have a pure half (early wave) and an integration half (after the store and `runPatrol` tasks). Unit tests cover examples and edge cases.
- Tasks 1.2, 1.3 and 6.1 should be rechecked against the Kiro Crew Manifest reference, the Crew docs or a real gateway request before the pinned or assumed values are changed.
- Nothing in these tasks edits `engine/`, `dashboard/`, `demo-site/` or `demo-site-exorcised/`.

### Property coverage

| Property | Test task | Required |
|---|---|---|
| 1 Site is always stopped | 5.7 | optional |
| 2 Ghost order and interruption | 5.8 | optional |
| 3 Command arguments and shared seed | pure 2.2, integration 5.13 | optional |
| 4 Exit code interpretation | pure 2.3, integration 5.14 | optional |
| 5 Patrol record round trip | pure 2.9, integration 5.15 | optional |
| 6 Invalid run files | pure 2.10, integration 5.16 | optional |
| 7 Summary covers every ghost and finding | 2.12 | optional |
| 8 New, fixed, unchanged, Not checked tonight | 2.13 | required |
| 9 Self-comparison shows no change | 2.14 | required |
| 10 Previous record selection | 2.15 | optional |
| 11 Unreadable previous record | pure 2.16, integration 5.17 | optional |
| 12 Exit code mapping (0 to 4) | pure 2.5, integration 5.10 | required |
| 13 Prerequisite report | 5.9 | optional |
| 14 Dashboard link construction | 2.18 | optional |
| 15 Backend GET and HEAD only, fixed files | 6.5 | optional |
| 16 Crew proxy verifier | 6.4 | optional |
| 17 Protection check path matching | 3.2 | optional |
| 18 Run file path extraction | 2.7 | optional |
| 19 Health exempt and exact, everything else protected | 6.6 | optional |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.4", "2.6", "2.17", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "2.5", "2.7", "2.8", "2.9", "2.10", "2.11", "2.18", "2.19", "3.2"] },
    { "id": 3, "tasks": ["2.12", "2.13", "2.14", "2.15", "2.16"] },
    { "id": 4, "tasks": ["4"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3", "6.1", "7.1"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.12", "5.15", "6.2", "7.2", "7.4"] },
    { "id": 7, "tasks": ["5.6", "5.7", "5.8", "5.9", "5.13", "5.14", "5.16", "5.17", "5.18", "6.3", "6.4", "6.5", "6.6", "7.3", "8.1"] },
    { "id": 8, "tasks": ["5.10", "5.11", "8.2", "8.3"] },
    { "id": 9, "tasks": ["9"] }
  ]
}
```
