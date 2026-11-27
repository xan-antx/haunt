# Design: pre-recording polish

## Phase 1

**Passwords (UI-05).** `dashboard/src/model/secrets.ts` reads the password a mission goal spells out ("password HauntTest123!") and replaces it with dots in the mission, steps and findings of every loaded run. `validateRun` calls it, so every screen, page title and test sees the masked run. The run file on disk is unchanged. `model/sites.ts` has a mission table (`MISSION_WORDS`, keyed by `mission.id`) with a short display goal, a verb phrase and a "done" phrase, and `displayGoal(mission)` returns the short goal when there is one.

**Headlines (UI-06).** `resultHeadline` uses the mission's verb phrase first ("save the note"), then the first word of the goal. The real-world card shows the run's date and a link from the site table's `sourceLink`.

**Ask this ghost (UI-02).** `seance.ts` exports `questionLabel(ghost, question)`. `what-heard` keeps its id, so links keep working. Findings are de-duplicated by step and type (`distinctFindings`), titles are lower-cased inside a sentence (`inSentence`), and the completed answer ends "I finished at step N and <done phrase>." A unit test loads every file under `runs/` through `import.meta.glob` and checks all four answers for `''`, ` : .` and repeated phrases.

**Plain step text (UI-24).** `siteLabel(siteName)` gives "Lantern Bills" and "Lantern Bills (fixed copy)". `plainAction(siteName, action)` swaps a local address for the page name, and the Ghost Cam's step line uses `pageName`. The result sentence and Outcome line say "Completed".

**Running a ghost (UI-11).** `demo-site/package.json` gets `serve:ghosts`: `vite build --base / --outDir .ghost-build --emptyOutDir && vite preview --base / --outDir .ghost-build`. It is the same production build that live mode serves, and it adds no file to `demo-site/src/`. The folder `.ghost-build/` is ignored by git. The Provenance panel shows the hint beside the Reproduce command for runs on the haunted Lantern Bills.

**Kiro evidence (UI-12).** Checked against the code, then ticked: all 19 tasks of `exorcised-remaining-fixes` (code present, build passes, 158 tests pass, `d899259` did not touch `demo-site/`) and `listener-ai-mind` task 11.1 (the AI run is saved in commit `9a7a48b`). The Build check hook lists all five project folders.

## Later phases

Phases 2 to 5 add their design notes to this file when their chat begins, before any code.
