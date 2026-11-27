# Design: pre-recording polish

## Phase 1

**Passwords (UI-05).** `dashboard/src/model/secrets.ts` reads the password a mission goal spells out ("password HauntTest123!") and replaces it with dots in the mission, steps and findings of every loaded run. `validateRun` calls it, so every screen, page title and test sees the masked run. The run file on disk is unchanged. `model/sites.ts` has a mission table (`MISSION_WORDS`, keyed by `mission.id`) with a short display goal, a verb phrase and a "done" phrase, and `displayGoal(mission)` returns the short goal when there is one.

**Headlines (UI-06).** `resultHeadline` uses the mission's verb phrase first ("save the note"), then the first word of the goal. The real-world card shows the run's date and a link from the site table's `sourceLink`.

**Ask this ghost (UI-02).** `seance.ts` exports `questionLabel(ghost, question)`. `what-heard` keeps its id, so links keep working. Findings are de-duplicated by step and type (`distinctFindings`), titles are lower-cased inside a sentence (`inSentence`), and the completed answer ends "I finished at step N and <done phrase>." A unit test loads every file under `runs/` through `import.meta.glob` and checks all four answers for `''`, ` : .` and repeated phrases.

**Plain step text (UI-24).** `siteLabel(siteName)` gives "Lantern Bills" and "Lantern Bills (fixed copy)". `plainAction(siteName, action)` swaps a local address for the page name, and the Ghost Cam's step line uses `pageName`. The result sentence and Outcome line say "Completed".

**Running a ghost (UI-11).** `demo-site/package.json` gets `serve:ghosts`: `vite build --base / --outDir .ghost-build --emptyOutDir && vite preview --base / --outDir .ghost-build`. It is the same production build that live mode serves, and it adds no file to `demo-site/src/`. The folder `.ghost-build/` is ignored by git. The Provenance panel shows the hint beside the Reproduce command for runs on the haunted Lantern Bills.

**Kiro evidence (UI-12).** Checked against the code, then ticked: all 19 tasks of `exorcised-remaining-fixes` (code present, build passes, 158 tests pass, `d899259` did not touch `demo-site/`) and `listener-ai-mind` task 11.1 (the AI run is saved in commit `9a7a48b`). The Build check hook lists all five project folders.

## Phase 2: the Ghost Cam

**Thoughts strip (UI-01).** `thoughtStrip(run, n)` in `model/transcript.ts` returns the heading and text for a Listener step (and `null` for other ghosts, whose thoughts are their transcript). `ThoughtsStrip` in `ghostcam/Panels.tsx` is rendered inside the stage (`data-cam-area="shot"`), under the screenshot. It sits there, not in the Spoken_Panel, because a first try inside the panel took about 110 px from the transcript and the fixture suite's "six lines visible" check failed. In fit mode `.cam[data-thoughts='under']` sets `--cam-under-h: 6.25rem`; the screenshot column is `--cam-img-max * 1.6` wide, where `--cam-img-max = --cam-shot-max - --cam-under-h`, so the image still fills its column and the strip fills the rest of the stage. The strip's text region is a labelled region with a fixed three-line height; it takes focus only while it overflows (`useScrollOverflow`) and scrolls with the arrow keys. Its heading is an `h2`, so heading order stays valid.

**Fit and the timeline (UI-04).** `--cam-shot-max = 100vh - --cam-chrome - --cam-notice-h`. The chrome is 20.5 rem. `--cam-notice-h` is 4.5 rem, or 0 when the run has no notice at any step (`data-notices="none"`). The caption strip is no longer reserved under real screenshots; a Placeholder box is narrower (`(img-max - caption) * 1.6`), so its caption fits in the same height. The timeline is a one-row `flex` list with `overflow-x: auto`; a layout effect moves only that list so the current mark is in view. Marks are 28 px in fit mode and 44 px when stacked, and the list has a fixed minimum height so runs with and without finding labels fit alike.

**Stuck notice (UI-10).** The slot has `min-height: 4.5rem` only when the run has a notice (`runHasNotices`). Lines wrap and nothing clips. A step with no notice in such a run shows "No problem was recorded at this step.", which turns the reserved room from a gap into a plain statement.

**Pause and keys (UI-15).** The play control's label is "Pause" while playing and has no `aria-pressed`. `isControl(target)` decides whether a key belongs to a field or control; the Left, Right and Space handler ignores keys with a modifier and keys on controls.

**Screenshots (UI-09).** `preloadOrder(run, n)` lists the screenshots nearest first, next before previous. `usePreloadScreenshots` fetches and decodes three at a time and keeps them alive. `Screenshot` keeps the last decoded image on screen (`aria-hidden`) while the next one loads out of sight, and draws the glow only for the decoded image.

**Phone frame (UI-14, UI-20).** A decoded image taller than 1.2 times its width is a phone screen: the box takes the image's aspect ratio and is fitted by height (`.phone`), with a 6 px frame drawn as a `box-shadow` in `--text-muted`. The scroller no longer scrolls, which removes the scrollable-region violation. `isBlankPixels` samples a 24 by 24 canvas; a blank first step of a Phantom run gets the caption "The page is still loading on slow 3G".

**Checks.** `e2e/ghostcam-recorded-fit.spec.ts` and `e2e/ghostcam-recorded-checks.spec.ts` read the real runs (`playwright.recorded.config.ts`, after `npm run build`). `e2e/ghostcam-layout.spec.ts` keeps the fixture checks. `src/__tests__/ghostcam-polish.test.tsx` covers the words, keys and logic.

## Phase 3: data logic

**Spec Coverage (UI-03).** `buildCoverage` groups by `site.name` and `mission.id`, so a fixed copy has its own row and is never the original's latest. Sites sort as original, its fixed copy, then real-world sites. `missionWords` gains a plain `title` and the `requirementFile` on GitHub (`model/repo.ts` builds the link). The screen has one `tbody` per site and a "Full requirement" button on each row.

**Exorcise (UI-13).** `isFairAfter(before, after)` is the one rule: same ghost, mission and mind, a later run, on the same site or its fixed copy, never a real-world run. `afterOptions` lists them, `defaultAfter` and `defaultPair` use it, and `beforeOptions` leaves Memos out. A URL that names any pair still opens it, so old links and the different-ghost refusal work. `comparisonAnnouncement` is spoken through the live region when the pair changes. `reproduceCommand` ends `--mind ai` for an AI run, and the provenance label is "Haunt commit".

**Counts and the planted-problems line (UI-17).** `latestRuns` keeps each ghost's newest real run (else sample) on each site. The haunt card's finding count and the Graveyard's tombstones use it. `model/planted.ts` holds the explicit mapping: pay button with no name = `unlabeled_button`; "Protect your payment" dialog = `focus_trap` or `dark_pattern`; card errors never announced = `unannounced_error`; late banner = `slow_wait` or `misclick`; cut-off total = `cut_off_text`; missing Punjabi and Hindi text = `untranslated`. A problem is found when a latest Lantern Bills run has a finding of one of its types. It is exorcised when `compareRuns` marks such a finding "Exorcised" for a fair before and after pair on the fixed copy. True numbers from the recorded runs: 6 planted, 5 found, 5 exorcised. No run found the card errors that are never announced.

## Phase 4: first load, deploy and safe delight

**Home on first load (UI-08).** `HomeScreen` no longer returns early while loading. It draws the hero, the ghosts and "How Haunt works", and `ResultsSkeleton` holds three cards of `min-height: 17rem` where the result cards go (the pulse is inside `prefers-reduced-motion: no-preference`). The haunted-sites list and the empty state wait for the runs. The nav shows a disabled Ghost Cam item instead of dropping it. A Playwright check on the real runs with a throttled network measured a layout shift of 0.005 and five menu items throughout.

**Head and 404 (UI-21).** `public/favicon.svg` is a candle. `index.html` has the theme colour and the Open Graph tags, with the image at its full live address. `scripts/og-image.html` is the source of `public/og-image.png` (1200 by 630, rendered by `scripts/render-og-image.mjs`). `public/404.html` and `public/404.css` use system fonts, no script, and link home with absolute `/haunt/` paths.

**Links (UI-22).** The footer has "View on GitHub" (`model/repo.ts`). The After summary on Exorcise has "Try the fixed copy" for a fixed copy that is published (`fixedCopyTryLink`). The real-world page keeps its Memos link from Phase 1.

**Loader and wording (UI-31).** `Loading` shows a still candle and ghost. The missing-index screen and the empty Home no longer name npm commands.

**Not done in this phase.** Enhancements a (a ghost that guides the tour) and c ("Haunt your own site" with commands that were run) were not started. Enhancement b is partly there: the empty Home and the 404 page say "This room is empty" with a plain next step.

## Later phases

Phase 5 adds their design notes to this file when their chat begins, before any code.
