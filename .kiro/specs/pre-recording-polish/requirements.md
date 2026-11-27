# Requirements: pre-recording polish

An independent review of commit `38b72f4` found 32 problems (UI-01 to UI-32) before the hackathon demo video. This spec turns each finding into a testable requirement. The full instructions are in [brief.md](brief.md). Where the brief and the review report differ, the brief wins. Work is split into five phases, one commit each, on the branch `pre-recording-fixes`.

## Rules that never break

- R0.1 `demo-site/` keeps all six planted problems. `demo-site-exorcised/` keeps none. No hook is switched off.
- R0.2 Nothing in `runs/` is edited, added or deleted. The dashboard changes how it shows a run, never the run file.
- R0.3 The Ghost Cam fits on one screen with no scrolling at 1920x1080, 1536x864 and 1440x900 for every recorded run.
- R0.4 No call to an outside service. The Content Security Policy stays as strict as it is. New images and fonts are committed.
- R0.5 Kept as they are: hash URLs, the five-item menu, the candlelit theme, serif for headings only, the 60-second tour with 8 stops, the "AI mind", "Sample run" and "after the fix" labels, and live mode's honest message online.
- R0.6 axe reports 0 violations on every dashboard state at 1536 px and 320 px. Everything works by keyboard, focus is visible, changes are announced, reduced motion is respected, click targets are at least 24 px, and contrast follows `steering/dashboard-design.md`.
- R0.7 Every number on screen comes from the run files. Nothing untrue is shown.
- R0.8 No TODO, placeholder or local Windows path in anything written.

## Phase 1: words and docs

- **UI-02** "Ask this ghost" answers read as plain sentences. For The Phantom and Bebe the question "What did you hear?" reads "What were you thinking?" and is answered from each step's thought. A completed run ends with a real sentence ("I finished at step 14 and paid the bill."). Findings that share a step and type are told once. Finding titles inside a sentence start with a lower-case letter. For every recorded run and every question, no answer contains `''`, ` : .` or a repeated phrase. Amends haunt-dashboard 12.4 and 12.6.
- **UI-05** No screen's text or page title contains the Memos throwaway password. Each mission has a short display goal ("Write and save a note in Memos") used in the Ghost Cam heading, Spec Coverage, Exorcise and Home. The password is masked wherever a spoken or typed step shows it. The README says the Memos account is a throwaway on a local copy. Amends Memos design section 8.
- **UI-06** The real-world page says both Memos cards "couldn't save the note", says "on our own computer", shows each run's date and links to Memos on GitHub. The unused `unnamedTextbox` entry is deleted.
- **UI-07** The README has no TODO line, says "Completed" and not "Succeeded", and `dashboard/README.md` says `#/seance` opens step 26. README lines about the ghost's thoughts match what Phase 2 builds.
- **UI-11** An npm script, `npm run serve:ghosts` in `demo-site/`, serves a production build of Lantern Bills on port 3000. The README's "Run a ghost" section and the dashboard's Reproduce command both say to use it, with one sentence on why. Following the README, The Phantom reports misclicks at steps 3 and 5.
- **UI-12** Finished tasks are ticked and unfinished ones are reported. `steering/structure.md` covers `demo-site-exorcised`, `crew-app`, the custom agent and the MCP server. `steering/demo-site.md` names the six planted problems. The Build check hook covers every project folder. The unused `run-check.mjs` is deleted. The README has "Proof Kiro did the work" and "Where Kiro surprised us". A hook screenshot is shown only if `docs/media/hook-firing.png` exists.
- **UI-24** One word per idea. Success is "Completed". The fixed site is "Lantern Bills (fixed copy)". "after the fix" stays as the run label and "Exorcised" as a finding status. Bebe is "she" or "Bebe", never "it". Step information has no bare "/" and no localhost address. The footer does not call Memos one of our own sites. "Scripted mind" is used consistently.
- **UI-25** `engine/README.md` covers `--mind ai`, Kiro, haunt-mcp, `KIRO_CLI_PATH` and Memos. `demo-site-exorcised/README.md` no longer says the six problems are unchanged. The local Windows username and absolute paths are gone from the repository.
- **UI-30** The engine's `--out` help says what the default really is.

## Phase 2: the Ghost Cam

- **UI-01** A strip shows the ghost's thoughts, under the screenshot, on Listener runs ("What The Listener was thinking", or "What the AI mind decided" on AI runs). On step 12 of `2026-11-23T1020Z-listener-pay-bill` at 1536x864 the sentence beginning "This button has no name, but it's right after the form fields" is visible without scrolling. Amends haunt-dashboard 7 and 10.
- **UI-04** The timeline stays on one row for any run length, marks are at least 24 px, and the current step is always in view. The gap above the controls and the empty band under the screenshot are gone. The fit test covers every recorded run at the three sizes. Amends 10.24.
- **UI-10** The stuck notice grows with text spacing and 400% zoom, keeps all three lines, and the step line is not cut with an ellipsis.
- **UI-15** The play button reads "Pause" while playing. Left and Right arrows step, Space plays and pauses, only when focus is not in a field or on another control. A small hint shows the shortcuts. Amends 10.7.
- **UI-09** Screenshots are preloaded nearest-step first, and the previous image stays until the next has decoded.
- **UI-14, UI-20** The Phantom's portrait screenshots fit by height inside a phone frame with no scrolling box. A blank first image has the caption "The page is still loading on slow 3G". axe finds no scrollable-region violation on either Phantom run.

## Phase 3: data logic

- **UI-03** Spec Coverage groups rows by site (Lantern Bills, Lantern Bills (fixed copy), Memos). A fixed-copy run is never Lantern Bills' latest. Each requirement has a plain title and the EARS text behind "Full requirement", with a link to its requirement file. Amends 25.5.
- **UI-13** Exorcise offers as "After" only later runs by the same ghost and the same mind on the fixed copy. No Memos pair. The AI run's Reproduce command has `--mind ai`. The commit is labelled "Haunt commit". The result is announced when the comparison changes. Old different-ghost links keep working.
- **UI-17** Home and the Graveyard count only each ghost's latest run per site. One line on Home gives the planted-problems story from an explicit mapping of finding types to the six planted problems, with the true numbers and links to the evidence.

## Phase 4: first load, deploy and safe delight

- **UI-08** Home renders the hero, ghosts and "How Haunt works" at once, reserves the result cards' height with a skeleton, and always shows five menu items. Cold-load layout shift is below 0.1. Amends 20.1.
- **UI-21** Candle favicon, theme colour, `og:` tags with a committed 1200x630 image, and a themed `404.html`.
- **UI-22** Footer "View on GitHub", "Try the fixed copy" beside each "after the fix" run, and a Memos link on the real-world page.
- **UI-31** A still candle-and-ghost loader, and "No runs found" no longer tells visitors to run npm commands.
- **Enhancement a** A ghost guides each tour stop. **b** Mischief in empty, error and unknown-address states, always with a plain next step. **c** "Haunt your own site" README section, a Home card with commands that run, and `engine/missions/README.md`.

## Phase 5: polish

UI-16 map filter and legend. UI-18 UTC dates. UI-19 forced-colours current page. UI-20 keyboard-reachable Exorcise table. UI-23 tombstone epitaphs. UI-26 tour resumes on refresh. UI-27 "Full requirement" overlay closes properly. UI-28 stale comments removed. UI-29 repo tidy. UI-32 WebP in the build copy step only. Optional: Home's "Recent ghost walks" folded into the site panels, and a before-and-after slider.
