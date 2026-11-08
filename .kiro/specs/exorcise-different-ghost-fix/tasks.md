# Implementation Plan

## Overview

The Exorcise screen stops comparing runs by different ghosts. Exploration tests (task 1) fail on unfixed code, and preservation tests (task 2) pass on it, using `compareRunsOriginal` as a frozen oracle. Task 3 applies the fix in the model and the screen. Task 4 rewrites the tests that encode the buggy behavior and adds coverage. Task 5 is the final checkpoint.

## Tasks

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Exorcise never compares runs by different ghosts
  - **CRITICAL**: These tests MUST FAIL on unfixed code. Failure confirms the bug exists
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: The tests encode the expected behavior and will validate the fix when they pass after task 3
  - **GOAL**: Surface counterexamples that show cross-ghost pairs reach the comparison
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to same-mission, different-ghost pairs: `isBugCondition(input) = before.mission.id = after.mission.id AND before.ghost != after.ghost AND before.key != after.key`
  - In `dashboard/src/__tests__/models.properties.test.ts`, add `describe('Feature: exorcise-different-ghost-fix, Property 1: Exorcise only pairs runs by the same ghost on the same mission', ...)`:
    - Property over `runArb('before')`, `runArb('after')` with `after.mission = { ...before.mission }` and `after.ghost` set by `fc.constantFrom` to a ghost other than `before.ghost`: assert `compareRuns(before, after)` equals `{ error: 'different_ghosts' }`
    - Property over a small pool of runs (ghost from `listener`/`phantom`/`bebe`, mission id from `pay-bill`/`autopay`, random `startedAt`, keys `run-i`), as in the design's `runsArb`: assert `defaultAfter(before, runs)` is `null` or has the same ghost and mission as `before`, and `defaultPair(runs)` is `null` or a same-ghost, same-mission pair. Use only functions that exist today (`compareRuns`, `defaultAfter`, `defaultPair`); the `afterCandidates` assertions are added in task 4.3
  - In `dashboard/src/__tests__/Exorcise.test.tsx`, add a `describe('exorcise-different-ghost-fix: bug condition', ...)` block with:
    - Cross-ghost URL `/exorcise/${L}/2026-11-03-bebe-pay-bill`: no table and none of "Exorcised", "Still haunting", "New haunting", "Not reached"
    - Samples only (`sampleFiles()`) at `/exorcise`: Before run value is `2026-11-03-bebe-pay-bill`, the text "No after run yet for Bebe" is shown, and there is no table
    - `/exorcise/${L}/2026-11-05-listener-pay-bill`: the after picker options are exactly `['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']` and exclude `2026-11-03-bebe-pay-bill`. Find the picker by role and accessible name pattern `/After run/` so the test survives the label rename
    - Edge case `/exorcise/${L}/2026-11-07-bebe-autopay` (different mission and ghost): the different-missions alert still shows. This one should pass on unfixed code and guards the check order
  - Run `npm test` in `dashboard/` on UNFIXED code
  - **EXPECTED OUTCOME**: The cross-ghost tests FAIL (this is correct and proves the bug exists)
  - Document the counterexamples in the task notes, for example `defaultAfter(listenerSample, samples)` returns the Bebe run, `compareRuns(listener, bebe)` returns rows with `differentGhosts: true`, and the after picker lists the Bebe run
  - Mark the task complete when the tests are written, run, and the failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Same-ghost comparisons and other states are unchanged
  - **IMPORTANT**: Follow observation-first methodology. Observe the UNFIXED code for inputs where `isBugCondition` is false
  - Before touching `compareRuns`, copy its current matching loop from `dashboard/src/model/exorcise.ts` into `dashboard/src/__tests__/models.properties.test.ts` as `compareRunsOriginal`, with a comment marking it as a test oracle frozen from the pre-fix code
  - Add `describe('Feature: exorcise-different-ghost-fix, Property 2: same-ghost comparisons are unchanged', ...)`:
    - For same-mission pairs with `after.ghost = before.ghost`: `compareRuns(before, after)` has `rows` that deep-equal `compareRunsOriginal(before, after).rows` (status, type, page, before, after, key). Compare `rows` only, so the test passes both before and after the `differentGhosts` field is removed
    - For pairs with different `mission.id` (any ghosts): the result equals `{ error: 'different_missions' }`
    - Use `numRuns: 300`
  - Observe and record on unfixed code: the "Not reached" test at `/exorcise/${L}/2026-11-06-listener-pay-bill`, the different-missions alert, the unknown-run screen, the zero-runs empty state, and the default pair (before `2026-11-05-listener-pay-bill`, after `2026-11-06-listener-pay-bill`) in the existing `Exorcise.test.tsx` tests all pass
  - Run `npm test` in `dashboard/` on UNFIXED code
  - **EXPECTED OUTCOME**: Property 2 and the existing preservation tests PASS (this confirms the baseline)
  - Mark the task complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix Exorcise comparing runs by different ghosts

  - [x] 3.1 Refuse different ghosts in the model and add `afterCandidates`
    - In `dashboard/src/model/exorcise.ts`, change `ExorciseResult` to `{ rows: ExorciseRow[] } | { error: 'different_missions' | 'different_ghosts' }`
    - In `compareRuns`, keep the mission check first, then add `if (before.ghost !== after.ghost) return { error: 'different_ghosts' };`, and return `{ rows }`. Leave the matching loop untouched. Update the header comment to "same mission and same ghost"
    - Add `export function afterCandidates(before: Run, runs: Run[]): Run[]` that filters by different key, same ghost, and same `mission.id`, then sorts a copy with `byStartedAtDesc` from `./format`
    - _Bug_Condition: isBugCondition(input) where before.mission.id = after.mission.id AND before.ghost != after.ghost AND before.key != after.key_
    - _Expected_Behavior: compareRuns returns { error: 'different_ghosts' } with no rows; afterCandidates returns exactly the same-ghost, same-mission runs, newest first_
    - _Preservation: different missions still return { error: 'different_missions' } first; same-ghost rows identical to compareRunsOriginal_
    - _Requirements: 2.1, 2.4, 3.1, 3.2, 3.3, 3.9_

  - [x] 3.2 Choose defaults only from same-ghost pairs and add the `?before=` state
    - In `dashboard/src/screens/ExorciseScreen.tsx`, make `defaultAfter` return `afterCandidates(before, runs)[0] ?? null` and update its doc comment. `defaultPair` keeps its loop and now only yields same-ghost pairs
    - Read an optional `before` search parameter with `useSearchParams`. Resolution order: path keys (unknown key shows `UnknownRunScreen`); `?before=<key>` (unknown shows `UnknownRunScreen`, `after = defaultAfter(before, runs)`, possibly `null`); otherwise `defaultPair(runs)`, falling back to the newest run as before with `after = null` when runs exist; zero runs keep the existing empty state
    - Update `choose(b, a)`: navigate to `exorcisePath(b.key, nextAfter.key)` with `replace: true` when there is an after run, otherwise to `` `${exorcisePath()}?before=${encodeURIComponent(b.key)}` `` with `replace: true`. No change to `routes.ts`
    - _Bug_Condition: isBugConditionForOptions(before, runs), where another ghost has a run of the same mission_
    - _Expected_Behavior: defaultAfter = afterCandidates(before, runs)[0] ?? null; defaultPair returns only same-ghost, same-mission pairs or null_
    - _Preservation: fixture default pair stays 11-05 / 11-06 Listener; picker changes still use replace navigation; unknown keys and zero runs unchanged_
    - _Requirements: 2.2, 2.3, 2.6, 3.4, 3.5, 3.7_

  - [x] 3.3 Fix the Before and After pickers
    - Before picker: remove `disabled={!defaultAfter(r, runs)}` so every run is selectable. In `onChange`, keep the current after run only if it has the same ghost and mission as the new before run and a different key, otherwise pass `null`
    - After picker: `const afterOptions = afterCandidates(before, runs);`
    - When `afterOptions` is empty, render `<p className={styles.notice}>` with "No after run yet for {GHOSTS[before.ghost].name}." and the hint "Run {name} on this mission again after your fix, then come back." Do not render an empty `<select>`
    - Otherwise render the `<select>`, with value `after.key` when `after` is in `afterOptions`, else `''` with a placeholder option "Choose a run by {ghost name}"
    - Rename the label from "After run (same mission)" to "After run (same ghost and mission)"
    - _Bug_Condition: isBugConditionForOptions(before, runs)_
    - _Expected_Behavior: after options are only same-ghost, same-mission runs newest first, or the "No after run yet for [ghost name]" text_
    - _Preservation: picker changes for valid pairs still update the URL with replace navigation_
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 3.7_

  - [x] 3.4 Show the before run alone or the different-ghosts message, with no table
    - When `after` is `null`, render `RunSummary` for the before run (heading "Before") and no table
    - In `Comparison`, keep the `{ error: 'different_missions' }` alert unchanged. Map `{ error: 'different_ghosts' }` to the before `RunSummary` plus `<p className={styles.warning}><strong>Different ghosts.</strong> {before name} and {after name} look for different problems, so these runs can't be compared. Choose an after run by {before name}.</p>`, with no table and no `role="alert"`
    - Remove the old `result.differentGhosts` warning branch
    - _Bug_Condition: isBugCondition(input) with source 'url'_
    - _Expected_Behavior: no status table and no status labels for a cross-ghost pair; the message is text, not color alone, and not failure red_
    - _Preservation: same-ghost comparisons keep both summaries, the "What changed" table or "Neither run found any problems.", and status text plus icon with red only on "New haunting"_
    - _Requirements: 2.4, 2.5, 2.7, 3.3, 3.6, 3.8_

  - [x] 3.5 Add the `.notice` style
    - In `dashboard/src/screens/ExorciseScreen.module.css`, add `.notice { padding: var(--space-3) var(--space-4); border: 2px dashed var(--text-muted); border-radius: var(--radius); background: var(--surface); color: var(--text); }`
    - Use only existing tokens, no hex values and no `--failure`. `--text` on `--surface` is 12.21:1, so no new contrast pair is added. Keep `.warning` for the different-ghosts message
    - _Expected_Behavior: the "No after run yet" message is conveyed in text and does not use the failure red_
    - _Requirements: 2.7, 3.8_

  - [x] 3.6 Verify the bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Exorcise never compares runs by different ghosts
    - **IMPORTANT**: Re-run the SAME tests from task 1. Do NOT write new tests
    - Run `npm test` in `dashboard/` and `npm run build`
    - **EXPECTED OUTCOME**: The task 1 tests PASS (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.7 Verify the preservation tests still pass
    - **Property 2: Preservation** - Same-ghost comparisons and other states are unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2. Do NOT write new tests
    - **EXPECTED OUTCOME**: Property 2 and the preservation example tests PASS. The older tests that encode the buggy behavior or the old label are expected to fail here; list them and rewrite them in task 4
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 4. Rewrite the tests that encode the buggy behavior and extend coverage

  - [x] 4.1 Rewrite the buggy Exorcise screen tests
    - In `dashboard/src/__tests__/Exorcise.test.tsx`, rewrite "shows a new haunting and warns when the ghosts differ" as "refuses to compare runs by different ghosts": at `/exorcise/${L}/2026-11-03-bebe-pay-bill`, assert the "Different ghosts." message, the before summary, no table, and none of the four status labels
    - Move "New haunting" coverage to a same-ghost fixture: add `listenerNewFinding()` to `src/__tests__/fixtures/derived.ts` (a Listener pay-bill run that adds one finding) and assert a "New haunting" row
    - Rewrite "offers only runs of the same mission as the after run" to assert the options are exactly `['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']` in that order
    - Update every `getByLabelText('After run (same mission)')` to "After run (same ghost and mission)". Keep the "picks a default pair on #/exorcise" assertions (before 11-05, after 11-06) otherwise unchanged
    - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.6_

  - [x] 4.2 Rewrite the buggy model unit test
    - In `dashboard/src/__tests__/models.test.ts`, split "marks new findings and flags different ghosts" into "refuses to compare different ghosts" (`compareRuns(before, bebeRun())` equals `{ error: 'different_ghosts' }`) and "marks new findings as new haunting" (same-ghost after run with an extra finding gives a `new_haunting` row)
    - Remove the `expect(result.differentGhosts).toBe(false)` line, because the field no longer exists; keep the row assertions of that test
    - Add unit tests: different missions with different ghosts still return `{ error: 'different_missions' }`; `afterCandidates` on the Listener sample with only the samples returns `[]`; with the 11-05 and 11-06 Listener runs added it returns `[11-06, 11-05]`
    - _Requirements: 2.1, 2.4, 3.1, 3.3_

  - [x] 4.3 Extend Property 1 with `afterCandidates` and update Property 5
    - In `dashboard/src/__tests__/models.properties.test.ts`, extend the task 1 Property 1 block with the design's "after options are same ghost and mission, complete, and newest first" property: the option set equals the filtered expected set, lengths match, `startedAt` is non-increasing, and `defaultAfter(before, runs)` is `options[0] ?? null`
    - Confirm Property 2 still compares against `compareRunsOriginal`, unchanged
    - Update `Feature: haunt-dashboard, Property 5`: the `sameMission` arbitrary also sets `a.ghost = b.ghost`. Keep every partition assertion
    - _Requirements: 2.1, 2.3, 2.6, 3.1, 3.9_

  - [x] 4.4 Add screen tests for the new states
    - In `dashboard/src/__tests__/Exorcise.test.tsx`, add:
      - `/exorcise?before=2026-11-03-listener-pay-bill` shows "No after run yet for The Listener" and no after `<select>`
      - `/exorcise?before=nobody` shows the unknown-run screen
      - Samples only: choosing the Listener run in the Before picker changes the location to `/exorcise?before=2026-11-03-listener-pay-bill` with replace navigation and shows the message
      - Cross-ghost URL: the after picker lists only Listener pay-bill runs; choosing one changes the URL to `/exorcise/${L}/<listener key>` and the table appears
      - Zero runs: the empty-state message is unchanged
    - _Requirements: 2.2, 2.5, 2.6, 2.7, 3.4, 3.5, 3.7_

  - [x] 4.5 Add the accessibility check for the new state
    - In `dashboard/src/__tests__/a11y.test.tsx`, keep "Exorcise across ghosts" at `/exorcise/${L}/${B}` (now the different-ghosts state) with zero axe violations and one `h1`
    - Add "Exorcise with no after run" at `/exorcise?before=${L}`
    - _Requirements: 2.5, 2.7_

  - [x] 4.6 Add the end-to-end assertion
    - In `dashboard/e2e/haunt.spec.ts`, add a test that `#/exorcise` with sample data shows "No after run yet for Bebe" and no table
    - Keep the keyboard (more than 5 focus stops), reduced-motion, reflow at 320 px and 640 px, and real-browser axe tests, including color contrast for `.notice`, running against this state unchanged
    - _Requirements: 2.2, 2.3, 2.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - In `dashboard/`, run `npm run build`, `npm test`, and `npm run test:e2e`; all must pass
  - Run `git status` and `git diff --stat` and confirm nothing under `runs/` or `contract/` changed
  - Ensure all tests pass, and ask the user if questions arise
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

## Notes

- Run `npm run build` in `dashboard/` after each task.
- Edit files only with the built-in file tools, never with shell commands.
- Never weaken or delete a test to make it pass. The tests that encode the buggy behavior are rewritten in task 4.
- Between tasks 1 and 3, `npm test` is expected to fail on the task 1 tests. Between 3.7 and task 4, the old label and cross-ghost tests are expected to fail.
- Nothing under `runs/` or `contract/` changes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.5"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["3.6", "3.7"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 7, "tasks": ["5"] }
  ]
}
```
