# Haunt

**Haunt your app before your users do.**

Haunt sends three synthetic "ghost" users into a website to finish a task, then shows on a candlelit dashboard where each ghost got stuck. Built for the Kiroween 2026 hackathon, Costume Contest category.

## Live links

| What | Link |
|---|---|
| Dashboard | https://xan-antx.github.io/haunt/ |
| Lantern Bills (the haunted demo site) | https://xan-antx.github.io/haunt/lantern-bills/ |
| Lantern Bills, fixed copy (the "exorcised" site) | https://xan-antx.github.io/haunt/lantern-bills-exorcised/ |
| Real-world haunt (Memos results page in the dashboard) | https://xan-antx.github.io/haunt/#/real-world |
| Haunt Patrol (Kiro Crew app), own repository | https://github.com/xan-antx/haunt-crew |

You need no account and no install to use the first three links and the real-world page.

## Judge Quick Start

1. Open the [dashboard](https://xan-antx.github.io/haunt/) and press **Take the 60-second tour** on Home. It stops at the results, the Ghost Cam, the Graveyard, Exorcise and Spec Coverage. Escape leaves it.
2. Open the Ghost Cam on [The Listener's AI-mind run](https://xan-antx.github.io/haunt/#/run/2026-11-23T1020Z-listener-pay-bill/step/1) and step to the end. The run has an **AI mind** label, and the agent wrote a thought on each step. Under the screenshot, a strip headed "What the AI mind decided" shows that thought.
3. Open **Exorcise**. It compares a run on the haunted site with a run by the same ghost on the fixed copy.
4. Now try [Lantern Bills](https://xan-antx.github.io/haunt/lantern-bills/) yourself. Pay the bill with only the keyboard: use card number `4111111111111111`, a future expiry date, CVV `123` and any name. Press Escape in the "Protect your payment" dialog and try to Tab to Continue. Add `?lang=pa` or `?lang=hi` to the address to see the untranslated button and error messages, and narrow the window to 640 px or less to see the cut-off total.
5. Open the [fixed copy](https://xan-antx.github.io/haunt/lantern-bills-exorcised/) and do the same things. The problems are gone.
6. Open the [real-world haunt](https://xan-antx.github.io/haunt/#/real-world). It shows The Listener's two runs on Memos, a site we did not build. Press **Watch it happen** on a card to see where the ghost got stuck in the note editor.

## What each part is

### The three ghosts

- **The Listener** moves through a page with only the keyboard and listens to what a screen reader would announce.
- **The Phantom** browses on slow 3G and an old phone.
- **Bebe** reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording.

Each ghost stands for real people with real needs. A ghost that gets stuck points to a real barrier, so we never weaken a test to make a ghost pass.

The engine (`engine/`) drives a ghost through one mission in a real Chromium browser with Playwright. It writes a `run.json` folder (steps, screenshots, findings) in the format defined in [`contract/run-format.md`](contract/run-format.md), and checks it against the schema before saving. Deterministic detectors decide every finding. A finding has one of nine types: `unlabeled_button`, `unlabeled_field`, `focus_trap`, `unannounced_error`, `slow_wait`, `misclick`, `cut_off_text`, `untranslated` and `dark_pattern`. Two of them cover keyboard and naming problems on any page:

- `focus_trap` finds focus that cannot leave a dialog, and also focus that cannot leave a single element outside a dialog (an element trap). An element trap is a text box where Tab and Shift+Tab leave focus in place. The finding is recorded even when pressing Escape twice later frees focus, and its evidence says whether that exit is documented anywhere on the page.
- `unlabeled_field` finds a form field or textbox whose accessible name, as Chromium computes it, is empty. A `placeholder` or `aria-placeholder` does not count as a name unless Chromium uses it as one.

There are two missions. `pay-bill` runs on Lantern Bills and is tied to a requirement in the `lantern-bills` spec. `write-note` runs on Memos (see below) and is tied to `MEMOS-1` in the `memos-real-world-haunt` spec.

### Lantern Bills

`demo-site/` is a fictional electricity bill-payment site in English, Punjabi and Hindi. It has six deliberate problems for the ghosts to find. They stay in on purpose, and tests guard them.

1. An icon-only pay button with no accessible name.
2. A "Protect your payment" dialog that traps keyboard focus, ignores Escape and has a paid add-on ticked by default.
3. Card errors that are visible but never announced.
4. A banner that loads late and pushes the page down.
5. A payment total that is cut off at narrow widths and large zoom.
6. Missing Punjabi and Hindi text for the pay button and the card errors.

### The dashboard

`dashboard/` is a static React and Vite site. It only reads run files.

| Screen | What it shows |
|---|---|
| **Home** | The latest result for each ghost, with a "Watch it happen" button on each card, a line that counts the six problems planted in Lantern Bills (how many the ghosts found and how many the fix exorcised), and the 60-second tour. Run files that cannot be read are listed as "Restless files" with the reasons. |
| **Ghost Cam** | A step-by-step replay of one run: the screenshot, where the ghost's focus was, what The Listener heard, and what the ghost was thinking (for The Listener, a strip under the screenshot; for an AI run, "What the AI mind decided"). The Play button reads "Pause" while playing. When no button or field has focus, the Left and Right arrow keys step and Space plays or pauses. A Phantom screenshot is shown whole in a phone frame. An ask panel answers four questions about the run from the run file; The Listener is asked what it heard, and The Phantom and Bebe are asked what they were thinking. The Listener's spoken lines can be read aloud. |
| **Graveyard** | One tombstone per problem found, filterable by site and ghost, with a map view that shows one room per page and a cold spot where a ghost got stuck. |
| **Exorcise** | Compares a before run with a later run by the same ghost and the same mind (scripted or AI) on the same mission, on the same site or its fixed copy, and marks each finding as exorcised, still haunting, new, or not reached. |
| **Spec Coverage** | Each mission is one requirement, shown by site (Lantern Bills, its fixed copy, Memos) with a plain title, the full requirement behind a button and a link to its file. Shows whether each ghost's latest run on that site completed it. |
| **Real-world haunt** | Opens from a link at the bottom of Home. Shows the newest Memos run for each mind (Scripted mind and AI mind), with its result, step count and findings, and a "Watch it happen" button. Memos runs stay off Home, the tour and the Ghost Cam link on Home. |

A run made by the AI mind carries an **AI mind** label on Home, in the Ghost Cam and in Exorcise. Samples are labelled **Sample run**, and a ghost's samples are hidden once the ghost has a real run.

### The Exorcise loop

`demo-site-exorcised/` is a copy of Lantern Bills where the six problems are fixed. Every fix went through a Kiro bugfix spec, and the tests that asserted the planted behavior were updated to assert the fixed behavior, not deleted.

- `exorcised-payment-a11y-fix` fixes the pay button's name and the dialog's keyboard trap (Tab order, Escape, focus return).
- `exorcised-remaining-fixes` fixes the silent card errors, the late banner, the cut-off total, the pre-ticked add-on and the missing Punjabi and Hindi text.
- `exorcise-different-ghost-fix` fixes the dashboard: Exorcise now compares only runs by the same ghost, because a ghost can only confirm the fix of a problem it can detect.

All three ghosts ran again on the fixed copy (recorded with `--site-name "Lantern Bills demo (exorcised)"`). Each one completed the task with no findings. The dashboard calls the site "Lantern Bills (fixed copy)", marks those runs "after the fix" and pairs each with the same ghost's run on the haunted site.

### The AI mind for The Listener

By default The Listener follows a scripted walk. With `--mind ai`, a Kiro custom agent chooses each keyboard action instead.

- The agent is [`.kiro/agents/listener.json`](.kiro/agents/listener.json). The engine starts it with `kiro-cli chat --agent listener --no-interactive`.
- The agent's only tools come from **haunt-mcp**, an MCP server in [`engine/src/mcp/server.ts`](engine/src/mcp/server.ts). It has seven tools: `read_page`, `read_announcements`, `press_key`, `type_text`, `jump`, `think` and `finish`. Each call goes over loopback, with a token, to a bridge inside the engine that holds the browser.
- The agent only chooses actions and writes the one-sentence thought for each step. It cannot create findings. The same detectors as the scripted walk decide them, and the run passes the same schema check.
- Only The Listener has an AI mind. The Phantom and Bebe are scripted.

The saved AI run ([2026-11-23T1020Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-23T1020Z-listener-pay-bill/step/1), 26 steps) gave up at the dialog trap with the same two findings as the scripted run: an unlabeled button and a focus trap.

### Live mode

When you run the dashboard yourself with `npm run dev` in `dashboard/`, the **Summon a live ghost** button on Home starts Lantern Bills, runs The Listener (Scripted mind) through the engine, adds the new run to the dashboard and stops the site. It accepts requests only from your own computer. On the published site the button explains this and shows the commands to run.

### Haunt Patrol (Kiro Crew app)

Haunt Patrol is a [Kiro Crew](https://kiro.dev/docs/crew/installation/) app. Every night at midnight IST a script cron builds Lantern Bills, sends the three ghosts (scripted minds, no model call) through the pay-bill mission, and stops the site. It writes a record and a plain-text summary that compares the night with the one before. The Crew page shows the summary and each ghost's result and findings, and has one link to the live dashboard. A second agent, `patrol-guide`, explains the results in plain language and can only read.

The app is in [`crew-app/`](crew-app) here and in its own repository, https://github.com/xan-antx/haunt-crew. Patrol runs stay in the app's own data folder, so the dashboard does not list them. See [crew-app/README.md](crew-app/README.md) and, for Windows, [crew-app/INSTALL-WINDOWS.md](crew-app/INSTALL-WINDOWS.md).

## Real-world haunt: Memos

[Memos](https://github.com/usememos/memos) is a popular open-source notes app under the MIT license. Haunt did not build it. We run it only on our own computer, at `http://localhost:5230`, with a throwaway account made for Haunt, and we never visit anyone else's Memos server. The Memos account is a throwaway on a local copy: it holds nothing real, and the dashboard shows its password as dots.

The mission is `write-note`. The Listener signs in, types a note and saves it. The mission is tied to `MEMOS-1` in [`memos-behavior.md`](.kiro/specs/memos-real-world-haunt/memos-behavior.md): a signed-in user types a note, activates Save, and the new memo appears at the top of the list.

Both The Listener's scripted mind and its AI mind got stuck in the note editor on their own. In the editor, Tab and Shift+Tab cannot move focus out. Pressing Escape twice does get out, and nothing on the page or in the announcements says so. Both runs gave up and recorded a `focus_trap` finding for the editor.

| Run | Mind | Result | Steps | Findings |
|---|---|---|---|---|
| [2026-11-24T2141Z-listener-write-note](https://xan-antx.github.io/haunt/#/run/2026-11-24T2141Z-listener-write-note/step/29) | Scripted mind | Gave up | 29 | focus trap in the note editor (step 29) |
| [2026-11-26T2026Z-listener-write-note](https://xan-antx.github.io/haunt/#/run/2026-11-26T2026Z-listener-write-note/step/19) | **AI mind** | Gave up | 28 | focus trap in the note editor (step 19) |

What the runs show, and what they do not:

- The scripted run pressed Tab 50 times, then Shift+Tab, then Escape twice. The second Escape freed focus, so its evidence says the exit is undocumented. The AI run pressed Tab 153 times and Shift+Tab 101 times and gave up without finding the Escape exit.
- Neither run recorded an `unlabeled_field` finding on Memos. The editor was announced as "Any thoughts..., edit text", so Chromium gave it a name. The detector exists and is tested, and it has not found anything on Memos so far.
- Neither run saved a note, so neither completed the mission.
- The first scripted run showed two weaknesses in our own engine. A `focus_trap` was missed because the editor had a name, and the `unannounced_error` detector flagged text that only a screen reader can reach. We fixed the engine in both places and ran again. The Lantern Bills findings did not change.

To repeat the run, start your own Memos at `http://localhost:5230`, create the account named in [`engine/missions/write-note.json`](engine/missions/write-note.json), and from `engine/` run:

```
npm run haunt -- run --ghost listener --mission write-note --url http://localhost:5230
```

Add `--mind ai` for the AI mind. Haunt never starts Memos itself.

## Real runs

These seven Lantern Bills runs are in [`runs/lantern-bills/`](runs/lantern-bills) and are shown in the live dashboard. They are single runs, not statistics.

| Run | Site | Mind | Result | Findings |
|---|---|---|---|---|
| [2026-11-10T1822Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-10T1822Z-listener-pay-bill/step/1) | Lantern Bills | Scripted mind | Gave up | focus trap, unlabeled button |
| [2026-11-11T1744Z-phantom-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-11T1744Z-phantom-pay-bill/step/1) | Lantern Bills | Scripted mind | Gave up | 2 misclicks |
| [2026-11-11T1744Z-bebe-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-11T1744Z-bebe-pay-bill/step/1) | Lantern Bills | Scripted mind | Completed | untranslated text, cut-off text, 3 dark patterns |
| [2026-11-23T1020Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-23T1020Z-listener-pay-bill/step/1) | Lantern Bills | **AI mind** | Gave up | focus trap, unlabeled button |
| [2026-11-22T1148Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-22T1148Z-listener-pay-bill/step/1) | Lantern Bills (fixed copy) | Scripted mind | Completed | none |
| [2026-11-22T1153Z-phantom-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-22T1153Z-phantom-pay-bill/step/1) | Lantern Bills (fixed copy) | Scripted mind | Completed | none |
| [2026-11-22T1149Z-bebe-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-22T1149Z-bebe-pay-bill/step/1) | Lantern Bills (fixed copy) | Scripted mind | Completed | none |

Two hand-made sample runs (`runs/samples/`) are also in the repo.

## Run it locally

You need Node.js 24 or newer. There is no root `package.json`, so install and run each app in its own folder.

```
cd demo-site
npm install
npm run dev        # Lantern Bills, http://localhost:3000
```

```
cd dashboard
npm install
npm run dev        # dashboard, http://localhost:3001
```

```
cd demo-site-exorcised
npm install
npm run dev        # fixed copy, http://localhost:3002
```

Ports are fixed. If one is taken, the server stops with an error.

### Run a ghost

Serve Lantern Bills as a production build, then run the ghost in another terminal. Use the production build, not `npm run dev`: the dev server is too slow for The Phantom's slow-3G walk, and The Phantom gives up at step 1 on it instead of finding the misclicks at steps 3 and 5.

```
cd demo-site
npm run serve:ghosts    # builds Lantern Bills and serves it on http://localhost:3000
```

```
cd engine
npm install
npx playwright install chromium
npm run haunt -- run --ghost listener --mission pay-bill --url http://localhost:3000
```

Use `npm run haunt --` inside `engine/`, not `npx haunt`. An unrelated package called `haunt` is on the npm registry, and outside `engine/` npx downloads and runs that one. `--ghost` is `listener`, `phantom` or `bebe`. The last line printed is the path of the saved `run.json`. By default runs go into `runs/` at the repository root, and the dashboard picks them up the next time you start `npm run dev` or `npm run build` there.

The engine refuses any address other than `localhost`, `127.0.0.1` and domains in its config. To run a ghost on the fixed copy and have the dashboard pair the run with the original, use the fixed copy's address and name:

```
npm run haunt -- run --ghost bebe --mission pay-bill --url http://localhost:3002 --site-name "Lantern Bills demo (exorcised)"
```

To use the AI mind, add `--mind ai` to a Listener run. This needs the Kiro CLI and a Kiro account (see below). See [engine/README.md](engine/README.md) for every option and exit code, and [dashboard/README.md](dashboard/README.md) for how run files get into the dashboard.

## What needs a Kiro account

Only two things do:

- **The AI mind** (`--mind ai`). It runs the Kiro CLI, which must be installed ([kiro.dev/docs/cli](https://kiro.dev/docs/cli/)) and signed in. Each AI run uses Kiro credits, and the engine prints the credits a run used when Kiro reports them.
- **The Haunt Patrol Crew app.** It runs inside the Kiro Crew desktop app, which needs a Kiro sign-in.

Everything else works without an account: the live dashboard, both sites, scripted ghosts, live mode, and all tests.

Our hackathon credits expire on December 31. After that, new AI runs need your own Kiro credits. The two AI runs already saved in `runs/` (Lantern Bills and Memos) stay viewable in the dashboard.

## How we used Kiro

Every row points to a file in this repo.

### Specs (`.kiro/specs/`)

| Spec | Kind | What it covers | Files |
|---|---|---|---|
| `lantern-bills` | Feature | The demo site and its six planted problems | [requirements](.kiro/specs/lantern-bills/requirements.md), [design](.kiro/specs/lantern-bills/design.md), [tasks](.kiro/specs/lantern-bills/tasks.md) |
| `haunt-dashboard` | Feature | The dashboard and its screens | [requirements](.kiro/specs/haunt-dashboard/requirements.md), [design](.kiro/specs/haunt-dashboard/design.md), [tasks](.kiro/specs/haunt-dashboard/tasks.md) |
| `haunt-engine` | Feature | The engine and the three ghosts | [requirements](.kiro/specs/haunt-engine/requirements.md), [design](.kiro/specs/haunt-engine/design.md), [tasks](.kiro/specs/haunt-engine/tasks.md) |
| `listener-ai-mind` | Feature | The AI mind: haunt-mcp, the bridge, the custom agent, `--mind ai` | [requirements](.kiro/specs/listener-ai-mind/requirements.md), [design](.kiro/specs/listener-ai-mind/design.md), [tasks](.kiro/specs/listener-ai-mind/tasks.md) |
| `haunt-patrol` | Feature | The Haunt Patrol Crew app | [requirements](.kiro/specs/haunt-patrol/requirements.md), [design](.kiro/specs/haunt-patrol/design.md), [tasks](.kiro/specs/haunt-patrol/tasks.md) |
| `memos-real-world-haunt` | Feature | The `write-note` mission on Memos, element-trap detection, the `unlabeled_field` finding, and the real-world dashboard page | [requirements](.kiro/specs/memos-real-world-haunt/requirements.md), [design](.kiro/specs/memos-real-world-haunt/design.md), [tasks](.kiro/specs/memos-real-world-haunt/tasks.md), [expected Memos behavior](.kiro/specs/memos-real-world-haunt/memos-behavior.md) |
| `exorcise-different-ghost-fix` | Bugfix | Exorcise must not compare runs by different ghosts | [bugfix](.kiro/specs/exorcise-different-ghost-fix/bugfix.md), [design](.kiro/specs/exorcise-different-ghost-fix/design.md), [tasks](.kiro/specs/exorcise-different-ghost-fix/tasks.md) |
| `exorcised-payment-a11y-fix` | Bugfix | Fixed copy: pay button name, dialog keyboard trap | [bugfix](.kiro/specs/exorcised-payment-a11y-fix/bugfix.md), [design](.kiro/specs/exorcised-payment-a11y-fix/design.md), [tasks](.kiro/specs/exorcised-payment-a11y-fix/tasks.md) |
| `exorcised-remaining-fixes` | Bugfix | Fixed copy: card errors, banner, total, pre-ticked add-on, translations | [bugfix](.kiro/specs/exorcised-remaining-fixes/bugfix.md), [design](.kiro/specs/exorcised-remaining-fixes/design.md), [tasks](.kiro/specs/exorcised-remaining-fixes/tasks.md) |

### Steering (`.kiro/steering/`)

| File | Loads | What it does |
|---|---|---|
| [product.md](.kiro/steering/product.md) | Always | The three ghosts, ethics rules (own sites only, respectful personas, never weaken a test) |
| [structure.md](.kiro/steering/structure.md) | Always | Who owns each folder and how data flows from `runs/` to the dashboard |
| [tech.md](.kiro/steering/tech.md) | Always | TypeScript, Node LTS, Playwright, React with Vite, and file-editing rules |
| [demo-site.md](.kiro/steering/demo-site.md) | In `demo-site/` | Keeps the six planted problems in place unless a bugfix spec names them |
| [demo-site-exorcised.md](.kiro/steering/demo-site-exorcised.md) | In `demo-site-exorcised/` | Problems get fixed only when a bugfix spec names them, `demo-site/` stays unchanged, and tests are updated, never weakened |
| [dashboard-design.md](.kiro/steering/dashboard-design.md) | In `dashboard/` | Colors with measured contrast ratios, fonts, ghost designs, what each spooky element means, motion limits |

### Hooks (`.kiro/hooks/`)

| Hook | Trigger | What it does |
|---|---|---|
| [Build check](.kiro/hooks/build-check.json) | After a spec task finishes | Runs `npm run build` in each changed project folder: `engine`, `demo-site`, `demo-site-exorcised`, `dashboard` and `crew-app` ([script](.kiro/hooks/scripts/build-check.mjs)) |
| [Contract guard](.kiro/hooks/contract-guard.json) | Before a file write, move or delete | Asks for confirmation before anything in `contract/` changes ([script](.kiro/hooks/scripts/contract-guard.mjs)) |
| [Planted problems guard](.kiro/hooks/planted-problems-guard.json) | When the agent finishes a turn | If anything in `demo-site/src/` differs from `HEAD`, runs the tests proving the six planted problems still exist, and sends a failure back to the agent ([script](.kiro/hooks/scripts/planted-problems-guard.mjs)) |
| [Translation keeper](.kiro/hooks/translation-keeper.json) | Manual | After English strings change, adds missing keys to the Punjabi and Hindi files and lists them for review. It skips the keys that are deliberately untranslated |

### Custom agent, MCP server, Kiro CLI and Kiro Crew

| Piece | Where | How we used it |
|---|---|---|
| Custom agent | [`.kiro/agents/listener.json`](.kiro/agents/listener.json) | The Listener's AI mind. Its only tools are haunt-mcp's seven |
| MCP server | [`engine/src/mcp/server.ts`](engine/src/mcp/server.ts), started by [`engine/bin/haunt-mcp.mjs`](engine/bin/haunt-mcp.mjs) | Gives the agent the Listener's abilities and nothing else. No tool reads or writes findings |
| Kiro CLI | [`engine/src/mind/ai/kiro.ts`](engine/src/mind/ai/kiro.ts) | The engine starts `kiro-cli chat --agent listener --no-interactive`, relaunches it up to 5 times if it ends before the run does, keeps each run's Kiro log, and prints the credits used |
| Kiro Crew | [`crew-app/`](crew-app), [haunt-crew](https://github.com/xan-antx/haunt-crew) | The Haunt Patrol app: a script cron, a read-only backend, a page built with the Crew app SDK, the `patrol-guide` agent and the `reading-patrols` skill |

### Property tests

Property tests use [fast-check](https://fast-check.dev). A property test is a `describe` whose name starts with `Feature: <spec name>, Property`. Each command below runs only those tests, in the folder named.

| Spec | Folder and command | Tests |
|---|---|---|
| `haunt-engine` | `engine/`: `npm run test:properties` | 26 |
| `listener-ai-mind` | `engine/`: `npx vitest run -t "Feature: listener-ai-mind, Property"` | 28 |
| `memos-real-world-haunt` (engine half) | `engine/`: `npx vitest run -t "Feature: memos-real-world-haunt, Property"` | 24 |
| `haunt-dashboard`, `exorcise-different-ghost-fix`, `memos-real-world-haunt` (dashboard half, 7 of the tests) | `dashboard/`: `npm run test:properties` | 36 |
| `lantern-bills` | `demo-site/`: `npm run test:properties` | 20 |
| `lantern-bills`, on the fixed copy | `demo-site-exorcised/`: `npm run test:properties` | 20 |
| `exorcised-payment-a11y-fix` (bug condition and preservation) | `demo-site-exorcised/`: `npx vitest run src/__tests__/properties/payment-a11y` | 15 |
| `haunt-patrol` | `crew-app/`: `npx vitest run -t "Feature: haunt-patrol, Property"` | 53, see the note under Tests |

The dashboard runner ([dashboard/scripts/test-properties.ts](dashboard/scripts/test-properties.ts)) fails if no test matches the pattern. The planted-problems tests that the hook runs are `npx vitest --run src/components/__tests__ src/__tests__/translations.test.ts` in `demo-site/`.

### Shared contract

[contract/run-format.md](contract/run-format.md) defines the run file that the engine writes and the dashboard reads. [contract/example-run.json](contract/example-run.json) is an example, and [contract/run.schema.json](contract/run.schema.json) is the schema. Both sides check every run against it.

### Proof Kiro did the work

Kiro writes a `tasks.meta.json` file next to a spec's tasks each time it executes a task. Four specs have one. The counts are execution records, one for each time Kiro ran a task, counted from the files:

| Spec | Execution records | Kiro chat sessions |
|---|---|---|
| [`haunt-engine`](.kiro/specs/haunt-engine/tasks.meta.json) | 328 | 8 |
| [`haunt-dashboard`](.kiro/specs/haunt-dashboard/tasks.meta.json) | 185 | 2 |
| [`lantern-bills`](.kiro/specs/lantern-bills/tasks.meta.json) | 66 | 1 |
| [`exorcise-different-ghost-fix`](.kiro/specs/exorcise-different-ghost-fix/tasks.meta.json) | 50 | 1 |

That is 629 records. Three more specs, `haunt-patrol`, `listener-ai-mind` and `memos-real-world-haunt`, are fast-task specs: a short plan of tasks with the details written inside each task. They have no `tasks.meta.json`. MCP is wired through the custom agent: [`.kiro/agents/listener.json`](.kiro/agents/listener.json) registers the haunt-mcp server and allows only its tools, and the engine starts that agent with the Kiro CLI.

### Where Kiro surprised us

- **The AI mind's first run raised a false `unannounced_error` at step 22.** The agent opened a "Learn more" disclosure, and the detector read the explanation as an error. We fixed it in [`22844b7`](https://github.com/xan-antx/haunt/commit/22844b7), with regression tests that use the exact text from that run.
- **The first scripted Memos run exposed two weaknesses in our engine.** A named editor was never reported as a trap, and screen-reader-only text was read as an error. They became tasks 6.4 and 6.5 of the [`memos-real-world-haunt` tasks](.kiro/specs/memos-real-world-haunt/tasks.md), and the fix is in [`7f267b2`](https://github.com/xan-antx/haunt/commit/7f267b2).
- **A bugfix spec overrode a requirement.** The [`exorcise-different-ghost-fix` bugfix](.kiro/specs/exorcise-different-ghost-fix/bugfix.md) replaces criterion 13.8 of the dashboard requirements. The dashboard used to warn when the two runs were by different ghosts. Now it refuses to compare them.
- **Kiro Crew refused command crons on Windows.** [`haunt-patrol` task 10](.kiro/specs/haunt-patrol/tasks.md) moved the nightly patrol to a script cron, `cron/nightly_patrol.py`.

## Tests

Counted by running each suite on the current code. Commands run in the folder named in the first column.

| Folder | Command | Tests |
|---|---|---|
| `engine/` | `npm test` | 1,069 in 75 files, all passed |
| `dashboard/` | `npm test` | 490 in 42 files, all passed |
| `demo-site/` | `npm test` | 123 in 18 files, all passed |
| `demo-site-exorcised/` | `npm test` | 158 in 20 files, all passed |
| `crew-app/` | `npm test` | 169 in 29 files, all passed |
| `dashboard/` | `npm run test:e2e` (Playwright; run `npx playwright install chromium` once) | 151 in 8 files, counted with `npx playwright test --list`, not run for this README |
| `engine/` | `npm run test:e2e` (all three ghosts against Lantern Bills, slow) | 22, counted with `npx vitest list --config vitest.e2e.config.ts`, not run for this README |

The unit suites total 2,009 tests. Run one suite at a time. When we ran the engine and dashboard suites together, one dashboard test timed out, and later runs with several suites at once could not start some Vitest workers. The same suites passed when run alone. One crew-app test, `test/store.roundtrip.test.ts`, took 2.5 to 3.3 seconds alone this time, against Vitest's default 5-second timeout. It timed out in earlier runs on our Windows machine, so it can still fail on a slow or busy computer.

## Results

Each ghost reproduced its findings in **10 of 10** end-to-end runs on Lantern Bills. The end-to-end tests run the real command line 10 times per ghost and require at least 9 of 10.

| Ghost | What a run has to find |
|---|---|
| The Listener | Result "gave up", with an unlabeled button and a focus trap |
| The Phantom | A misclick (seeds 1 to 10) |
| Bebe | Cut-off text, untranslated text and a dark pattern (seeds 1 to 10) |

On the fixed copy, all three ghosts complete the task with no findings. The AI mind's saved run found the same two findings as the scripted Listener.

## Honest limitations

- **Ghosts do not replace people.** They find barriers a script or an agent can reach. They do not replace testing with disabled people, and a clean ghost run does not mean a site is accessible.
- **The read-aloud voice is an approximation.** It uses the browser's built-in speech voice. It is not real screen reader output, and the dashboard says so next to the button.
- **The Listener cannot use a screen reader's browse mode.** It moves by keyboard and listens to what would be announced, so it is stricter than a real screen reader user on some traps. A real user might get around a barrier that stops The Listener.
- **Two sites and two missions so far.** The `pay-bill` mission runs on Lantern Bills and its fixed copy, which we built ourselves with six known problems. The `write-note` mission runs only on a local copy of Memos, and only The Listener has visited it. We have one scripted run and one AI run there, and neither finished the mission. Results on other sites are unknown.
- **The detectors are heuristics.** They read the page and apply rules, so they can be wrong in both directions. The AI mind showed this. In its first run, at step 22, The Listener opened the "Learn more" disclosure in the payment protection dialog, and the `unannounced_error` detector reported the explanation ("If your payment fails due to a system error, you'll receive a full refund...") as an error, because the text contains words such as "fails" and "error". It was a false positive. We fixed the detector in two ways: text revealed by a disclosure the user opened (an `aria-expanded="true"` target or an open `<details>`) is never error text, and a sentence that opens with a condition ("if", "when", "unless") is a description, not an error about the user's input. The regression tests use the exact text from that run ([`engine/test/unannouncedError.test.ts`](engine/test/unannouncedError.test.ts) and [`engine/test/errorWords.test.ts`](engine/test/errorWords.test.ts)), and one of them checks that a real silent error next to an open disclosure is still reported. Other false positives and misses may remain.
- **AI runs vary.** The agent may take a different path each time. Only two AI runs are saved (one on Lantern Bills, one on Memos), and the end-to-end tests cover only the scripted minds. The AI mind covers only The Listener.
- **Haunt Patrol is small.** Its ghosts use scripted minds, it checks only Lantern Bills, and its runs are not shown in the dashboard. It runs only while the Crew gateway is up and the machine is awake at midnight IST, with no catch-up run.
- **Ghosts only visit our own sites,** or local copies of open-source sites. We do not test third-party production sites.

## Related work

- **UXAgent** ([paper](https://arxiv.org/abs/2504.09407), [code](https://github.com/neuhai/UXAgent)) generates thousands of LLM-driven personas that test a web design, so UX researchers can refine a study before running it with people.
- **AgentA/B** ([paper](https://arxiv.org/html/2504.09723)) runs LLM agents on live websites to carry out A/B tests, then analyzes the logged behavior for the experiment owner.
- **persona-lab** ([code](https://github.com/gobika21/persona-lab)) has AI agents test websites the way disabled people use them, with an eval suite that checks whether the agents can be trusted.

Haunt differs in these ways. It uses three fixed personas, each built around one access need: keyboard and screen reader, slow network and old phone, large text and another language. Each mission is tied to a requirement in a Kiro spec. Detectors, not the AI, decide the findings. The output is a list of specific barriers, each tied to a step, a screenshot and a mission, and Exorcise compares before and after runs by the same ghost.

## How it was built

We used Claude Code for three things: the media capture helper script ([`tools/media/`](tools/media)), copying the Crew app into its own repository, and a one-off accessibility pre-check of Memos. Everything else was built in Kiro with specs, hooks and steering.

## License

[MIT](LICENSE). Copyright (c) 2026 Anant Agrawal.
