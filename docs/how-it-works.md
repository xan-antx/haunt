# How Haunt works

This page holds the detail that the [README](../README.md) leaves out. Finding names are the ones the dashboard shows, with the code name in brackets the first time.

## The engine and the detectors

The engine (`engine/`) drives a ghost through one mission in a real Chromium browser with Playwright. It writes a `run.json` folder (steps, screenshots, findings) in the format defined in [`contract/run-format.md`](../contract/run-format.md), and checks it against the schema before saving. Deterministic detectors decide every finding.

A finding has one of nine types:

| Dashboard name | Code name | Found by |
|---|---|---|
| Button with no name | `unlabeled_button` | The Listener |
| Field with no name | `unlabeled_field` | The Listener |
| Keyboard trap | `focus_trap` | The Listener |
| Error nobody announced | `unannounced_error` | The Listener |
| Too long a wait | `slow_wait` | The Phantom |
| Clicked the wrong thing | `misclick` | The Phantom |
| Text cut off | `cut_off_text` | Bebe |
| Text not translated | `untranslated` | Bebe |
| Tricky choice | `dark_pattern` | Bebe |

Two of them cover keyboard and naming problems on any page:

- A Keyboard trap (`focus_trap`) is focus that cannot leave a dialog, and also focus that cannot leave a single element outside a dialog (an element trap). An element trap is a text box where Tab and Shift+Tab leave focus in place. The finding is recorded even when pressing Escape twice later frees focus, and its evidence says whether that exit is documented anywhere on the page.
- A Field with no name (`unlabeled_field`) is a form field or textbox whose accessible name, as Chromium computes it, is empty. A `placeholder` or `aria-placeholder` does not count as a name unless Chromium uses it as one.

There are two missions. `pay-bill` runs on Lantern Bills and is tied to a requirement in the `lantern-bills` spec. `write-note` runs on Memos and is tied to `MEMOS-1` in the `memos-real-world-haunt` spec. How to write your own is in [engine/missions/README.md](../engine/missions/README.md).

## Lantern Bills and its fixed copy

`demo-site/` is a fictional electricity bill-payment site in English, Punjabi and Hindi. It has six deliberate problems, and tests guard them:

1. An icon-only pay button with no accessible name.
2. A "Protect your payment" dialog that traps keyboard focus, ignores Escape and has a paid add-on ticked by default.
3. Card errors that are visible but never announced.
4. A banner that loads late and pushes the page down.
5. A payment total that is cut off at narrow widths and large zoom.
6. Missing Punjabi and Hindi text for the pay button and the card errors.

`demo-site-exorcised/` is a copy where the six problems are fixed. Every fix went through a Kiro bugfix spec, and the tests that asserted the planted behavior were updated to assert the fixed behavior, not deleted.

- `exorcised-payment-a11y-fix` fixes the pay button's name and the dialog's keyboard trap (Tab order, Escape, focus return).
- `exorcised-remaining-fixes` fixes the silent card errors, the late banner, the cut-off total, the pre-ticked add-on and the missing Punjabi and Hindi text.
- `exorcise-different-ghost-fix` fixes the dashboard: Exorcise now compares only runs by the same ghost, because a ghost can only confirm the fix of a problem it can detect.

All three ghosts ran again on the fixed copy, recorded with `--site-name "Lantern Bills demo (exorcised)"`. Each one completed the task with no findings. The dashboard calls the site "Lantern Bills (fixed copy)", marks those runs "after the fix" and pairs each with the same ghost's run on the haunted site.

## The dashboard in detail

`dashboard/` is a static React and Vite site. It only reads run files.

| Screen | What it shows |
|---|---|
| **Home** | The latest result for each ghost, with a "Watch it happen" button on each card |
| **Home, further down** | A line that counts the six planted problems, a "Haunt your own site" card with commands to copy, and the 60-second tour |
| **Home, run files** | Files that cannot be read are listed as "Restless files" with the reasons |
| **Ghost Cam** | A step-by-step replay of one run, described below |
| **Graveyard** | One tombstone per problem found, and a **Map** view |
| **Exorcise** | Compares a before run with a later run by the same ghost and the same mind on the same mission |
| **Spec Coverage** | Each mission is one requirement, shown by site |
| **A real-world haunt** | The newest Memos run for each mind, linked from the bottom of Home |

**Ghost Cam.**

- It shows the screenshot, where the ghost's focus was, what The Listener heard, and what the ghost was thinking. For The Listener the thought is a strip under the screenshot; for an AI run the strip is headed "What the AI mind decided".
- The Play button reads "Pause" while playing. When no button or field has focus, the Left and Right arrow keys step and Space plays or pauses.
- A Phantom screenshot is shown whole in a phone frame. A blank screenshot says "The picture for this step came out blank." and gives no cause, except the first Phantom step, which says the page is still loading on slow 3G.
- **Ask this ghost** answers four questions about the run from the run file. The Listener is asked what it heard. The Phantom and Bebe are asked what they were thinking. The Listener's spoken lines can be read aloud with the browser's built-in voice.

**Graveyard.** Each tombstone is led by a plain line such as "Here lies a button with no name." with the engine's evidence behind "Full details". Tombstones are ordered by site (Lantern Bills first) and then by step, and can be filtered by site and ghost. The Map view shows one room per page and a cold spot where a ghost got stuck.

**Exorcise.** It marks each finding as Exorcised, Still haunting, New haunting or Not reached. The "after" run may be on the same site or on its fixed copy. The Reproduce command of a fixed-copy run carries the `--site-name` the run recorded, so a repeated run is paired the same way.

**Spec Coverage.** Rows are grouped by site (Lantern Bills, its fixed copy, Memos). Each has a plain title, the full requirement behind a button, and a link to its file. A cell shows whether each ghost's latest run on that site completed it.

**Real-world haunt.** Memos runs stay off Home, the tour and the Ghost Cam link on Home.

Other details:

- Dates are shown in UTC and say so, which matches the run ids.
- The "Full requirement" and "Full details" panels close on Escape, on a click outside them and when focus moves away.
- A run made by the AI mind carries an **AI mind** label on Home, in the Ghost Cam and in Exorcise. Samples are labelled **Sample run**, and a ghost's samples are hidden once the ghost has a real run.

More in [dashboard/README.md](../dashboard/README.md).

## The AI mind for The Listener

By default The Listener follows a scripted walk. With `--mind ai`, a Kiro custom agent chooses each keyboard action instead.

- The agent is [`.kiro/agents/listener.json`](../.kiro/agents/listener.json). The engine starts it with `kiro-cli chat --agent listener --no-interactive`.
- The agent's only tools come from **haunt-mcp**, an MCP server in [`engine/src/mcp/server.ts`](../engine/src/mcp/server.ts). It has seven tools: `read_page`, `read_announcements`, `press_key`, `type_text`, `jump`, `think` and `finish`. Each call goes over loopback, with a token, to a bridge inside the engine that holds the browser.
- The agent only chooses actions and writes the one-sentence thought for each step. It cannot create findings. The same detectors as the scripted walk decide them, and the run passes the same schema check.
- Only The Listener has an AI mind. The Phantom and Bebe are scripted.

The saved AI run ([2026-11-23T1020Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-23T1020Z-listener-pay-bill/step/1), 26 steps) gave up at the dialog trap with the same two findings as the scripted run: a Button with no name and a Keyboard trap.

### The false positive our AI ghost exposed

In its first run, at step 22, The Listener opened the "Learn more" disclosure in the payment protection dialog. The Error nobody announced detector (`unannounced_error`) reported the explanation ("If your payment fails due to a system error, you'll receive a full refund...") as an error, because the text contains words such as "fails" and "error". It was a false positive. We fixed the detector in two ways:

- Text revealed by a disclosure the user opened (an `aria-expanded="true"` target or an open `<details>`) is never error text.
- A sentence that opens with a condition ("if", "when", "unless") is a description, not an error about the user's input.

The regression tests use the exact text from that run ([`engine/test/unannouncedError.test.ts`](../engine/test/unannouncedError.test.ts) and [`engine/test/errorWords.test.ts`](../engine/test/errorWords.test.ts)), and one of them checks that a real silent error next to an open disclosure is still reported. The fix is in commit [`22844b7`](https://github.com/xan-antx/haunt/commit/22844b7). Other false positives and misses may remain.

## Live mode

When you run the dashboard yourself with `npm run dev` in `dashboard/`, the **Summon a live ghost** button on Home starts Lantern Bills, runs The Listener (Scripted mind) through the engine, adds the new run to the dashboard and stops the site. It accepts requests only from your own computer. On the published site the button explains this and shows the commands to run.

## Haunt Patrol (Kiro Crew app)

Haunt Patrol is a [Kiro Crew](https://kiro.dev/docs/crew/installation/) app. Every night at midnight IST a script cron builds Lantern Bills, sends the three ghosts (scripted minds, no model call) through the pay-bill mission, and stops the site. It writes a record and a plain-text summary that compares the night with the one before. The Crew page shows the summary and each ghost's result and findings, and has one link to the live dashboard. A second agent, `patrol-guide`, explains the results in plain language and can only read.

The app is in [`crew-app/`](../crew-app) here and in its own repository, https://github.com/xan-antx/haunt-crew. Patrol runs stay in the app's own data folder, so the dashboard does not list them. See [crew-app/README.md](../crew-app/README.md) and, for Windows, [crew-app/INSTALL-WINDOWS.md](../crew-app/INSTALL-WINDOWS.md).

Kiro Crew refused command crons on Windows, so [`haunt-patrol` task 10](../.kiro/specs/haunt-patrol/tasks.md) moved the nightly patrol to a script cron, `cron/nightly_patrol.py`.

## Real-world haunt: Memos

[Memos](https://github.com/usememos/memos) is a popular open-source notes app under the MIT license. Haunt did not build it. We run it only on our own computer, at `http://localhost:5230`, with a throwaway account made for Haunt, and we never visit anyone else's Memos server. The Memos account is a throwaway on a local copy: it holds nothing real, and the dashboard shows its password as dots.

The mission is `write-note`. The Listener signs in, types a note and saves it. The mission is tied to `MEMOS-1` in [`memos-behavior.md`](../.kiro/specs/memos-real-world-haunt/memos-behavior.md): a signed-in user types a note, activates Save, and the new memo appears at the top of the list.

Both The Listener's scripted mind and its AI mind got stuck in the note editor on their own. In the editor, Tab and Shift+Tab cannot move focus out. Pressing Escape twice does get out, and nothing on the page or in the announcements says so. Both runs gave up and recorded a Keyboard trap (`focus_trap`) for the editor.

| Run | Mind | Result | Steps | Findings |
|---|---|---|---|---|
| [2026-11-24T2141Z-listener-write-note](https://xan-antx.github.io/haunt/#/run/2026-11-24T2141Z-listener-write-note/step/29) | Scripted mind | Gave up | 29 | Keyboard trap in the note editor (step 29) |
| [2026-11-26T2026Z-listener-write-note](https://xan-antx.github.io/haunt/#/run/2026-11-26T2026Z-listener-write-note/step/19) | **AI mind** | Gave up | 28 | Keyboard trap in the note editor (step 19) |

What the runs show, and what they do not:

- The scripted run pressed Tab 50 times, then Shift+Tab, then Escape twice. The second Escape freed focus, so its evidence says the exit is undocumented. The AI run pressed Tab 153 times and Shift+Tab 101 times. It pressed Escape once, and the exit needs two presses.
- Neither run recorded a Field with no name (`unlabeled_field`) on Memos. The editor was announced as "Any thoughts..., edit text", so Chromium gave it a name. The detector exists and is tested, and it has not found anything on Memos so far.
- Neither run saved a note, so neither completed the mission.
- The first scripted run showed two weaknesses in our own engine. A Keyboard trap was missed because the editor had a name, and the Error nobody announced detector flagged text that only a screen reader can reach. We fixed the engine in both places and ran again. The Lantern Bills findings did not change.

To repeat the run, start your own Memos at `http://localhost:5230`, create the account named in [`engine/missions/write-note.json`](../engine/missions/write-note.json), and from `engine/` run:

```powershell
npm run haunt -- run --ghost listener --mission write-note --url http://localhost:5230
```

Add `--mind ai` for the AI mind. Haunt never starts Memos itself.

## Shared contract

[contract/run-format.md](../contract/run-format.md) defines the run file that the engine writes and the dashboard reads. [contract/example-run.json](../contract/example-run.json) is an example, and [contract/run.schema.json](../contract/run.schema.json) is the schema. Both sides check every run against it.
