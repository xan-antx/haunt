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

- [ ] 2. Phase 2: the Ghost Cam
  - [ ] 2.1 UI-01 thoughts strip
  - [ ] 2.2 UI-04 one-row timeline, fit for every run at three sizes
  - [ ] 2.3 UI-10 stuck notice grows
  - [ ] 2.4 UI-15 Pause label and keyboard shortcuts
  - [ ] 2.5 UI-09 screenshot preloading
  - [ ] 2.6 UI-14 and UI-20 phone frame for The Phantom
  - [ ] 2.7 Amend haunt-dashboard 7, 10, 10.7 and 10.24; Ghost Cam fit check

- [ ] 3. Phase 3: data logic
  - [ ] 3.1 UI-03 coverage by site, plain requirement titles, GitHub links
  - [ ] 3.2 UI-13 Exorcise pairing, `--mind ai`, "Haunt commit", announcement
  - [ ] 3.3 UI-17 latest-run counts and the planted-problems line with true numbers
  - [ ] 3.4 Amend haunt-dashboard 25.5

- [ ] 4. Phase 4: first load, deploy and safe delight
  - [ ] 4.1 UI-08 Home skeleton and five menu items
  - [ ] 4.2 UI-21 favicon, theme colour, og tags, `404.html`
  - [ ] 4.3 UI-22 GitHub, fixed-copy and Memos links
  - [ ] 4.4 UI-31 loader and public-site wording
  - [ ] 4.5 Enhancements a, b and c, each only if safe
  - [ ] 4.6 Amend haunt-dashboard 20.1

- [ ] 5. Phase 5: polish
  - [ ] 5.1 UI-16, UI-18, UI-19, UI-20
  - [ ] 5.2 UI-23, UI-26, UI-27
  - [ ] 5.3 UI-28, UI-29, UI-32
  - [ ] 5.4 Optional items

- [ ] 6. Final check, run only when asked
  - [ ] 6.1 Every package: unit, property, type-check, build; dashboard and engine end-to-end suites, one worker
  - [ ] 6.2 Planted problems present in `demo-site/`, absent in `demo-site-exorcised/`
  - [ ] 6.3 Ghost Cam fit for every recorded run at three sizes
  - [ ] 6.4 axe 0 violations on every dashboard state at 1536 px and 320 px
  - [ ] 6.5 No password, `''`, "couldn't sign", "Succeeded", bare localhost address or local Windows path on any screen; no TODO in the README
  - [ ] 6.6 `git status` shows `runs/` untouched; `demo-site-exorcised` rebuilt with `npm run build`
  - [ ] 6.7 README matches every changed screen, label and command
