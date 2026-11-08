# Requirements Document

## Introduction

The Haunt dashboard is a static React + Vite + TypeScript site in `dashboard/` that shows where Haunt's ghost personas got stuck while trying to complete missions on a website. It reads run files written in the format defined by `contract/example-run.json` and `contract/run-format.md`, from `runs/` and `runs/samples/`. The dashboard never runs ghosts itself. It runs on port 3001 (the demo site uses 3000).

The dashboard has seven screens: Home, Haunted Map, Graveyard, Ghost Cam, Séance, Exorcise and Spec Coverage. It is built for the Kiroween 2026 Costume Contest category, so it has a candlelit haunted-house look where every spooky element communicates something. The dashboard itself must be fully accessible.

Test data is the two sample runs in `runs/samples/`: `listener-gave-up/run.json` (The Listener, result `gave_up`, 9 steps, findings at steps 7 and 9) and `bebe-succeeded/run.json` (Bebe, result `succeeded`, 6 steps, finding at step 3).

The allowed `ghost`, `result` and finding `type` values are defined in `contract/run-format.md`. The dashboard uses exactly those values.

## Glossary

- **Dashboard**: The web application in `dashboard/`.
- **Run_File**: A `run.json` file following the contract format, found anywhere under `runs/`.
- **Run**: A Run_File that passed validation.
- **Invalid_Run**: A Run_File that failed validation, shown with its errors instead of its contents.
- **Run_Key**: The identifier used for a Run in URLs. It equals the Run's `runId`.
- **Run_Index**: The generated list of all Run_Files, created by the Collect_Step.
- **Collect_Step**: The build-time script that copies Run_Files and their screenshots into the Dashboard and writes the Run_Index.
- **Data_Module**: The single module through which every screen loads Run_Index and Run data.
- **Run_Source**: An implementation of the Data_Module's loading interface. The static source reads files produced by the Collect_Step; a live source may be added later.
- **Ghost**: One of the three personas: `listener` (The Listener), `phantom` (The Phantom) or `bebe` (Bebe).
- **Haunt**: All Runs that share the same `site.name`, shown as one entry on Home.
- **Room**: A distinct `page` value among the steps of a Haunt's Runs.
- **Cold_Spot**: A step where a ghost got stuck: a step referenced by a finding, or the last step of a Run whose result is `gave_up` or `error`.
- **Tombstone**: The Graveyard's visual card for one finding.
- **Ghost_Cam**: The dual-view step-by-step replay of one Run.
- **Spoken_Panel**: The Ghost_Cam's right-hand panel for The Listener, showing spoken text on black with a waveform.
- **Thought_Panel**: The Ghost_Cam's right-hand panel for other ghosts, showing thought text.
- **Approximate_Voice**: Optional playback of spoken text through the browser's built-in `speechSynthesis` API.
- **Séance_Question**: One of four fixed questions: "Why did you give up?", "Where did you get stuck?", "What did you hear?", "What would have helped?".
- **Finding_Match_Key**: The pair (finding `type`, `page` of the finding's step) used to match findings between two Runs.
- **Reproduce_Command**: A shell command, generated from Run fields, that re-creates a Run.
- **Placeholder**: A grey box drawn in place of a screenshot that is missing or cannot be loaded.
- **Reduced_Motion**: The user's `prefers-reduced-motion: reduce` setting.

## Requirements

### Requirement 1: Project setup

**User Story:** As a House Builder, I want the dashboard to start with one command on its own port, so that it can run next to the demo site.

#### Acceptance Criteria

1. THE Dashboard SHALL be built with React, Vite and TypeScript in strict mode, located in `dashboard/`.
2. WHEN a developer runs `npm run dev` in `dashboard/`, THE Dashboard SHALL run the Collect_Step and then serve on port 3001.
3. IF port 3001 is already in use, THEN `npm run dev` SHALL exit with an error naming the port conflict instead of choosing another port.
4. WHEN a developer runs `npm run build`, THE Dashboard SHALL run the Collect_Step and produce a static site in `dashboard/dist/` that includes all collected Run_Files and screenshots.
5. WHEN `dashboard/dist/` is served by any static file host, THE Dashboard SHALL display all screens and Runs without any backend service.
6. WHEN a developer runs `npm run preview`, THE Dashboard SHALL serve the built site on port 3001.
7. THE Dashboard SHALL NOT start, call or bundle the ghost engine.

### Requirement 2: Collecting runs

**User Story:** As a House Builder, I want a build step that gathers every run, so that the built site has all its data with no server.

#### Acceptance Criteria

1. WHEN the Collect_Step runs, THE Collect_Step SHALL find every file named `run.json` under `runs/`, including `runs/samples/`, at any folder depth.
2. WHEN the Collect_Step finds a Run_File, THE Collect_Step SHALL copy the Run_File's folder, including screenshots, into the Dashboard's public `runs/` folder with the same relative path.
3. WHEN the Collect_Step finishes, THE Collect_Step SHALL write a Run_Index listing, for each Run_File: its Run_Key, its relative folder path, whether it came from `runs/samples/` or `runs/`, and any validation errors.
4. IF a Run_File is invalid, THEN THE Collect_Step SHALL list it in the Run_Index with its errors, print a warning naming the file, and continue without failing the build.
5. IF two Run_Files have the same `runId`, THEN THE Collect_Step SHALL keep the first by path order, mark the later ones as Invalid_Runs with a "duplicate runId" error, and print a warning.
6. IF a Run_File cannot be parsed as JSON or has no string `runId`, THEN THE Collect_Step SHALL use its folder path, with `/` replaced by `--`, as its Run_Key.
7. WHEN the Collect_Step runs again, THE Collect_Step SHALL remove previously collected files first so deleted runs do not remain.
8. THE Collect_Step SHALL NOT modify any file under `runs/`.

### Requirement 3: Single data module

**User Story:** As a House Builder, I want all data loading in one module, so that a live run source can be added later without changing screens.

#### Acceptance Criteria

1. THE Data_Module SHALL be the only code in the Dashboard that fetches the Run_Index, Run_Files or derives screenshot URLs.
2. THE Data_Module SHALL define a Run_Source interface with operations to list runs, load one run by Run_Key, and resolve a screenshot path for a run.
3. THE Data_Module SHALL provide a static Run_Source that reads the files written by the Collect_Step, and SHALL select the Run_Source in one place.
4. WHEN a Run_File is loaded, THE Data_Module SHALL validate it and return either a typed Run with any warnings, or an Invalid_Run with a list of errors that each name the field path and the problem.
5. THE Data_Module SHALL load each Run_File at most once per page load and reuse the result.

### Requirement 4: Run validation

**User Story:** As a House Builder, I want invalid run files to show a clear error, so that one bad file never crashes the dashboard.

#### Acceptance Criteria

1. THE Data_Module SHALL treat a Run_File as invalid IF it is not valid JSON, `formatVersion` is not `1`, or any required contract field is missing or has the wrong type.
2. THE Data_Module SHALL accept exactly the `result` values `succeeded`, `gave_up` and `error`, with no aliases and no warning for any of them.
3. THE Data_Module SHALL accept exactly the finding `type` values `unlabeled_button`, `focus_trap`, `unannounced_error`, `slow_wait`, `misclick`, `cut_off_text`, `untranslated` and `dark_pattern`.
4. IF `result` or any finding `type` is any other value, THEN THE Data_Module SHALL treat the Run_File as invalid and name the field and the allowed values in the error.
5. IF a step's `focusBox` has a width or height of 0 or less, THEN THE Data_Module SHALL treat the step as having no focusBox.
6. IF a finding's `step` does not match any step's `n`, THEN THE Data_Module SHALL keep the finding and attach a warning naming the missing step.
7. IF a `screenshot` path is absolute, contains `..`, or contains a URL scheme, THEN THE Data_Module SHALL treat that screenshot as missing and attach a warning.
8. IF `ghost` is not exactly `listener`, `phantom` or `bebe`, THEN THE Data_Module SHALL treat the Run_File as invalid and name the field and the allowed values in the error.
9. WHEN the Dashboard displays an Invalid_Run, THE Dashboard SHALL show the file path and every validation error in plain words, and SHALL keep all other screens and Runs working.
10. WHEN a Run has warnings, THE Dashboard SHALL show the warnings on that Run's Ghost_Cam screen.
11. THE Dashboard SHALL render all text from Run_Files as plain text, never as HTML.
12. IF the Run_Index cannot be loaded, THEN THE Dashboard SHALL show an error screen explaining that no runs were collected and naming the `npm run dev` or `npm run build` command to run.

### Requirement 5: Run provenance

**User Story:** As a developer, I want every run to show when it was recorded, the site commit and how to reproduce it, so that I can trust and re-create what I see.

#### Acceptance Criteria

1. WHEN the Dashboard shows a Run on any run-specific screen, THE Dashboard SHALL show the `startedAt` time in the reader's local time zone, with the original ISO timestamp available as text.
2. WHEN the Dashboard shows a Run, THE Dashboard SHALL show `site.commit` and `site.url`.
3. WHEN the Dashboard shows a Run, THE Dashboard SHALL show the Reproduce_Command: `git checkout <site.commit>` followed by `npx haunt run --ghost <ghost> --mission <mission.id> --url <site.url>`.
4. THE Dashboard SHALL generate the Reproduce_Command in exactly one function, so the template can change when the engine's command line is final.
5. WHEN the user activates the copy control next to the Reproduce_Command, THE Dashboard SHALL copy the command to the clipboard and announce "Command copied" through a polite live region.

### Requirement 6: Shareable URLs

**User Story:** As someone writing the README or recording the video, I want every screen, run and step to have its own URL, so that I can link to exact moments.

#### Acceptance Criteria

1. THE Dashboard SHALL use hash-based URLs so deep links work on any static host without server rewrite rules.
2. THE Dashboard SHALL give each screen its own URL: `#/` (Home), `#/haunt/<siteKey>/map` (Haunted Map), `#/graveyard` (Graveyard), `#/run/<runKey>/step/<n>` (Ghost Cam), `#/seance` and `#/seance/<runKey>/<questionId>` (Séance), `#/exorcise` and `#/exorcise/<beforeRunKey>/<afterRunKey>` (Exorcise), `#/coverage` (Spec Coverage).
3. WHEN the user opens `#/run/<runKey>`, THE Dashboard SHALL show the Ghost_Cam at step 1 and replace the URL with `#/run/<runKey>/step/1`.
4. WHEN the Ghost_Cam moves to another step for any reason, THE Dashboard SHALL replace the URL with that step's URL without adding a browser history entry for each step during playback.
5. WHEN the user opens a step URL directly, THE Dashboard SHALL show exactly that step, paused.
6. IF a URL names a Run_Key that does not exist, THEN THE Dashboard SHALL show "No ghost by that name has walked here" with a link to Home.
7. IF a step URL names a step number that does not exist in the Run, THEN THE Dashboard SHALL show a message giving the valid range and a link to step 1.
8. WHEN the Graveyard is filtered by site or ghost, THE Dashboard SHALL keep the filter in the URL query (`?site=` and `?ghost=`).
9. WHEN the route changes, THE Dashboard SHALL update the document title to name the screen and run, and move focus to the new screen's main heading.

### Requirement 7: Home

**User Story:** As a visitor, I want a list of haunted sites with a quick way into the best moment, so that I understand Haunt in seconds.

#### Acceptance Criteria

1. THE Home screen SHALL show one Haunt per distinct `site.name`.
2. WHEN showing a Haunt, THE Home screen SHALL show each ghost that visited it with that ghost's character, name and result in words (for example "Bebe made it through" or "The Listener gave up").
3. WHEN showing a Haunt, THE Home screen SHALL show the total number of findings across its Runs and the date of its most recent Run.
4. WHEN showing a Haunt, THE Home screen SHALL link to its Haunted Map and to each of its Runs' Ghost_Cam.
5. THE Home screen SHALL show a "Start here" button that opens the Ghost_Cam at the step of a `focus_trap` finding in a Listener Run, choosing the most recent such Run.
6. IF no Listener Run has a `focus_trap` finding, THEN THE "Start here" button SHALL open the most recent Listener Run's first finding, or IF there are no Listener Runs, THE button SHALL be unavailable with a visible reason.
7. THE Home screen SHALL show a "Summon a live ghost" button that is marked unavailable with `aria-disabled="true"`, stays reachable by keyboard, does nothing when activated, and shows the visible text "Coming soon: live ghosts are not connected yet".
8. WHEN Invalid_Runs exist, THE Home screen SHALL list them in a "Restless files" section with each file path and a link to its errors.
9. WHEN no valid Runs exist, THE Home screen SHALL show an empty state that explains where run files go.

### Requirement 8: Haunted Map

**User Story:** As a developer, I want to see each page as a room with the places ghosts got stuck, so that I know which pages need attention.

#### Acceptance Criteria

1. THE Haunted Map SHALL show one Room per distinct `page` across the Haunt's Runs, ordered by first appearance in the earliest Run.
2. WHEN showing a Room, THE Haunted Map SHALL show each ghost that entered it, using the ghost's character and name.
3. WHEN showing a Room, THE Haunted Map SHALL show each Cold_Spot in that Room, labelled with the ghost, step number and wait time (for example "Bebe waited 1.2 s at step 2").
4. THE Haunted Map SHALL size each Cold_Spot by the step's `waitMs` using a scale that is non-decreasing in `waitMs`, with a minimum size of 24 by 24 CSS pixels and a fixed maximum.
5. WHEN the user activates a Cold_Spot, THE Dashboard SHALL open the Ghost_Cam at that Run and step.
6. WHEN the user selects one ghost as a filter, THE Haunted Map SHALL cover Rooms that ghost did not enter with fog and state "Not visited by <ghost>" in text.
7. THE Haunted Map SHALL expose Rooms and Cold_Spots as a structured list with headings, so screen-reader users get the same information as the visual layout.

### Requirement 9: Graveyard

**User Story:** As a developer, I want one tombstone per finding, so that I can scan every problem the ghosts found.

#### Acceptance Criteria

1. THE Graveyard SHALL show one Tombstone per finding across all Runs.
2. WHEN showing a Tombstone, THE Graveyard SHALL show the ghost's character and name, the finding type in plain words, the finding's title, its evidence, the step number and the site name.
3. THE Graveyard SHALL show each finding type in plain words: `unlabeled_button` → "Button with no name", `focus_trap` → "Keyboard trap", `unannounced_error` → "Error nobody announced", `slow_wait` → "Too long a wait", `misclick` → "Clicked the wrong thing", `cut_off_text` → "Text cut off", `untranslated` → "Text not translated", `dark_pattern` → "Tricky choice".
4. THE Dashboard SHALL define the plain-words labels in exactly one table, with one entry for each of the eight finding types, and SHALL use that table on every screen that names a finding type.
5. WHEN showing a Tombstone, THE Graveyard SHALL include a link to that finding's step in the Ghost_Cam, with an accessible name naming the ghost and step (for example "Watch The Listener at step 9").
6. THE Graveyard SHALL offer filters by site and by ghost.

### Requirement 10: Ghost Cam

**User Story:** As a viewer, I want to replay a run step by step with the screen on one side and what the ghost heard or thought on the other, so that I experience the barrier the ghost hit.

#### Acceptance Criteria

1. THE Ghost_Cam SHALL show the current step's screenshot on the left and the ghost's panel on the right, stacking vertically on narrow screens with the screenshot first.
2. WHEN the current step has a focusBox, THE Ghost_Cam SHALL draw a glowing outline at the focusBox position, scaled from screenshot pixels to the displayed image size.
3. IF the current step's screenshot is missing or fails to load, THEN THE Ghost_Cam SHALL show a grey Placeholder with the text "No screenshot for step <n>" at a 16:10 aspect ratio, and SHALL draw the focusBox over it scaled against a 1280 by 800 reference size.
4. WHEN the Run's ghost is The Listener, THE Ghost_Cam SHALL show the Spoken_Panel: a black panel showing the current step's `spoken` text and a simple waveform derived from that text.
5. WHEN the Run's ghost is not The Listener, THE Ghost_Cam SHALL show the Thought_Panel with the current step's `thought` text.
6. THE Ghost_Cam SHALL show the step number, page, action and wait time for the current step.
7. THE Ghost_Cam SHALL provide Play, Pause, Step forward and Step back controls, each operable by keyboard.
8. WHILE playing, THE Ghost_Cam SHALL advance one step every 1500 milliseconds and SHALL pause at the last step.
9. WHEN the user presses Step forward on the last step or Step back on step 1, THE Ghost_Cam SHALL stay on the current step and SHALL mark that control unavailable.
10. THE Ghost_Cam SHALL show a timeline with one mark per step, a distinct mark with a text label for each step with a finding, and the current step marked with `aria-current="step"`.
11. WHEN the user activates a timeline mark, THE Ghost_Cam SHALL move to that step and pause.
12. WHEN the current step has a finding, THE Ghost_Cam SHALL show the finding's plain-words type, title and evidence, using result-specific copy such as "The Listener got trapped here."
13. WHEN the current step is the last step of a `gave_up` Run, THE Ghost_Cam SHALL show "<Ghost> gave up here."
14. WHEN the current step changes, THE Ghost_Cam SHALL announce the step number and the spoken or thought text through a polite live region, and SHALL NOT move keyboard focus.
15. THE Ghost_Cam SHALL show the Run's mission goal, requirement, result and provenance (Requirement 5).

### Requirement 11: Approximate voice

**User Story:** As a sighted viewer, I want to optionally hear The Listener's spoken text, so that I get a feel for the experience, while being told this is not a real screen reader.

#### Acceptance Criteria

1. WHERE the Run's ghost is The Listener, THE Ghost_Cam SHALL show a toggle labelled "Read aloud (approximation)".
2. THE Ghost_Cam SHALL show, next to the toggle, the text "This uses your browser's built-in voice. It is an approximation, not real screen reader output."
3. THE Approximate_Voice SHALL be off when the Ghost_Cam opens.
4. WHILE the Approximate_Voice is on, WHEN the current step changes, THE Dashboard SHALL cancel any speech in progress and speak the new step's `spoken` text.
5. THE Approximate_Voice SHALL use only voices that report `localService: true`, so text is never sent to an outside speech service.
6. IF `speechSynthesis` is not available or no local voice exists, THEN THE toggle SHALL be unavailable with a visible reason.
7. WHEN the user turns the toggle off or leaves the Ghost_Cam, THE Dashboard SHALL cancel any speech in progress.

### Requirement 12: Séance

**User Story:** As a developer, I want to ask a ghost fixed questions about its run, so that I get a plain explanation grounded in the run data.

#### Acceptance Criteria

1. THE Séance screen SHALL let the user choose a Run and one of the four Séance_Questions.
2. WHEN a Run and question are chosen, THE Séance screen SHALL show an answer written in the ghost's first person and built only from the Run's fields.
3. THE Séance answers SHALL cite step numbers for every claim about a step, each citation linking to that step in the Ghost_Cam.
4. WHEN the question is "Why did you give up?" and the result is `gave_up`, THE answer SHALL name the last step and the findings at or before it; WHEN the result is `succeeded`, THE answer SHALL say the ghost did not give up and cite the last step; WHEN the result is `error`, THE answer SHALL say a technical error stopped the run at the last step.
5. WHEN the question is "Where did you get stuck?", THE answer SHALL list every Cold_Spot with its page and wait time, or say the ghost never got stuck when there are none.
6. WHEN the question is "What did you hear?", THE answer SHALL list each step's `spoken` text with its step number.
7. WHEN the question is "What would have helped?", THE answer SHALL give one suggestion per finding from a fixed table with one entry for each of the eight finding types.
8. THE Séance screen SHALL NOT call any AI model or outside service.
9. THE Séance answers SHALL cite only step numbers that exist in the Run or are referenced by a finding.

### Requirement 13: Exorcise

**User Story:** As a developer who fixed a problem, I want to compare a before run and an after run, so that I can see which findings are gone.

#### Acceptance Criteria

1. THE Exorcise screen SHALL let the user pick a before Run and an after Run, offering only Runs with the same `mission.id` as the before Run for the after choice.
2. THE Exorcise screen SHALL show the before and after Runs side by side, each with its result and provenance.
3. THE Exorcise screen SHALL match findings between the two Runs by Finding_Match_Key.
4. WHEN a before finding has no match in the after Run and the after Run visited the finding's page, THE Exorcise screen SHALL mark it "Exorcised".
5. WHEN a before finding has no match in the after Run and the after Run never visited the finding's page, THE Exorcise screen SHALL mark it "Not reached" and explain that the ghost never got that far, rather than marking it exorcised.
6. WHEN a before finding has a match in the after Run, THE Exorcise screen SHALL mark it "Still haunting".
7. WHEN an after finding has no match in the before Run, THE Exorcise screen SHALL mark it "New haunting".
8. WHEN the two Runs use different ghosts, THE Exorcise screen SHALL show a warning that a different ghost may not look for the same problems.
9. IF the URL names two Runs with different `mission.id` values, THEN THE Exorcise screen SHALL show an error explaining they are different missions.
10. THE Exorcise screen SHALL show each status with a text label and an icon, not color alone.

### Requirement 14: Spec Coverage

**User Story:** As a developer, I want each mission requirement listed with which ghosts completed it, so that I can see which requirements real users can't reach.

#### Acceptance Criteria

1. THE Spec Coverage screen SHALL list one entry per distinct `mission.id`, showing its `mission.requirement` text and `mission.goal`.
2. IF Runs with the same `mission.id` have different `mission.requirement` text, THEN THE Spec Coverage screen SHALL show the text from the most recent Run and a note that the text changed.
3. WHEN showing a mission, THE Spec Coverage screen SHALL show, per ghost, whether its most recent Run completed (`succeeded`), gave up (`gave_up`) or errored (`error`), in words and with an icon.
4. WHEN showing a ghost's status, THE Spec Coverage screen SHALL link to that ghost's Runs of the mission.
5. WHEN a ghost has no Run for a mission, THE Spec Coverage screen SHALL show "Not yet haunted".

### Requirement 15: Ghost characters

**User Story:** As a viewer, I want each ghost to look distinct and respectful, so that I can tell them apart without relying on color.

#### Acceptance Criteria

1. THE Dashboard SHALL give The Listener, The Phantom and Bebe each an original SVG character, an accent color and an icon, all created for this project.
2. THE Dashboard SHALL always show a ghost's name in text, or as the accessible name, wherever its character or icon appears.
3. THE ghost characters SHALL differ in silhouette and icon, so they can be told apart in greyscale.
4. THE Dashboard SHALL describe each ghost respectfully, as a person with real needs, matching the persona descriptions in the product overview.
5. THE Dashboard SHALL NOT use copyrighted or trademarked characters or third-party artwork.

### Requirement 16: Visual design

**User Story:** As a Costume Contest judge, I want a polished candlelit haunted-house look where every spooky element has a job, so that the theme supports the content.

#### Acceptance Criteria

1. THE Dashboard SHALL use a dark charcoal background, candle-amber for primary actions, pale spectral blue-white for ghost elements, bone color for Tombstones, and deep red only for failure states.
2. THE Dashboard SHALL define all colors as design tokens in one file.
3. THE Dashboard SHALL use a characterful serif font for headings and a readable sans-serif font for body text, both bundled with the project under open font licenses.
4. THE Dashboard SHALL give each decorative spooky element a documented meaning, listed in the design document.
5. THE Dashboard SHALL follow `.kiro/steering/dashboard-design.md`, which holds the design rules (colors and contrast ratios, fonts, ghost characters, spooky element meanings, motion limits). Where it conflicts with this document, the steering file takes precedence.
6. THE Dashboard copy SHALL be playful but clear, stating plainly what happened (for example "Bebe gave up here.").

### Requirement 17: Motion

**User Story:** As a viewer sensitive to motion, I want ambient animation to stop when I ask for reduced motion, and never to flash or startle, so that the dashboard is comfortable.

#### Acceptance Criteria

1. THE Dashboard SHALL show slow drifting fog, candle flicker on primary actions, and gently floating ghost characters.
2. WHILE Reduced_Motion is set, THE Dashboard SHALL show all ambient animations as still images, and SHALL NOT animate the waveform.
3. THE Dashboard SHALL NOT flash more than three times in any one-second period, and candle flicker SHALL vary brightness by no more than 10%.
4. THE Dashboard SHALL NOT include jump scares, sudden loud sounds, or sudden full-screen visual changes.
5. THE Dashboard SHALL NOT play any sound unless the user turns on the Approximate_Voice.

### Requirement 18: Accessibility of the dashboard

**User Story:** As a dashboard user who relies on a keyboard or screen reader, I want the dashboard itself to be accessible, so that I can use Haunt on equal terms.

#### Acceptance Criteria

1. THE Dashboard SHALL make every interactive element reachable and operable by keyboard, in an order that follows the visual reading order, with no keyboard traps.
2. THE Dashboard SHALL show a visible focus indicator with at least 3:1 contrast against adjacent colors on every focusable element.
3. THE Dashboard SHALL provide a "Skip to main content" link as the first focusable element.
4. THE Dashboard SHALL give every interactive element and meaningful image an accessible name, and mark purely decorative elements as hidden from assistive technology.
5. THE Dashboard SHALL meet WCAG 2.1 AA contrast for every text and background pair defined in the design tokens: at least 4.5:1 for normal text, 3:1 for large text and for non-text UI elements.
6. THE Dashboard SHALL NOT use deep red as a text color on the charcoal background.
7. THE Dashboard SHALL use landmarks (header, nav, main, footer), exactly one h1 per screen, and a logical heading order.
8. THE Dashboard SHALL remain usable at 200% browser zoom and at a 320 CSS pixel viewport width without horizontal scrolling, except inside the screenshot area.
9. THE Dashboard SHALL convey every status (result, finding, exorcise status, coverage) with text and an icon or shape, never by color alone.
10. THE Dashboard SHALL report zero violations in automated axe-core checks for every screen with the sample data.

### Requirement 19: No outside services

**User Story:** As a privacy-minded user, I want the dashboard to make no outside calls, so that it works offline and leaks nothing.

#### Acceptance Criteria

1. THE Dashboard SHALL NOT make network requests to any origin other than its own, including for fonts, analytics, icons, speech or error reporting.
2. THE Dashboard SHALL bundle all fonts, images and icons locally.
3. THE Dashboard SHALL set a Content-Security-Policy meta tag that restricts scripts, styles, fonts, images and connections to its own origin.
