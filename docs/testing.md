# Testing

The [README](../README.md) gives one line per folder. This page holds the detail. Run one suite at a time: when we ran several together, some Vitest workers could not start and one dashboard test timed out. The same suites passed when run alone.

## Unit and property tests

Run `npm test` in the folder named. Counts are from our latest run on the `pre-recording-fixes` branch, and every test passed.

| Folder | Tests | Test files |
|---|---|---|
| `engine/` | 1,071 | 76 |
| `dashboard/` | 561 | 47 |
| `demo-site/` | 123 | 18 |
| `demo-site-exorcised/` | 158 | 20 |
| `crew-app/` | 169 | 29 |

That is 2,082 tests. The `engine/` and `crew-app/` suites also passed on a fresh clone made with `core.autocrlf=true`, the Git for Windows default. The repository's `.gitattributes` keeps every file on LF, and some tests read source files and match text that assumes LF.

The dashboard's data-logic tests (`datalogic.test.tsx`, `phase4.test.tsx` and `fixtures/samples.ts`) read the recorded runs in `runs/`. A new run saved there changes which run counts as "latest", and some tests then fail. Save trial runs with `--out` outside `runs/`. A later task will point these tests at a frozen copy of the recorded runs.

One crew-app test, `test/store.roundtrip.test.ts`, took 2.5 to 3.3 seconds alone, against Vitest's default 5-second timeout. It timed out in earlier runs on our Windows machine, so it can still fail on a slow or busy computer.

## Property tests

Property tests use [fast-check](https://fast-check.dev). A property test is a `describe` whose name starts with `Feature: <spec name>, Property`. Each command runs only those tests, in the folder named. The counts are from the independent README review of this branch, which ran every command.

| Spec | Folder and command | Tests |
|---|---|---|
| `haunt-engine` | `engine/`: `npm run test:properties` | 26 |
| `listener-ai-mind` | `engine/`: `npx vitest run -t "Feature: listener-ai-mind, Property"` | 28 |
| `memos-real-world-haunt` (engine half) | `engine/`: `npx vitest run -t "Feature: memos-real-world-haunt, Property"` | 24 |
| `haunt-dashboard` and two more specs | `dashboard/`: `npm run test:properties` | 37 |
| `lantern-bills` | `demo-site/`: `npm run test:properties` | 20 |
| `lantern-bills`, on the fixed copy | `demo-site-exorcised/`: `npm run test:properties` | 20 |
| `exorcised-payment-a11y-fix` | `demo-site-exorcised/`: `npx vitest run src/__tests__/properties/payment-a11y` | 15 |
| `haunt-patrol` | `crew-app/`: `npx vitest run -t "Feature: haunt-patrol, Property"` | 53 |

The dashboard runner ([dashboard/scripts/test-properties.ts](../dashboard/scripts/test-properties.ts)) fails if no test matches the pattern. The dashboard's 37 include the properties of `exorcise-different-ghost-fix` and 7 of `memos-real-world-haunt`.

The planted-problems tests that the "Planted problems guard" hook runs are `npx vitest --run src/components/__tests__ src/__tests__/translations.test.ts` in `demo-site/`. They prove the six problems are still there.

## End-to-end tests

| Folder | Command | Result |
|---|---|---|
| `dashboard/` | `npm run test:e2e` (run `npx playwright install chromium` once; nothing may listen on port 3001) | 156 tests in 9 files, all passed with `--workers=1` (6.3 minutes) |
| `dashboard/` | `npm run build`, then `npx playwright test --config playwright.recorded.config.ts` | 25 tests in 3 files, all passed |
| `engine/` | `npm run test:e2e` (all three ghosts against Lantern Bills, slow) | 23 tests in 5 files, passed in the independent review (about 18 minutes) |

The dashboard config uses 3 workers on your own computer. Pass `--workers=1` to match our run.

The recorded-run suite reads the real runs in `runs/`. It checks that the Ghost Cam fits on one screen at 1920×1080, 1536×864 and 1440×900 for every recorded run, runs axe-core on 64 states at 1536 px and at 320 px, and scans every screen for text that must never show.

The engine end-to-end suite runs the real command line 10 times per ghost with different seeds and requires each ghost's findings in at least 9 of the 10 runs. It does not print how many of the 10 matched.

| Ghost | What a run has to find |
|---|---|
| The Listener | Result "gave up", with a Button with no name and a Keyboard trap |
| The Phantom | Clicked the wrong thing (seeds 1 to 10) |
| Bebe | Text cut off, Text not translated and a Tricky choice (seeds 1 to 10) |

On the fixed copy, all three ghosts complete the task with no findings. The end-to-end tests cover only the scripted minds. Two engine tests (`listenerSpec.test.ts`, "never sends a pointer, mouse, touch or wheel event", and `listenerBody.test.ts`, "moves no focus with the mouse or touch") are skipped in `ci.yml` on the Linux runner and pass on Windows. Investigating this is a deferred task.

## Keyboard and accessibility checks on the dashboard

- `dashboard/e2e/haunt.spec.ts`, test group `keyboard`: on the five menu screens, plus the Graveyard Map view and the Ghost Cam with and without the Ask panel, Tab starts at "Skip to main content", every stop has a focus ring at least 3 px wide, no stop is visited twice, and Tab leaves the page.
- `dashboard/e2e/ghostcam-recorded-axe.spec.ts`: axe-core on 64 recorded states at 1536 px and at 320 px.
- `dashboard/e2e/forced-colors.spec.ts`: forced-colors mode marks only the current page in the menu.
