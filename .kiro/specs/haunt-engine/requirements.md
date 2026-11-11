# Requirements Document

## Introduction

The Haunt engine in `engine/` sends synthetic ghost users into a website to try a mission, and writes what happened as a run file that the dashboard can replay. It is written in TypeScript, runs on Node.js LTS, and drives Chromium through Playwright. Every command works in Windows PowerShell.

The spec has two phases. Phase 2a starts only after Phase 1 passes its end-to-end test.

- **Phase 1: The Listener with a scripted mind.** The Listener uses only what a screen reader exposes and only the keyboard. A scripted (non-AI) mind works through a mission's intentions, so real runs exist without any AI.
- **Phase 2a: The Phantom and Bebe with scripted minds.** They use the same step recording, detector framework, run schema and safety rules as The Listener. The Phantom browses on slow 3G with an old phone. Bebe reads at 200% zoom in Punjabi, at a slow and careful pace.

The ghosts' first target is Lantern Bills (`demo-site/`, port 3000), which contains six deliberate problems. Findings about those problems are the expected result. The engine never changes `demo-site/` or `dashboard/`. In this pass nothing is written to `runs/`: every test and demo writes into `engine/test-output/`.

Findings come only from deterministic detectors, never from a ghost's mind. Tests are never weakened or deleted to make them pass. A ghost that gets stuck has found a real barrier.

## Glossary

- **Engine**: The code in `engine/`.
- **CLI**: The `haunt` command provided by the Engine, run as `npx haunt …` in `engine/`.
- **Ghost**: One of `listener` (The Listener), `phantom` (The Phantom) or `bebe` (Bebe).
- **Body**: The part of a Ghost that perceives the page and performs actions in the browser.
- **Mind**: The part of a Ghost that decides the next action from a Perception. In this spec every Mind is scripted (deterministic code, no AI).
- **Perception**: The data a Body gives its Mind before each decision. Its content depends on the Ghost.
- **Accessibility_Tree**: Chromium's accessibility tree for the page, as read through the Chrome DevTools Protocol (CDP). Each node has a role, name, description, value and states.
- **Live_Announcement**: Text that a screen reader would speak without the user moving to it: text added or changed inside an `aria-live` region or an element with role `alert`, `status` or `log`.
- **Sight**: The Perception of The Phantom and Bebe: a screenshot of the viewport plus a list of Seen_Items taken at the same moment.
- **Seen_Item**: One thing visible on the screen: its visible text, its box on the screen, and its look (`button`, `field`, `link`, `checkbox`, `text`). It carries no roles, accessible names, ARIA attributes or DOM references.
- **Mission**: A task for a Ghost, stored as a Mission_File.
- **Mission_File**: A JSON file in `engine/missions/`, one per Mission.
- **Intention**: One entry in a Mission's ordered list of things the Mind tries to do, such as "open the payment form" or "type the card number".
- **Step**: One recorded action, with the fields defined in `contract/run-format.md`.
- **Finding**: One recorded barrier, with the fields defined in `contract/run-format.md`.
- **Detector**: A deterministic function that runs after every Step and may record Findings. Detectors may inspect the DOM and layout.
- **Run**: One attempt by one Ghost at one Mission on one site.
- **Run_File**: The `run.json` file written for a Run.
- **Run_Schema**: The JSON Schema file `contract/run.schema.json`.
- **Run_Invariants**: Rules the Run_Schema cannot express, checked in code: Steps numbered 1 to N with no gaps, every Finding's `step` is an existing Step number, every screenshot path refers to a file the Run will save, the `runId` format, and `startedAt` in UTC.
- **Run_Id**: `YYYY-MM-DDTHHmmZ-<ghost>-<mission>` built from the Run's UTC start time, for example `2026-11-10T1530Z-listener-pay-bill`, with a `-2`, `-3`… suffix when needed to keep it unique.
- **Site_Key**: The short folder name of a site, for example `lantern-bills`.
- **Out_Root**: The folder that receives Run folders: `runs/` at the repository root by default, or the folder given with `--out`.
- **Run_Folder**: `<Out_Root>/<Site_Key>/<Run_Id>/`, holding `run.json` and `shots/`.
- **Haunt_Config**: The file `engine/haunt.config.json`.
- **Allowed_Address**: A URL that the Engine may visit (Requirement 4).
- **Tabbable**: An element that the Tab key can move focus to.
- **Full_Pass**: One complete round of searching: the Mind keeps moving through controls until it lands again on a control it already reached in the same round.
- **Settle**: Waiting after an action until the page is ready for the next decision. The rule depends on the Ghost.
- **Reaction_Delay**: The pause between a visual Ghost's Perception and its click.
- **Misclick_Streak**: The number of Misclicks in a row while The Phantom is trying the same Intention, without a correct click on that Intention in between.
- **Give_Up_Thought**: A plain-words sentence that says why a Ghost gave up, added to the `thought` of the Run's last Step.
- **Page_Change_Clock**: The time of the most recent change on the page, recorded by a script the Engine adds to every page: a DOM change in a rendered element, a layout shift, an image finishing loading, or a running CSS animation. Only the Body and the Detectors read it; no Mind receives it.
- **Lantern_Bills_Harness**: Test code that builds Lantern Bills from `demo-site/` into Test_Output, serves the build on port 3000 for the end-to-end tests and demos, and stops it afterwards.
- **Test_Output**: The folder `engine/test-output/`, ignored by git.
- **Property_Test**: A fast-check test whose top-level `describe` name starts with `Feature: haunt-engine, Property`.

## Requirements

### Requirement 1: Engine project

**User Story:** As the Ghost Builder, I want an engine project that installs and runs with a few commands in PowerShell, so that anyone on the team can run a ghost.

#### Acceptance Criteria

1. THE Engine SHALL be located in `engine/`, written in TypeScript in strict mode, and run on Node.js LTS version 24 or later.
2. THE Engine SHALL drive the browser with the `playwright` package using Chromium only.
3. THE Engine SHALL provide the npm scripts `build` (type check), `test` (unit and Property_Tests), `test:properties`, `test:e2e`, `demo` and `demo:all`, and each script SHALL run in Windows PowerShell without Unix-only syntax such as `rm -rf`, `VAR=value command` or single-quoted arguments.
4. WHEN a developer runs `npm install` and then `npx haunt run --ghost listener --mission pay-bill --url http://localhost:3000` in `engine/`, THE CLI SHALL start the Run without a separate compile step.
5. IF Chromium for Playwright is not installed, THEN THE CLI SHALL print the command `npx playwright install chromium` and exit with code 1 without writing any file.
6. THE Engine SHALL ignore `engine/node_modules/` and `engine/test-output/` in git.
7. THE work in this spec SHALL NOT create, modify or delete any file in `dashboard/`, `demo-site/` or `runs/`. Outside `engine/` and this spec folder, it SHALL only add `contract/run.schema.json`.

### Requirement 2: Run command and output location

**User Story:** As the Ghost Builder, I want one command that runs a ghost and saves a run folder in a predictable place, so that the dashboard can pick it up.

#### Acceptance Criteria

1. WHEN the CLI receives `run --ghost <ghost> --mission <id> --url <url>`, THE CLI SHALL run that Ghost on that Mission at that URL and save `run.json` in the Run_Folder and every Step and Finding screenshot in the Run_Folder's `shots/` folder.
2. THE CLI SHALL use `runs/` at the repository root as the Out_Root by default, and WHERE `--out <dir>` is given THE CLI SHALL use `<dir>` (resolved against the current folder) as the Out_Root instead.
3. THE CLI SHALL build the Run_Id from the Run's start time in UTC as `YYYY-MM-DDTHHmmZ-<ghost>-<mission>`.
4. IF a folder named after the Run_Id already exists under `<Out_Root>/<Site_Key>/`, THEN THE CLI SHALL add the first free suffix `-2`, `-3`, and so on to the Run_Id, and use the same value for the folder name and the `runId` field.
5. THE CLI SHALL take the Site_Key from the Mission_File's `site` field, and WHERE `--site <key>` is given THE CLI SHALL use that key instead. The Site_Key SHALL be listed in the Haunt_Config `sites` section and SHALL contain only lowercase letters, digits and single hyphens.
6. WHEN a Run_File has been saved, THE CLI SHALL print the absolute path of `run.json` as the last line of standard output and exit with code 0 when the result is `succeeded` or `gave_up`, and with code 3 when the result is `error`.
7. IF an argument is missing, unknown or invalid, including an unknown Ghost, an unknown Mission or an unknown Site_Key, THEN THE CLI SHALL print what is wrong and the allowed values, exit with code 2, and not open a browser.
8. THE CLI SHALL accept the options `--seed <integer>` (seed for the visual Ghosts' timing jitter, random and printed to standard error when absent), `--headed` (show the browser window), `--config <file>` and `--missions <dir>` (used by tests to point at fixture files).
9. WHEN `npx haunt --help` or `npx haunt run --help` is run, THE CLI SHALL print the usage, the options and the allowed Ghost values, and exit with code 0.
10. IF the Engine runs under the test runner and the Out_Root resolves to a folder inside the repository's `runs/` folder, THEN THE CLI SHALL refuse to run and exit with code 2.

### Requirement 3: Run files and the Run_Schema

**User Story:** As the House Builder, I want every run file to follow the contract exactly, so that the dashboard never receives a broken run.

#### Acceptance Criteria

1. THE Engine SHALL add `contract/run.schema.json`, a JSON Schema (draft 2020-12) that expresses every field, type, required field and allowed value in `contract/run-format.md`, rejects fields the contract does not define, treats `focusBox` as optional, allows an empty `findings` list, and requires at least one Step.
2. THE Run_Schema SHALL accept `contract/example-run.json` and every `run.json` under `runs/samples/`.
3. THE Run_Schema SHALL reject a `ghost` other than `listener`, `phantom` or `bebe`, a `result` other than `succeeded`, `gave_up` or `error`, and a finding `type` other than the eight types in `contract/run-format.md`.
4. WHEN a Run ends, THE Engine SHALL validate the Run_File against the Run_Schema and the Run_Invariants before writing anything to the Run_Folder.
5. IF the Run_File fails the Run_Schema or a Run_Invariant, THEN THE Engine SHALL write no `run.json`, no screenshot and no Run_Folder, SHALL print each problem with its JSON path, and SHALL exit with code 1.
6. THE Engine SHALL write a Run_Folder by writing all files into a temporary folder next to it and renaming that folder, so that a Run_Folder is either complete or absent.
7. THE Engine SHALL set `site.commit` to the output of `git rev-parse --short HEAD` in the repository. IF git is not available or the folder is not a git repository, THEN THE Engine SHALL set `site.commit` to `unknown` and print a warning.
8. THE Engine SHALL set `site.name` from the Haunt_Config entry of the Site_Key, and `site.url` to the `--url` value as parsed by the WHATWG URL parser, without a trailing slash when the path is `/`.
9. THE Engine SHALL copy `mission.id`, `mission.goal` and `mission.requirement` from the Mission_File, and set `mission.successCheck` to the Mission_File's `successCheck.text`.
10. THE Engine SHALL set `startedAt` to the Run's start time in UTC in the form `YYYY-MM-DDTHH:mm:ssZ`, and `formatVersion` to 1.

### Requirement 4: Address safety

**User Story:** As the team, I want ghosts to visit only our own sites, so that we never test a third-party production site without permission.

#### Acceptance Criteria

1. THE Engine SHALL treat a URL as an Allowed_Address only when it parses with the WHATWG URL parser, its scheme is `http` or `https`, it contains no user name or password, and its host is `localhost`, `127.0.0.1`, or exactly equal to an entry of `allowedDomains` in the Haunt_Config.
2. THE Engine SHALL compare hosts case-insensitively after URL parsing, and SHALL NOT treat a subdomain of a listed domain as allowed unless that subdomain is listed itself.
3. WHEN the `--url` value is not an Allowed_Address, THE CLI SHALL refuse it before any browser process starts, print the refused host and how to allow a domain the team owns, write no file, and exit with code 2.
4. IF the Haunt_Config is missing, is not valid JSON or fails its schema, THEN THE CLI SHALL refuse every address, print the configuration problem and exit with code 2.
5. THE Haunt_Config schema SHALL accept in `allowedDomains` only plain lowercase host names, with no scheme, port, path, wildcard or IP address.
6. WHILE a Run is in progress, THE Engine SHALL block every request, navigation, WebSocket and service worker to a host that is not an Allowed_Address, and print each blocked URL to standard error.

### Requirement 5: Missions

**User Story:** As the Ghost Builder, I want missions stored as data, so that scripted minds can attempt them and the run says which requirement was tested.

#### Acceptance Criteria

1. THE Engine SHALL load Missions from `engine/missions/<id>.json`, one file per Mission, and SHALL validate each file against `engine/schemas/mission.schema.json` when loading it.
2. THE Mission_File SHALL contain `id` (equal to the file name without `.json`), `site` (a Site_Key), `goal`, `requirement`, `successCheck` (an object with `text` and `visible`, a CSS selector) and a non-empty ordered list of `intentions`.
3. EACH Intention SHALL contain an `id`, a `thought`, a `do` value (`activate` or `type`), a `target` with a `kind` (`button`, `link`, `field` or `checkbox`) and name patterns for `en` and optionally `pa` and `hi`, a `value` when `do` is `type`, an optional `lastResort` value `unnamedButton`, and a `doneWhen` condition that a Mind can check from its own Perception.
4. THE Engine SHALL provide the Mission `pay-bill` for the Site_Key `lantern-bills`, whose Intentions are, in order: open the payment form, type the card number `4111111111111111`, type a future expiry date, type the CVV `123`, type a cardholder name, submit the form, and confirm the payment.
5. THE `pay-bill` Mission's `requirement` SHALL be, character for character, the EARS text of Requirement 2, acceptance criterion 9 of `.kiro/specs/lantern-bills/requirements.md`.
6. THE `pay-bill` Mission's `successCheck.visible` SHALL be `[data-haunt="payment-success"]`.
7. WHEN an Intention value contains `{{futureExpiry}}`, THE Engine SHALL replace it with the month two years after the Run's start month, in the form `MM/YY`.
8. THE Engine SHALL decide a Mission's success by checking, after every Step, whether an element matching `successCheck.visible` is visible. The Mind SHALL NOT decide success.
9. IF a Mission_File is missing or fails validation, THEN THE CLI SHALL print the problem and exit with code 2 without opening a browser.

### Requirement 6: Step recording

**User Story:** As the House Builder, I want every ghost action recorded the same way, so that the dashboard can replay any ghost.

#### Acceptance Criteria

1. THE Engine SHALL record every action as one Step with `n`, `page` (the URL path), `action` (the action in plain words), `spoken`, `thought`, `screenshot`, `waitMs` and, when available, `focusBox`.
2. THE Engine SHALL number Steps from 1 in the order they happen, with no gaps.
3. THE first Step of every Run SHALL be opening the `--url` address.
4. THE Engine SHALL take each Step's screenshot of the viewport after the action has Settled, and save it as `shots/NNN.png`, where `NNN` is the Step number with three digits.
5. THE Engine SHALL give each Step's recorded screenshot only to the run file, never to The Listener's Mind.
6. THE Engine SHALL record `focusBox` in pixels of that Step's screenshot: the focused element's box for The Listener, and the box the Ghost aimed at for click Steps of The Phantom and Bebe. THE Engine SHALL leave `focusBox` out when there is no such box, the box has no area, or the box lies outside the viewport.
7. THE Engine SHALL set `waitMs` to the whole milliseconds from the end of the action until the Ghost was ready for its next decision.
8. THE Engine SHALL set `thought` to the Mind's reason for the action, in plain, first-person, respectful words.
9. THE Engine SHALL end a Run after at most 60 Steps.

### Requirement 7: Detector framework

**User Story:** As the team, I want findings to come from deterministic checks with evidence, so that every finding can be trusted and reproduced.

#### Acceptance Criteria

1. THE Engine SHALL run every Detector of the Run's Ghost after every Step, and each Detector SHALL produce the same Findings for the same page state and Step history.
2. Detectors MAY inspect the DOM, computed styles, layout, the Accessibility_Tree and the Step history. THE Mind SHALL NOT receive any of this information except through its own Perception.
3. EACH Finding SHALL have a `type`, the `step` that revealed it, a short `title`, `evidence` that states what was observed in measurable terms, and a `screenshot` path.
4. THE Mind SHALL NOT create, change or remove Findings, and SHALL NOT receive Finding titles or evidence.
5. THE Engine SHALL record each distinct problem at most once per Run.
6. THE Detectors SHALL NOT change the page: no clicks, key presses, focus changes, scrolling, value changes or DOM changes.
7. THE Engine SHALL use these Detector sets: The Listener: `unlabeled_button`, `focus_trap`, `unannounced_error`. The Phantom: `slow_wait`, `misclick`. Bebe: `cut_off_text`, `untranslated`, `dark_pattern`.
8. IF a Detector throws an error, THEN THE Engine SHALL end the Run with result `error`, and the last Step's `thought` SHALL name the Detector and the error.

### Requirement 8: The Listener's body

**User Story:** As a screen reader user represented by The Listener, I want the ghost to experience the page the way I do, so that its runs show the barriers I meet.

#### Acceptance Criteria

1. THE Listener SHALL browse in Chromium with a 1280 by 800 CSS pixel viewport, device scale factor 1, locale `en-IN` and no network or CPU throttling.
2. THE Listener's Perception SHALL contain only: the page title and path, the Accessibility_Tree nodes (role, name, description, value and states such as focused, checked, expanded, disabled, required, invalid and heading level), which node has focus, the dialog and region that contain the focus, the Live_Announcements since the previous Step, and opaque node references.
3. THE Listener's Perception SHALL NOT contain screenshots, pixels, coordinates, sizes, CSS, HTML or DOM handles.
4. THE Listener SHALL capture Live_Announcements made during an action and during the Settle that follows it.
5. THE Listener SHALL act only through these keyboard actions: Tab, Shift+Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter, Space, Escape, typing text into the focused field, next or previous heading, next or previous landmark, next or previous form field, and next or previous button.
6. WHEN The Listener jumps to the next or previous heading or landmark, THE Listener SHALL move only its reading position in the Accessibility_Tree and speak that node, without sending a key to the page or moving focus.
7. WHEN The Listener jumps to the next or previous form field or button, THE Listener SHALL press Tab or Shift+Tab until the focused element is of that kind, for at most one full cycle of Tabbable elements, so a jump reaches only what the keyboard can reach.
8. THE Listener's Body SHALL NOT click, tap, use the mouse or touch screen, call `focus()`, set values directly or run scripts that change the page.
9. THE Listener SHALL record in `spoken` an approximation of what a screen reader would say after the action: the name followed by the role words and states (for example `Pay this bill, button`), only the role words when the name is empty (for example `button`), the dialog or region name when focus enters one, the echo of typed text, and every Live_Announcement.
10. THE Listener SHALL record in `action` the action in plain words, including the number of Tab presses a jump needed (for example `Next button (Tab ×3)`).
11. THE Listener SHALL Settle after each action until the DOM has had no changes and no request has been in flight for 300 ms, or for at most 5000 ms.

### Requirement 9: The Listener's scripted mind

**User Story:** As the Ghost Builder, I want The Listener to look for controls the way screen reader users do, so that its runs are believable without AI.

#### Acceptance Criteria

1. THE Listener's Mind SHALL work through the Mission's Intentions in order, and SHALL move to the next Intention only when the current one's `doneWhen` condition holds in its Perception.
2. WHEN the focused node matches the current Intention's target, THE Mind SHALL act on it: Enter to activate a button or link, Space to toggle a checkbox, or type the value into a field.
3. WHEN the focused node does not match outside a dialog, THE Mind SHALL search with jumps of the target's kind (next button, next form field) until it finds a match or completes a Full_Pass.
4. WHEN the focus is inside a dialog and the focused node does not match, THE Mind SHALL search with Tab until a Full_Pass, then with Shift+Tab until a Full_Pass, and then press Escape once.
5. THE Mind SHALL match a node when its role fits the target's kind and its accessible name matches one of the target's `en` patterns (case-insensitive regular expressions). A control used for an earlier Intention SHALL NOT match a later Intention.
6. IF a Full_Pass finds no match and the Intention has `lastResort: "unnamedButton"`, THEN THE Mind SHALL try the buttons with an empty name that it reached during the pass, one at a time in the order it reached them, until the Intention's `doneWhen` holds.
7. IF the search and the last resort find no match, THEN THE Mind SHALL give up.
8. THE Mind SHALL give a thought for every decision that names what it heard and why it acts, and MAY mention controls that it hears in the Accessibility_Tree but cannot reach.
9. GIVEN the same sequence of Perceptions, THE Mind SHALL make the same decisions.
10. WHEN the Run starts and whenever the page path changes, THE Mind SHALL first jump to the next heading once, to hear where it is, before it searches for the current Intention's target.

### Requirement 10: The Listener's detectors

**User Story:** As a screen reader user, I want the barriers I meet recorded with evidence, so that developers can fix them.

#### Acceptance Criteria

1. THE `unlabeled_button` Detector SHALL record a Finding for each rendered element with the role `button` that is not hidden from assistive technology and whose accessible name in the Accessibility_Tree is empty.
2. THE `unlabeled_button` Finding SHALL use the first Step at which The Listener focused that button. IF The Listener never focused it, THEN the Finding SHALL use the first Step at which the button was present. Its evidence SHALL say where the button is, what it contains, which naming sources are absent (text, `aria-label`, `aria-labelledby`, `title`), and that a screen reader says only "button".
3. THE `focus_trap` Detector SHALL record a Finding when, while focus stays inside one visible dialog: Tab presses landed on a control already reached in that dialog, Shift+Tab presses also landed on a control already reached, Escape was pressed and the dialog stayed open with focus inside it, and at least one visible, enabled control inside the dialog was never focused.
4. THE `focus_trap` evidence SHALL list the controls Tab and Shift+Tab reached, the visible controls never reached with the reason found in the DOM (for example `tabindex="-1"`), and that Escape did not close the dialog.
5. THE `unannounced_error` Detector SHALL treat as error text any newly visible text that matches the error wording list (in English, Punjabi and Hindi) or sits in an element whose class or id contains `error` or `invalid`.
6. THE `unannounced_error` Detector SHALL record a Finding, at the Step where the error text appeared, when that text was never part of a Live_Announcement and never part of the focused field's accessible description while it was visible, checked until it disappears or the Run ends.

### Requirement 11: When The Listener gives up

**User Story:** As a viewer of the dashboard, I want to read in plain words why The Listener stopped, so that I understand the barrier without reading code.

#### Acceptance Criteria

1. WHEN the `focus_trap` Detector records a Finding and the Mission has not succeeded, THE Engine SHALL end the Run with result `gave_up`.
2. WHEN the Mind gives up because no control matched its Intention after a Full_Pass and the last resort, THE Engine SHALL end the Run with result `gave_up`.
3. WHEN the Run reaches 60 Steps without success, THE Engine SHALL end the Run with result `gave_up`.
4. WHEN a Run ends with `gave_up`, THE Engine SHALL add the Mind's Give_Up_Thought to the last Step's `thought`. The Mind SHALL build that sentence from its own memory of what it heard, and SHALL receive only the reason code (`trapped`, `no_match` or `step_limit`).
5. WHEN the successCheck holds after a Step, THE Engine SHALL end the Run with result `succeeded`, even when that Step also produced Findings.
6. IF the page cannot be opened or an unexpected error stops the Run after at least one Step, THEN THE Engine SHALL end the Run with result `error` and add the error message in plain words to the last Step's `thought`.

### Requirement 12: The Listener's self-checks

**User Story:** As the team, I want The Listener checked automatically, so that no one has to check runs by hand.

#### Acceptance Criteria

1. THE Engine SHALL include Property_Tests, each with at least 100 generated cases, showing that: every Run_File the Engine saves passes the Run_Schema and the Run_Invariants; addresses that are not Allowed_Addresses are always refused before a browser starts; every Finding points to an existing Step; and Steps are numbered from 1 with no gaps.
2. THE Engine SHALL include unit tests for each Listener Detector against local fixture pages, with at least one page where the Detector must record a Finding and one where it must not.
3. THE end-to-end test SHALL start Lantern Bills on port 3000 through the Lantern_Bills_Harness, run The Listener 10 times through the CLI with the `pay-bill` Mission into `engine/test-output/`, and pass only when at least 9 Runs each have result `gave_up` and both an `unlabeled_button` and a `focus_trap` Finding.
4. THE end-to-end test SHALL also check that every Run_File it produced passes the Run_Schema, the Run_Invariants and the dashboard's `validateRun` with no errors.
5. IF port 3000 is already in use when the Lantern_Bills_Harness starts, THEN the test SHALL fail with a message that names the port and asks the developer to stop the other server.
6. THE Lantern_Bills_Harness SHALL stop the Lantern Bills server it started, including when a test fails, and SHALL NOT modify any file in `demo-site/`.
7. WHEN a developer runs `npm run demo` in `engine/`, THE Engine SHALL start Lantern Bills, write one Listener Run into `engine/test-output/demo-run/`, confirm that its Run_File passes the Run_Schema, print the path of its `run.json`, and stop the server.
8. THE Lantern_Bills_Harness SHALL build Lantern Bills with the Vite installed in `demo-site/` into `engine/test-output/.lantern-bills-build/` with base `/`, serve that build with `vite preview` on port 3000 with a strict port, and wait until `http://localhost:3000/` answers with HTTP 200, for at most 60 seconds.
9. THE Lantern_Bills_Harness SHALL record the output of `git status --porcelain -- demo-site` before it starts, and the end-to-end test SHALL fail when that output is different after the server stops.
10. IF `demo-site/node_modules` does not exist, THEN the Lantern_Bills_Harness SHALL fail with a message asking the developer to run `npm install` in `demo-site/`, and SHALL NOT install anything itself.

### Requirement 13: The Phantom's body

**User Story:** As someone on slow internet with an old phone, represented by The Phantom, I want the ghost to wait and tap the way I do, so that its runs show the barriers I meet.

#### Acceptance Criteria

1. THE Phantom SHALL browse in Chromium with a 360 by 640 CSS pixel viewport, device scale factor 2, mobile mode, touch support, an older Android user agent, locale `en-IN`, network throttling of 2000 ms latency with 50 000 bytes per second down and up (a slow 3G profile), and CPU throttling of 4 times.
2. THE Phantom's Perception SHALL be a Sight: a screenshot of the viewport and the Seen_Items captured at the same moment, with no roles, accessible names, ARIA attributes or DOM references.
3. THE Phantom SHALL Settle until the page's load event has fired and the Page_Change_Clock shows no change for 1200 ms, checking every 50 ms, or for at most 20 000 ms. It then takes its Sight at once.
4. WHEN The Phantom decides to click a Seen_Item, THE Phantom SHALL wait a Reaction_Delay between 900 and 1100 ms, chosen from the Run's seed and counted from the moment its Sight was complete, and then click the centre of the box where it saw the item, without looking at the page again.
5. THE Phantom SHALL type into the focused field with 120 ms between characters.
6. THE Phantom SHALL also be able to scroll by most of a screen, wait without acting, and use the browser's Back.

### Requirement 14: The Phantom's scripted mind

**User Story:** As the Ghost Builder, I want The Phantom to look for controls by what it sees, so that its runs are believable without AI.

#### Acceptance Criteria

1. THE Phantom's Mind SHALL work through the Mission's Intentions in order and match Seen_Items by look and by visible text against the target's `en` patterns. It SHALL match a field by the nearest text directly above or to the left of the field. A Seen_Item with the same look and text as an item used for an earlier Intention SHALL NOT match a later Intention.
2. WHERE an Intention has `lastResort: "unnamedButton"`, THE Mind SHALL try Seen_Items that look like buttons and show no text when no other item matches.
3. WHEN no target is visible, THE Mind SHALL scroll down until the bottom of the page, then scroll up to the top, and give up if it still finds no target.
4. WHEN the page shows nothing it can act on while the page is still loading or blank, THE Mind SHALL wait.
5. WHEN a click leads to a page that has none of the current Intention's targets and that the Mind did not expect, THE Mind SHALL go back by clicking a visible link whose text matches `back`, or with the browser's Back when there is none, and then try the same Intention again.

### Requirement 15: The Phantom's detectors

**User Story:** As someone on slow internet, I want long waits and wrong taps recorded with evidence, so that developers can fix them.

#### Acceptance Criteria

1. THE `slow_wait` Detector SHALL record a Finding when, while the Ghost was waiting (during a Settle or a wait action, across consecutive Steps), more than 10 000 ms passed with no visible sign of progress. Visible signs of progress are: a change on the Page_Change_Clock, a visible loading indicator (role `progressbar`, `aria-busy="true"`, or an element whose class or id contains `spinner` or `loading`), or the page's load event not yet having fired, which is when a real browser shows its loading bar.
2. THE `slow_wait` evidence SHALL give the length of the wait in seconds, the Step, and what the screen showed.
3. THE `misclick` Detector SHALL record a Finding for a click Step when the interactive element that received the click differs from the interactive element under the aimed point at the moment of the Perception.
4. THE `misclick` evidence SHALL list the layout-shift entries recorded between the Perception and the click (shift value and each moved element's previous and current box), name the intended and the hit element by their visible text, and name the before screenshot (`shots/NNN-seen.png`, saved by the Engine) and the after screenshot (`shots/NNN.png`).

### Requirement 16: When The Phantom gives up

**User Story:** As a viewer of the dashboard, I want to read in plain words why The Phantom stopped.

#### Acceptance Criteria

1. WHEN the `slow_wait` Detector records a Finding and the Mission has not succeeded, THE Engine SHALL end the Run with result `gave_up`.
2. WHEN the Misclick_Streak reaches 2, THE Engine SHALL end the Run with result `gave_up`. Clicks made to recover from a misclick SHALL NOT reset the Misclick_Streak; a correct click on the Intention's target SHALL reset it to 0.
3. WHEN the Mind gives up or the Run reaches 60 Steps, THE Engine SHALL end the Run with result `gave_up`.
4. THE Engine SHALL add a Give_Up_Thought to the last Step's `thought` as in Requirement 11, criterion 4, with the reason codes `slow_wait`, `misclicks`, `no_match` or `step_limit`.

### Requirement 17: Bebe's body

**User Story:** As a grandmother who needs big text and reads Punjabi, represented by Bebe, I want the ghost to read the page the way I do, so that its runs show the barriers I meet.

#### Acceptance Criteria

1. Bebe SHALL browse in Chromium with a 640 by 400 CSS pixel viewport and device scale factor 2 (200% zoom on a 1280 by 800 screen), locale `pa-IN`, the `Accept-Language` header `pa-IN,pa;q=0.9`, and no throttling.
2. Bebe's Perception SHALL be a Sight in which each Seen_Item's text contains only the characters actually visible on the screen, so clipped characters are absent.
3. Bebe SHALL Settle until the page's load event has fired and the Page_Change_Clock shows no change for 2000 ms, checking every 50 ms, or for at most 20 000 ms.
4. Bebe SHALL wait a Reaction_Delay between 1300 and 1700 ms, chosen from the Run's seed, before each click, and SHALL type with 300 ms between characters.
5. Bebe SHALL act by clicking, typing, scrolling over the middle of the viewport, and waiting.

### Requirement 18: Bebe's scripted mind

**User Story:** As the Ghost Builder, I want Bebe to read carefully and keep going when she can, so that her runs show problems even when she gets through.

#### Acceptance Criteria

1. Bebe's Mind SHALL match Seen_Items against the target's `pa` patterns first, then `hi`, then `en`. It SHALL match fields by the nearest text above or to the left, and SHALL skip items used for an earlier Intention, as The Phantom does.
2. WHERE an Intention has `lastResort: "unnamedButton"`, Bebe's Mind SHALL try buttons that show no text when no other item matches.
3. Bebe SHALL complete the Mission when she can. Findings SHALL NOT stop her Run.
4. Bebe's thoughts SHALL be written in English and quote the Punjabi or English text she saw.
5. WHEN Bebe finds no target after scrolling from the top to the bottom of the page and back, or the Run reaches 60 Steps, THE Engine SHALL end the Run with result `gave_up` and add a Give_Up_Thought.

### Requirement 19: Bebe's detectors

**User Story:** As Bebe, I want cut-off text, untranslated text and tricky choices recorded, so that developers can fix them.

#### Acceptance Criteria

1. THE `cut_off_text` Detector SHALL record a Finding for visible text in which at least one character lies outside the box of the element or ancestor that clips it (`overflow` `hidden` or `clip`, or `text-overflow: ellipsis`) and cannot be scrolled into view. Its evidence SHALL quote the full text, the visible part and the clipping box's width.
2. THE `untranslated` Detector SHALL record a Finding for visible text on a page shown in Punjabi (the `html` `lang` starts with `pa`) that, after removing the site's allowed terms from the Haunt_Config, acronyms of up to four capital letters and tokens containing digits, still contains at least two English words of three or more letters.
3. THE `dark_pattern` Detector SHALL record a Finding when a visible checkbox whose label contains a currency amount is already ticked when it first appears and the Ghost has not touched it, and a separate Finding when a visible amount labelled as a total (English `total`, Punjabi `ਕੁੱਲ`, Hindi `कुल`) is higher than the bill amount. The bill amount is the first currency amount in the rendered text of the first page the Ghost opened, in document order, read from the DOM when the first Step settles.
4. Bebe's Detectors SHALL report a Finding at the first Step at which the problem is inside the viewport. IF the problem was never inside the viewport, THEN the Finding SHALL use the first Step at which it was present, and the evidence SHALL say it was outside the visible area.
5. WHEN Bebe pays more than the bill because of a pre-ticked paid option and the successCheck holds, THE Engine SHALL record the Run as `succeeded` with the `dark_pattern` Findings.

### Requirement 20: Phase 2a self-checks

**User Story:** As the team, I want The Phantom and Bebe checked automatically, so that no one has to check their runs by hand.

#### Acceptance Criteria

1. THE Property_Tests of Requirement 12, criterion 1 SHALL cover all three Ghosts.
2. THE Engine SHALL include Property_Tests showing that The Phantom's and Bebe's Perceptions never contain accessibility roles, accessible names, ARIA attributes or DOM references, that their Reaction_Delays always stay in their ranges for any seed, and that the Misclick_Streak rule ends a Run exactly at the second misclick in a row.
3. THE Engine SHALL include unit tests for each Phase 2a Detector against local fixture pages, with at least one page where the Detector must record a Finding and one where it must not, and a test that measures that The Phantom's network throttling is active.
4. THE end-to-end test for The Phantom SHALL start Lantern Bills on port 3000 through the Lantern_Bills_Harness, run The Phantom 10 times through the CLI with the `pay-bill` Mission into `engine/test-output/`, and pass only when at least 9 Runs have a `misclick` Finding.
5. THE end-to-end test for Bebe SHALL start Lantern Bills on port 3000 through the Lantern_Bills_Harness, run Bebe 10 times through the CLI with the `pay-bill` Mission into `engine/test-output/`, and pass only when at least 9 Runs each have `cut_off_text`, `untranslated` and `dark_pattern` Findings.
6. EACH end-to-end test SHALL check that every Run_File it produced passes the Run_Schema, the Run_Invariants and the dashboard's `validateRun` with no errors.
7. WHEN a developer runs `npm run demo:all` in `engine/`, THE Engine SHALL start Lantern Bills, write one Run per Ghost (The Listener, The Phantom and Bebe) into `engine/test-output/demo-runs/`, confirm that each Run_File passes the Run_Schema, print the path of each `run.json`, and stop the server.
