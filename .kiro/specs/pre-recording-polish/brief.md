# Pre-recording polish: brief

WORKING IN PHASES: Do one phase per chat. In each chat, do ONLY the phase asked for, commit, then stop and report. If you run low on room mid-phase, stop at a clean point and say exactly what is next.

KEEP IT LEAN: no exploratory browsing; run single test files instead of whole suites where that's enough.

END-TO-END: don't run the full end-to-end suites until the FINAL CHECK, and only when the user says so.

MEMOS_ISSUE_URL: none

You are fixing Haunt (this repo) before we record the hackathon demo video. An independent review of commit 38b72f4 found 32 problems (UI-01 to UI-32) and ranked some enhancements. Fix them in the phases below, in order. The full report, with evidence, is at `haunt-review/REPORT.md` (a sibling folder of this repo on the user's machine); screenshots are in `shots/evidence/` and check scripts in `scripts/` in that folder. Read the report first. Where this brief and the report differ, this brief wins.

## WHY THIS MATTERS

Judges score five things equally: Potential Impact, Technological Implementation (how well we use Kiro), Design (a complete, polished product), Innovation, and Presentation. They asked for simple, focused products, to see how specs, steering and hooks were used, and for "scare me, then make it easy": mischief that never costs clarity.

## RULES THAT MUST NEVER BREAK

- demo-site/ (Lantern Bills) keeps all six planted problems exactly as they are. demo-site-exorcised/ keeps none of them. Leave the planted-problems guard hook and every other hook switched on.
- Never edit, add or delete anything in runs/. Recorded runs are evidence. Fix how the dashboard shows them, not the files.
- The Ghost Cam fits on one screen with no scrolling at 1920x1080, 1536x864 and 1440x900 for EVERY recorded run, after every change.
- No calls to outside services; the CSP stays as strict as it is. Ordinary links to GitHub are fine. Any new image or font is committed to the repo.
- Keep: hash URLs, the five-item menu, the candlelit theme, serif for headings only, the 60-second tour with 8 stops, the "AI mind", "Sample run" and "after the fix" labels, and live mode's honest message online.
- Our own product stays accessible: axe reports 0 violations on every dashboard state at 1536 px and 320 px; everything works by keyboard; focus is visible; changes are announced; reduced motion is respected; click targets are at least 24 px; contrast follows steering/dashboard-design.md.
- Never show anything untrue. Every number on screen comes from the run files.
- No TODO, placeholder or local Windows path in anything you write.

## HOW TO WORK

- Create a branch called pre-recording-fixes. Commit after each phase with the finding IDs in the message. Don't push to main and don't deploy; the user will merge.
- Do this the Kiro way, because judges will read .kiro/. Create a spec at .kiro/specs/pre-recording-polish/ with requirements, design and tasks covering every finding by its ID, then carry on without waiting for approval. Where a fix changes an existing requirement (haunt-dashboard Req 7, 10, 10.7, 10.24, 20.1 and 25.5; Memos design section 8), amend that spec too. Tick each task when it's really done.
- Every fix gets a test that would have caught it. Extend existing tests rather than adding parallel ones.
- This laptop is short on memory: run one test suite and one browser at a time, with one worker.
- At the end of each phase run: unit tests and build for every package you touched, the demo-site tests (to prove the six planted problems survive), and the Ghost Cam fit check. Fix what fails before moving on.
- STOP AND ASK if a fix would need a change to runs/, would weaken a planted problem, can't be done without breaking the Ghost Cam fit, would need an outside call, or would make an existing test fail in a way that means intended behaviour changes.

## PHASE 1: WORDS AND DOCS (low risk)

UI-02 Ask this ghost (answer builder, probably dashboard/src/model/seance.ts). For The Phantom and Bebe, replace "What did you hear?" with "What were you thinking?" and answer from each step's thought. End completed runs with a real sentence, for example "I finished at step 14 and paid the bill." Merge findings that share a step and type so nothing repeats. Lower-case finding titles inside sentences. Done when: across all 9 runs and every question, no answer contains `''` or " : ." or a repeated phrase; add a unit test that checks this for every recorded run.

UI-05 Memos password. Add a short display goal per mission in dashboard/src/model/sites.ts ("Write and save a note in Memos") and use it in the Ghost Cam heading and page title (GhostCamScreen.tsx:205), Spec Coverage (CoverageScreen.tsx:80) and Exorcise (ExorciseScreen.tsx:105). Mask the password where a spoken or typed step shows it. Done when: no screen's rendered text or page title contains "HauntTest123!"; add a test. Add one sentence to the README saying the Memos account is a throwaway on a local copy.

UI-06 Real-world page (model/results.ts:23-28 and 61-69, model/sites.ts:27-30, RealWorldScreen.tsx:87). Both cards end "...got trapped in the note editor and couldn't save the note." Say "on our own computer". Show each run's date and a link to Memos on GitHub. Use or delete the unused unnamedTextbox entry.

UI-07 README. Line 122: use MEMOS_ISSUE_URL, or delete the line if it says none. Use "Completed" wherever the README says "Succeeded". In dashboard/README.md:73, #/seance opens step 26, not 20. Make lines 22 and 63 match what Phase 2 builds for the ghost's thoughts.

UI-11 Running a ghost. Add an npm script that serves a production build of Lantern Bills for ghost runs, and tell readers to use it in "Run a ghost" and beside every Reproduce command, with one sentence on why (the dev server is too slow for The Phantom's slow-3G walk). Done when: following the README word for word, The Phantom reports misclicks at steps 3 and 5.

UI-12 Kiro evidence. Check each task in .kiro/specs/exorcised-remaining-fixes/tasks.md and listener-ai-mind task 11.1 against the code, and tick only those that are really finished; tell the user about any that aren't. Update steering/structure.md to cover demo-site-exorcised, crew-app, the custom agent and the MCP server. Name the six planted problems in steering/demo-site.md. Make the Build check hook cover every project folder, or correct the README wording. Delete the unused .kiro/hooks/scripts/run-check.mjs. In the README add:

  - "Proof Kiro did the work": link the tasks.meta.json files and give their real execution counts; say that MCP is wired through the custom agent; mention the fast-task specs. If docs/media/hook-firing.png exists, show it; if not, leave the image out and tell the user.
  - "Where Kiro surprised us": these four, each checked against the repo and linked: the AI mind's first run raised a false unannounced_error at step 22, fixed in 22844b7 with regression tests; the first scripted Memos run exposed two engine weaknesses, which became Memos tasks 6.4 and 6.5 in 7f267b2; the exorcise-different-ghost-fix bugfix overrides dashboard criterion 13.8; Kiro Crew refused command crons on Windows, so haunt-patrol task 10 moved to a script cron.

UI-24 One word per idea, everywhere in the UI and README. Success is "Completed". The fixed site is "Lantern Bills (fixed copy)"; keep "after the fix" as the run label and "Exorcised" as a finding's status. Bebe is "she" or "Bebe", never "it" (AskPanel.tsx:41-43). Replace "Step 1 of 26 · / · Open http://localhost:3000" with plain words such as "Open the bill page", with no bare "/" and no localhost address. The footer must not call Memos one of "our own sites". Use "Scripted mind" consistently.

UI-25 Update engine/README.md (--mind ai, Kiro, haunt-mcp, KIRO_CLI_PATH, Memos). Rewrite demo-site-exorcised/README.md lines 19 and 22, which wrongly say the six problems are unchanged. Replace the local Windows username and absolute paths with %USERPROFILE% or <you> in crew-app/INSTALL-WINDOWS.md, the listener-ai-mind spec files and engine/test/kiro.test.ts.

UI-30 Make the engine's --out help text say what the default really is (engine/src/cli/main.ts:411).

## PHASE 2: THE GHOST CAM (do these together, then check the fit once)

UI-01 Show the thoughts. For Listener runs the Ghost Cam shows only what was heard (dashboard/src/model/transcript.ts:49, screens/ghostcam/Panels.tsx:76, GhostCamScreen.tsx:165). Add a short strip beside or under the spoken panel: "What The Listener was thinking", or "What the AI mind decided" on AI runs, using the thought-panel tokens in steering. Long thoughts must not push the layout. Done when: on step 12 of run 2026-11-23T1020Z-listener-pay-bill at 1536x864, the sentence beginning "This button has no name, but it's right after the form fields" is visible without scrolling.

UI-04 Fit (screens/ghostcam/GhostCam.module.css). The timeline wraps past 22 steps. Keep it on one row for any run length, with marks at least 24 px and the current step always in view. Remove the roughly 100 px gap above the controls and the empty band under the screenshot. Extend dashboard/e2e/ghostcam-layout.spec.ts to check every recorded run at 1920x1080, 1536x864 and 1440x900. If it's low risk, also keep the two-column layout at 1536x730; if not, leave that size alone and tell the user.

UI-10 The stuck notice (components/StuckNotice.module.css) uses a fixed height. Let it grow so all three lines stay visible with WCAG text spacing and at 400% zoom, and stop cutting the step line with an ellipsis. Add a test.

UI-15 The Play button reads "Pause" while playing (ghostcam/Controls.tsx:42-45). Add Left and Right arrow keys for steps and Space for play and pause, only when focus isn't in a field or on another control, and show the shortcuts in a small hint.

UI-09 Screenshots (components/Screenshot.tsx). When a run opens, preload its screenshots, nearest steps first, and keep the previous image on screen until the next has decoded. Done when: with Fast 3G throttling, stepping forward never shows a half-painted image after the first.

UI-14 and UI-20 The Phantom's phone screenshots. Fit portrait images by height inside a simple phone frame so the whole screen shows at every step, with no scrolling box. Where the step-1 image is blank, add the caption "The page is still loading on slow 3G". This must clear the axe scrollable-region violation on both Phantom runs.

## PHASE 3: DATA LOGIC

UI-03 Spec Coverage (dashboard/src/model/coverage.ts:24-48). Group rows by site: Lantern Bills, Lantern Bills (fixed copy), Memos. A fixed-copy run never counts as Lantern Bills' latest. Show a plain title per requirement ("Pay a bill with a valid card") with the EARS text behind "Full requirement", and link each row to its requirement file on GitHub. Done when: The Phantom shows "Gave up" for Lantern Bills, and fixed-copy results appear only under the fixed copy.

UI-13 Exorcise (screens/ExorciseScreen.tsx:39-72). Offer as "After" only later runs by the same ghost and the same mind on the fixed copy; never offer Memos runs or pair two Memos runs. Add --mind ai to the AI run's Reproduce command. Label the commit "Haunt commit". Announce the result when the comparison changes. Old different-ghost links keep working as the exorcise-different-ghost-fix spec says.

UI-17 Counts. Home and Graveyard count only each ghost's latest run per site. Add one line on Home telling the planted-problems story, computed from the run files through an explicit mapping from finding types to the six planted problems: how many were planted, how many the ghosts found, how many the fix exorcised, each linking to its evidence. Show the TRUE numbers. If the ghosts found fewer than six, show that number, don't adjust anything to reach six, and tell the user which problems no run reached.

## PHASE 4: FIRST LOAD, DEPLOY AND SAFE DELIGHT

UI-08 Home (screens/HomeScreen.tsx, components/layout/Layout.tsx:110). Render the hero, the ghosts and "How Haunt works" immediately; reserve the result cards' height with a quiet candlelit skeleton; always show five menu items. Done when: layout shift on a cold load is below 0.1 and the menu never shows four items.

UI-21 Add a candle favicon, a theme colour, and og:title, og:description and og:image (1200x630, committed, referenced by its full live address). Add a themed 404.html for the published site that matches "This room is empty" and links home.

UI-22 Add a "View on GitHub" link in the footer, a "Try the fixed copy" link beside each "after the fix" run, and a Memos link on the real-world page.

Enhancements, in this order, each only if it's safe:

  a. A ghost that guides the tour: each tour stop shows the matching ghost's small drawing and one line in its voice, with the plain explanation kept.
  b. Mischief in empty, error and unknown-address states, always with a plain next step. For example: "This room is empty... even the ghosts left." Keep it short, and never joke inside an error that needs action without also saying what to do.
  c. "Haunt your own site": a short README section and a Home card with a copyable block of commands that really run, plus engine/missions/README.md with a mission template. Test the commands yourself.

UI-31 Replace the plain loading text with a still candle-and-ghost loader, and reword "No runs found" so the public site doesn't tell visitors to run npm commands.

## PHASE 5: POLISH (only when phases 1 to 4 are green; skip anything risky and tell the user)

UI-16 Map: dim other ghosts' cold spots when a ghost is selected, fix the room count, and add a legend for circle size.

UI-18 Show dates in UTC with a "UTC" label, matching the run IDs and the README.

UI-19 In forced-colours mode, mark only the current page in the menu.

UI-20 Make the Exorcise table wrapper keyboard reachable at 320 px, or remove its scrolling.

UI-23 Tombstones lead with a plain sentence or short epitaph ("Here lies a button with no name"), with the engine evidence behind "Full details"; order by site with Lantern Bills first, then by step.

UI-26 Refreshing during the tour resumes it, or at least moves focus to the page heading.

UI-27 The "Full requirement" overlay closes on Escape from anywhere, on an outside click and when focus leaves.

UI-28 Remove the stale "planted problem" comments from the fixed copy's CSS files.

UI-29 Tidy: remove or fill the empty diary/ folder; explain or remove the "Ghost Builder" and "House Builder" roles; move typescript and vite to devDependencies; remove the byte-order mark from tech.md; make CI run every package's unit tests.

UI-32 Convert screenshots to WebP during the dashboard's build copy step only; never touch runs/.

Optional: fold Home's "Recent ghost walks" into the site panels, only if the tour's stops still land correctly. A before-and-after screenshot slider on Exorcise, only if every other item is done.

## FINAL CHECK

1. Every package: unit tests, property tests, type-check and build all pass. Run the dashboard and engine end-to-end suites, one worker.
2. The demo-site tests prove all six planted problems are still present; the fixed-copy tests prove none are.
3. The Ghost Cam fits for all recorded runs at the three sizes.
4. axe reports 0 violations on every dashboard state at 1536 px and 320 px.
5. No screen shows "HauntTest123!", `''` in an answer, "couldn't sign", "Succeeded", a bare localhost address or a local Windows path. The README has no TODO.
6. git status shows runs/ untouched. Rebuild demo-site-exorcised with its normal npm run build.
7. Update the README wherever a screen, label or command changed, so it matches the UI exactly.

## REPORT BACK

Give a table of every ID from UI-01 to UI-32 and each enhancement: done, partly done or skipped, with the reason, the files changed and the test that covers it. Then list which specs were amended, the true planted-problems count from UI-17, any task that couldn't honestly be ticked, whether the hook screenshot was found, and anything the user needs to decide.
