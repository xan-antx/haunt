# Implementation Plan

One commit per phase on the branch `pre-recording-fixes`. A task is ticked only when its code and its test are done.

- [x] 1. Phase 1: words and docs
  - [x] 1.1 UI-02: `questionLabel`, thoughts for The Phantom and Bebe, finished-run sentence, de-duplication, lower-case titles; `models.test.ts` checks every recorded run
  - [x] 1.2 UI-05: `secrets.ts` mask, `displayGoal`, display goal in Ghost Cam, Coverage, Exorcise and Home; test checks no loaded run holds the password; README sentence
  - [x] 1.3 UI-06: Memos headline ending, "our own computer", dates and Memos link, `unnamedTextbox` deleted; test on both headlines
  - [x] 1.4 UI-07: README TODO line removed, "Completed", `#/seance` step 26, thoughts wording
  - [x] 1.5 UI-11: `npm run serve:ghosts`, README "Run a ghost", Reproduce hint in the Provenance panel; The Phantom run on the production build reports misclicks at steps 3 and 5; test for the hint
  - [x] 1.6 UI-12: tasks ticked, `structure.md`, `demo-site.md`, Build check hook folders, `run-check.mjs` deleted, "Proof Kiro did the work", "Where Kiro surprised us"
  - [x] 1.7 UI-24: one word per idea, Bebe not "it", no bare "/" or localhost address in step text, footer wording; test for `plainAction` and `siteLabel`
  - [x] 1.8 UI-25: `engine/README.md`, `demo-site-exorcised/README.md`, local paths replaced
  - [x] 1.9 UI-30: `--out` help text
  - [x] 1.10 Amend haunt-dashboard 12.4, 12.6 and 25.8 and Memos design section 8
  - [x] 1.11 Phase check: dashboard unit tests and type-check, engine tests for the files touched, demo-site tests, fixed-copy build and tests

- [x] 2. Phase 2: the Ghost Cam
  - [x] 2.1 UI-01 thoughts strip
  - [x] 2.2 UI-04 one-row timeline, fit for every run at three sizes
  - [x] 2.3 UI-10 stuck notice grows
  - [x] 2.4 UI-15 Pause label and keyboard shortcuts
  - [x] 2.5 UI-09 screenshot preloading
  - [x] 2.6 UI-14 and UI-20 phone frame for The Phantom
  - [x] 2.7 Amend haunt-dashboard 10 (10.4, 10.7, 10.10, 10.24, 10.31, new 10.37) and its design; Ghost Cam fit check (haunt-dashboard 7 is amended in Phases 3 and 4)

- [x] 3. Phase 3: data logic
  - [x] 3.1 UI-03 coverage by site, plain requirement titles, GitHub links
  - [x] 3.2 UI-13 Exorcise pairing, `--mind ai`, "Haunt commit", announcement
  - [x] 3.3 UI-17 latest-run counts and the planted-problems line with true numbers (6 planted, 5 found, 5 exorcised; card errors never reached)
  - [x] 3.4 Amend haunt-dashboard 25.5 (and 7, 9, 13, 14)

- [ ] 4. Phase 4: first load, deploy and safe delight (4.5 is open)
  - [x] 4.1 UI-08 Home skeleton and five menu items
  - [x] 4.2 UI-21 favicon, theme colour, og tags, `404.html`
  - [x] 4.3 UI-22 GitHub, fixed-copy and Memos links
  - [x] 4.4 UI-31 loader and public-site wording
  - [ ] 4.5 Enhancements a, b and c, each only if safe (b is partly there: the empty Home and the 404 page say "This room is empty" with a next step)
    - [x] 4.5b Playful copy for the unknown address, the unknown run and a valid file on the restless screen, each with a plain next step; errors that need action stay plain (tests in `phase4.test.tsx`)
    - [x] 4.5a A ghost guides the tour: each of the 8 stops shows a ghost's small drawing and one line in its voice (`guide` and `voice` on `TourStop`), plain explanation kept; `tour.test.ts`, and `tour-scroll.spec.ts` at 390 and 320 px
    - [x] 4.5c "Haunt your own site": README section, Home card with a copyable block, `engine/missions/README.md` with a template; every command was run against local Lantern Bills with `--out` outside the repo; tests `ownSite.test.tsx` and `ownSiteDocs.test.ts`
  - [x] 4.6 Amend haunt-dashboard 20.1

- [x] 4b. Corrections after review (committed before the must-haves)
  - [x] 4b.1 The fixed copy shows as "Lantern Bills (fixed copy)" on Home cards, the Graveyard map and its site filter, through `displayName`; run files unchanged
  - [x] 4b.2 Blank screenshots: the opening Phantom step keeps its slow 3G caption; every other blank screen (steps 3 to 13 of the 22 Nov Phantom run) says "The screen was blank at this step." and names no cause
  - [x] 4b.3 Memos design section 8 amended for the display goal and the masked password
  - [x] 4b.4 `docs/media/hook-firing.png` does not exist, so the README says nothing about it
  - [x] 4b.5 The Ghost Cam menu item, when unavailable, carries a visually hidden reason, and is not rendered on the published site once runs have loaded with none
  - [x] 4b.6 UI-17 wording: the Home line adds why problem 3 was never reached; the README says 5 of 6
  - [x] 4b.7 UI-13 amended: later runs on the same site may be offered as "After"; the fixed-copy run stays the default

- [ ] 5. Phase 5: polish
  - [ ] 5.1 UI-16, UI-18, UI-19, UI-20 (UI-20 done early as a must-have: the Exorcise table wraps its text and has no scroll box; checked by axe at 320 px)
  - [ ] 5.2 UI-23, UI-26, UI-27
  - [ ] 5.3 UI-28, UI-29, UI-32
  - [ ] 5.4 Optional items

- [x] 6. Final check (first pass, before the extras)
  - [x] 6.1 Every package: unit, property, type-check, build; dashboard and engine end-to-end suites, one worker (dashboard e2e: 152 of 153 on the first run, the one timeout passed alone; engine e2e 23 of 23)
  - [x] 6.2 Planted problems present in `demo-site/`, absent in `demo-site-exorcised/`
  - [x] 6.3 Ghost Cam fit for every recorded run at three sizes (33 rows, all pass)
  - [x] 6.4 axe 0 violations on every dashboard state at 1536 px and 320 px (`ghostcam-recorded-axe.spec.ts`, 64 states each)
  - [x] 6.5 No password, `''`, "couldn't sign", "Succeeded", bare localhost address or local Windows path on any screen; no TODO in the README
  - [x] 6.6 `git status` shows `runs/` untouched; `demo-site-exorcised` rebuilt with `npm run build`
  - [x] 6.7 README matches every changed screen, label and command
  - [ ] 6.8 Re-run the dashboard unit tests, the Ghost Cam fit check and axe after the extras
