# Requirements Document

## Introduction

The Haunt dashboard is a static React + Vite + TypeScript site in `dashboard/` that shows where Haunt's ghost personas got stuck while trying to complete missions on a website. It reads run files written in the format defined by `contract/example-run.json` and `contract/run-format.md`, from `runs/` and `runs/samples/`. The dashboard never runs ghosts itself. It runs on port 3001 (the demo site uses 3000).

The dashboard has seven screens: Home, Haunted Map, Graveyard, Ghost Cam, Séance, Exorcise and Spec Coverage. It is built for the Kiroween 2026 Costume Contest category, so it has a candlelit haunted-house look where every spooky element communicates something. The dashboard itself must be fully accessible.

The screens keep their spooky names, but a first-time user could not tell what each screen does from its name alone. Requirement 20 makes every screen's job obvious in plain words: a short description under each navigation label, a "How Haunt works" strip and a "What's in here" guide on Home, a Guided_Path with a "Next stop" link at the bottom of each screen, and one plain sentence at the top of every screen.

Test data is the two sample runs in `runs/samples/`: `listener-gave-up/run.json` (The Listener, result `gave_up`, 9 steps, findings at steps 7 and 9) and `bebe-succeeded/run.json` (Bebe, result `succeeded`, 6 steps, finding at step 3).

The allowed `ghost`, `result` and finding `type` values are defined in `contract/run-format.md`. The dashboard uses exactly those values.

Verification process: after each change, the House Builder runs `npm run build` and the unit tests (`npm test`) in `dashboard/`. The slower Playwright end-to-end tests (`npm run test:e2e`) run once at the end of a batch of changes. Tests are never weakened or deleted to make them pass.

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
- **Spoken_Panel**: The Ghost_Cam's right-hand panel for The Listener, showing a Transcript of spoken text on black with a waveform.
- **Thought_Panel**: The Ghost_Cam's right-hand panel for The Phantom and Bebe, showing a Transcript of thought text.
- **Transcript**: The running list of lines in the Spoken_Panel or Thought_Panel: one line per step from step 1 up to and including the current step, in step order, with the current step's line last.
- **Current_Line**: The Transcript line for the current step.
- **Earlier_Line**: Any Transcript line other than the Current_Line.
- **Run_Summary**: The Ghost_Cam's header showing the Run's ghost, mission goal, requirement and result, limited to two lines of text (Requirement 10, criterion 29).
- **Stuck_Notice**: The single compact notice on the Ghost_Cam that tells the viewer the ghost got stuck at the current step. It replaces the separate "got trapped here" and "gave up here" notices (Requirement 10, criteria 12 and 13).
- **Control_Row**: The single row on the Ghost_Cam, directly under the screenshot and the Spoken_Panel or Thought_Panel, that holds the step information, the Play, Pause, Step forward and Step back controls, and (for The Listener) the Read aloud toggle.
- **Transcript_Viewport**: The fixed-height, internally scrolling area of the Spoken_Panel or Thought_Panel that contains the Transcript.
- **Ghost_Cam_Viewport_Set**: The three viewport sizes 1536 by 864, 1440 by 900 and 1920 by 1080 CSS pixels, each at 100% zoom.
- **Hero**: The top section of the Home screen.
- **Tagline**: The text "Haunt your app before your users do."
- **Hero_Ghosts**: The group of The Listener, The Phantom and Bebe characters, each with its name, shown on the right side of the Hero.
- **Top_Navigation**: The header navigation bar shown on every Dashboard screen.
- **Provenance_Panel**: The panel titled "Where this run came from", showing `startedAt`, `site.commit`, `site.url` and the Reproduce_Command.
- **Nav_Fog**: The fog band drawn behind the top navigation.
- **Outcome_Line**: The plain-words sentence on a Home haunt card that says what happened to one ghost in its most recent Run of that Haunt.
- **Property_Test**: A fast-check test whose `describe` name starts with `Feature: <spec name>, Property`, for any spec in `.kiro/specs/` (for example `Feature: haunt-dashboard, Property 5` or `Feature: exorcise-different-ghost-fix, Property 1`).
- **Approximate_Voice**: Optional playback of spoken text through the browser's built-in `speechSynthesis` API.
- **Séance_Question**: One of four fixed questions: "Why did you give up?", "Where did you get stuck?", "What did you hear?", "What would have helped?".
- **Finding_Match_Key**: The pair (finding `type`, `page` of the finding's step) used to match findings between two Runs.
- **Reproduce_Command**: A shell command, generated from Run fields, that re-creates a Run.
- **Placeholder**: A grey box drawn in place of a screenshot that is missing or cannot be loaded.
- **Reduced_Motion**: The user's `prefers-reduced-motion: reduce` setting.
- **Screen_Description**: The short plain-words description of what a screen is for: Haunted Map "Where ghosts got stuck", Graveyard "Every problem found", Ghost Cam "Replay a ghost's visit", Séance "Ask a ghost why", Exorcise "Before and after a fix", Spec Coverage "Which requirements people can reach". Home has no Screen_Description.
- **Screen_Intro**: The one plain sentence directly after a screen's h1 that says what the screen shows.
- **Screen_Icon**: The original SVG icon for one screen, used next to its name on Home and in the Next_Stop_Link.
- **How_It_Works_Strip**: The Home section headed "How Haunt works" with three numbered plain steps.
- **Screen_Guide**: The Home section headed "What's in here", with one card per screen other than Home.
- **Guided_Path**: The fixed order in which the screens are visited as a tour: Home, Ghost Cam, Graveyard, Haunted Map, Exorcise, Spec Coverage, Séance, then back to Home.
- **Next_Stop_Link**: The link at the bottom of a screen on the Guided_Path that opens the next screen on the Guided_Path.
- **Screen_Destination**: The URL a screen's Top_Navigation link opens. The Haunted Map's is the most recently visited Haunt's map; the Ghost Cam's is the "Start here" step, or step 1 of the first Run when there is no "Start here" step. Both are unavailable when there are no Runs.

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
8. WHEN a developer runs `npm run test:properties` in `dashboard/`, THE Dashboard's test runner SHALL run every Property_Test in a test file under `dashboard/` once and then exit without entering watch mode. This includes Property_Tests for every spec name, such as `haunt-dashboard` and `exorcise-different-ghost-fix`, and any Property_Test added later for a new spec without changing the command. Property_Tests in other folders, such as `demo-site/`, are out of scope for this command.
9. WHEN a developer runs `npm run test:properties` in `dashboard/`, THE Dashboard's test runner SHALL NOT execute any test whose `describe` name does not start with `Feature: <spec name>, Property`, and SHALL NOT run the Playwright end-to-end tests. Every executed test is therefore a Property_Test.
10. IF one or more Property_Tests fail during `npm run test:properties`, THEN THE Dashboard's test runner SHALL exit with a non-zero exit code and name each failing Property_Test in its output. If every Property_Test passes, it SHALL exit with exit code 0.
11. IF `npm run test:properties` finds zero Property_Tests to run, THEN THE Dashboard's test runner SHALL exit with a non-zero exit code and an error indicating that no Property_Tests ran, instead of reporting success.

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
6. THE Provenance_Panel SHALL display the Reproduce_Command with line breaks only at newline characters in the command text, so that no word, flag, quoted value or URL is split across lines at any viewport width from 320 to 2560 CSS pixels and any zoom level from 100% to 400%.
7. WHEN the rendered Reproduce_Command is wider than its box, THE Provenance_Panel SHALL let the command scroll horizontally inside the box, and the page SHALL have no horizontal scrolling (document width no greater than the viewport width) at any viewport width from 320 to 2560 CSS pixels and any zoom level from 100% to 400%.
8. WHEN the Reproduce_Command box can scroll, THE Provenance_Panel SHALL include the box in the Tab order, give the box an accessible name that identifies it as the reproduce command, show the Dashboard's focus ring on the box while it has focus, and scroll the box left and right with the Left and Right arrow keys while it has focus, so that both the first and last characters of the command can be brought into view.
9. WHEN the user copies the Reproduce_Command, THE Dashboard SHALL copy exactly the string returned by the function in criterion 4, character for character, with no line breaks, spaces or other characters added or removed, regardless of the box's width, scroll position or zoom level.
10. IF the clipboard write fails or the browser does not allow clipboard access, THEN THE Dashboard SHALL announce through the polite live region that the command could not be copied, SHALL NOT announce "Command copied", and SHALL keep the Reproduce_Command visible and the copy control enabled so the user can retry or select the text by hand.
11. WHILE the Reproduce_Command fits inside its box without scrolling, THE Provenance_Panel SHALL leave the box out of the Tab order, and SHALL re-check whether the box can scroll when the viewport width or zoom level changes.

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
2. WHEN showing a Haunt, THE Home screen SHALL show one entry per distinct `ghost` value among the Haunt's Runs, each with that ghost's character, name, a result badge and an Outcome_Line (criteria 14 to 19), where the badge and the Outcome_Line both come from that ghost's most recent Run in the Haunt, meaning the Run with the latest `startedAt`.
3. WHEN showing a Haunt, THE Home screen SHALL show the total number of findings across its Runs and the date of its most recent Run.
4. WHEN showing a Haunt, THE Home screen SHALL link to its Haunted Map and to each of its Runs' Ghost_Cam.
5. THE Home screen SHALL show a "Start here" button that opens the Ghost_Cam at the step of a `focus_trap` finding in a Listener Run, choosing the most recent such Run.
6. IF no Listener Run has a `focus_trap` finding, THEN THE "Start here" button SHALL open the most recent Listener Run's first finding, or IF there are no Listener Runs, THE button SHALL be unavailable with a visible reason.
7. THE Home screen SHALL show a "Summon a live ghost" button that is marked unavailable with `aria-disabled="true"`, stays reachable by keyboard, does nothing when activated, and shows the visible text "Coming soon: live ghosts are not connected yet".
8. WHEN Invalid_Runs exist, THE Home screen SHALL list them in a "Restless files" section with each file path and a link to its errors.
9. WHEN no valid Runs exist, THE Home screen SHALL show an empty state that explains where run files go.
10. THE Home screen SHALL show the Haunt logo only in the Top_Navigation, and THE Hero SHALL NOT contain the Haunt logo or any other visible heading that reads only "Haunt".
11. THE Home screen SHALL have exactly one h1, the Hero's large heading, whose text is the Tagline, and the haunt card headings SHALL remain h2.
12. WHILE the viewport is 1280 CSS pixels wide or wider, THE Home screen SHALL use the width to the right of the haunt cards for content, either by placing haunt cards in two or more columns or by showing a side panel with run information, so no empty column wider than one haunt card remains beside the cards.
13. WHILE the viewport is narrower than 1280 CSS pixels, THE Home screen SHALL keep the haunt cards in reading order and meet the zoom and 320 CSS pixel rules in Requirement 18.
14. WHEN showing an Outcome_Line for a Run whose result is `succeeded` and that has at least one step, THE Home screen SHALL show the text "Made it through in N steps", where N is the number of entries in the Run's steps array, using "step" instead of "steps" when N is 1 (for example "Made it through in 6 steps"), whatever findings the Run has.
15. WHEN showing an Outcome_Line for a Run whose result is `gave_up` and at least one finding has a `step` equal to the `n` of the Run's last step (the step with the highest `n`), THE Home screen SHALL build the Outcome_Line from the first such finding in the Run's findings array order, using that finding type's label from the single finding-label table (Requirement 9.4) and N as the last step's `n`, as follows: for `focus_trap`, "Trapped by a " followed by the label with its first letter lowercased, then " at step N" (giving "Trapped by a keyboard trap at step 9"); for each of the other seven types, "Stuck at step N: " followed by the label exactly as written in the table (for example "Stuck at step 5: Text cut off").
16. WHEN showing an Outcome_Line for a Run whose result is `gave_up`, that has at least one step, and that has no finding whose `step` equals the `n` of its last step, THE Home screen SHALL show the text "Gave up at step N", where N is the `n` of the Run's last step (for example "Gave up at step 4").
17. WHEN showing an Outcome_Line for a Run whose result is `error` and that has at least one step, THE Home screen SHALL show the text "Stopped by a technical error at step N", where N is the `n` of the Run's last step (for example "Stopped by a technical error at step 3"), whatever findings the Run has.
18. THE Home screen SHALL show each Outcome_Line as visible text that is not identical to the text of the result badge beside it and that, except under criterion 19, contains the step count or step number defined in criteria 14 to 17.
19. IF the Run's steps array is empty, THEN THE Home screen SHALL show the Outcome_Line "No steps were recorded" for any result, in place of the text from criteria 14 to 17.
20. THE Hero SHALL show the Tagline as its large heading, and WHEN the Tagline wraps, THE Hero SHALL balance its lines so they are of similar length and no single word is left alone on the last line.
21. THE Hero SHALL show the Hero_Ghosts on the right side of the Hero, with The Listener, The Phantom and Bebe each shown as its SVG character (Requirement 15) together with its name as visible text.
22. THE Hero SHALL describe each ghost in Hero_Ghosts respectfully, as a person with real needs and matching the persona descriptions in the product overview: The Listener uses a screen reader's view and the keyboard, The Phantom browses on slow 3G and an old phone, and Bebe uses 200% zoom, reads Punjabi or Hindi, and is wary of tricky wording.
23. THE Hero_Ghosts SHALL float gently with a vertical movement of no more than 12 CSS pixels.
24. WHILE Reduced_Motion is set, THE Hero_Ghosts SHALL be shown without any animation.
25. WHILE the viewport is narrower than 900 CSS pixels, THE Hero SHALL place the Hero_Ghosts below the Tagline in reading order, and THE Hero SHALL meet the zoom and 320 CSS pixel rules in Requirement 18.

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
3. IF the current step's screenshot is missing or fails to load, THEN THE Ghost_Cam SHALL show a grey Placeholder at a 16:10 aspect ratio with the text "No screenshot for step <n>" in a label strip directly under the grey box, and SHALL draw the focusBox over the grey box scaled against a 1280 by 800 reference size, so that the label and the focusBox outline never overlap.
4. WHEN the Run's ghost is The Listener, THE Ghost_Cam SHALL show the Spoken_Panel: a black panel showing a Transcript of the `spoken` text of every step from step 1 up to and including the current step, and a simple waveform derived from the Current_Line's text that is shown still, without animation, while Reduced_Motion is set (Requirement 17.2).
5. WHEN the Run's ghost is The Phantom or Bebe, THE Ghost_Cam SHALL show the Thought_Panel with a Transcript of the `thought` text of every step from step 1 up to and including the current step.
6. THE Ghost_Cam SHALL show the step number, page, action and wait time for the current step.
7. THE Ghost_Cam SHALL provide Play, Pause, Step forward and Step back controls, each operable by keyboard.
8. WHILE playing, THE Ghost_Cam SHALL advance one step every 1500 milliseconds and SHALL pause at the last step.
9. WHEN the user presses Step forward on the last step or Step back on step 1, THE Ghost_Cam SHALL stay on the current step and SHALL mark that control unavailable.
10. THE Ghost_Cam SHALL show a timeline with one mark per step, a distinct mark with a text label for each step with a finding, and the current step marked with `aria-current="step"`.
11. WHEN the user activates a timeline mark, THE Ghost_Cam SHALL move to that step and pause.
12. WHEN the current step has a finding, THE Ghost_Cam SHALL show the finding's plain-words type, title and evidence inside the Stuck_Notice, using result-specific copy such as "The Listener got trapped here."
13. WHEN the current step is the last step of a `gave_up` Run and has no finding, THE Ghost_Cam SHALL show "<Ghost> gave up here." inside the Stuck_Notice.
14. WHEN the current step changes, THE Ghost_Cam SHALL announce the step number and the spoken or thought text through a polite live region, and SHALL NOT move keyboard focus.
15. THE Ghost_Cam SHALL show the Run_Summary (mission goal, requirement and result) and the Provenance_Panel (Requirement 5), where the Provenance_Panel is a disclosure that is collapsed when the Ghost_Cam opens and shows its heading "Where this run came from" in one row while collapsed.
16. THE Transcript SHALL contain exactly one line per step from step 1 to the current step, in ascending step order, with the Current_Line last, and SHALL keep repeated texts (for example several "Button" lines) as separate lines.
17. THE Transcript SHALL show each line's step number in text next to the line.
18. THE Transcript SHALL highlight the Current_Line with a visible marker or outline in addition to any color change, and SHALL mark the Current_Line as current for assistive technology.
19. THE Transcript SHALL show Earlier_Lines progressively dimmer the further they are from the Current_Line, so that no line has higher contrast than any line after it and the Current_Line has the highest contrast, while every Transcript line keeps at least 4.5:1 contrast against the panel background (Requirement 18.5).
20. WHEN the current step changes, THE Transcript SHALL show the Current_Line fully visible at the bottom of the Transcript_Viewport, scrolling inside the Transcript_Viewport when the lines exceed its height, without scrolling the page and without moving keyboard focus. THE Transcript SHALL keep the Current_Line at the bottom when the Transcript_Viewport or its lines change size (for example when fonts load or the window is resized), until the user scrolls away from the bottom. WHILE the viewport is any size in the Ghost_Cam_Viewport_Set, the Transcript_Viewport SHALL be tall enough to show at least six single-line Transcript lines.
21. WHEN the Transcript's lines exceed the panel height, THE Transcript SHALL be reachable with the Tab key, have an accessible name that identifies it as the spoken or thought transcript, and scroll with the Up Arrow and Down Arrow keys so every earlier line can be brought into view.
22. WHEN the user moves to a different step by Step back, Step forward, a timeline mark or playback, THE Transcript SHALL show only the lines from step 1 up to and including the new current step.
23. WHEN the current step changes, THE Ghost_Cam SHALL keep the live-region announcement of criterion 14 limited to the new step, without re-announcing Earlier_Lines.
24. WHILE the viewport is any size in the Ghost_Cam_Viewport_Set, THE Ghost_Cam SHALL fit the Top_Navigation with its Screen_Descriptions (Requirement 20), the Run_Summary, the Screen_Intro, the screenshot, the Spoken_Panel or Thought_Panel, the Stuck_Notice, the Control_Row and the timeline within the viewport, so that no vertical page scrolling is needed to reach any of them, for both sample Runs and at every step of each. The footer, the collapsed Provenance_Panel and the Next_Stop_Link MAY sit below the fold. The screenshot and the Spoken_Panel or Thought_Panel SHALL each be at least 380 CSS pixels tall and SHALL have the same height; the screenshot SHALL fill its column at its natural aspect ratio, leaving no empty gap between it and the panel beyond the grid gap; and the waveform SHALL stay inside the Spoken_Panel.
25. THE Ghost_Cam SHALL place the Provenance_Panel below the timeline in both visual order and reading order.
28. THE Spoken_Panel or Thought_Panel SHALL give the Transcript_Viewport a fixed height that does not change when the current step changes, when the number of Transcript lines changes, or when the Stuck_Notice appears or disappears.
29. THE Run_Summary SHALL show the ghost, mission goal, requirement and result in no more than two lines of text at every viewport size in the Ghost_Cam_Viewport_Set, truncating a line that is too long with an ellipsis and making the full text available through an accessible name or description. The Ghost_Cam's Screen_Intro (Requirement 20, criterion 13) sits between the two Run_Summary lines, does not count toward this limit, and is never truncated.
30. THE Ghost_Cam SHALL show at most one Stuck_Notice at a time, and WHEN the current step has a finding and is also the last step of a `gave_up` Run, THE Stuck_Notice SHALL combine both messages (for example "The Listener got trapped here and gave up.") instead of showing two notices.
31. THE Stuck_Notice SHALL occupy no more than 3 lines of text and SHALL keep its place in the layout so that its appearing or disappearing does not move the screenshot, the panel, the Control_Row or the timeline.
32. THE Ghost_Cam SHALL place the Control_Row directly under the screenshot and the Spoken_Panel or Thought_Panel, and the timeline directly below the Control_Row.
33. THE Control_Row SHALL show the step number, page, action and wait time, the Play, Pause, Step forward and Step back controls, and, WHERE the Run's ghost is The Listener, the "Read aloud (approximation)" toggle (Requirement 11), all on one row while the viewport is 900 CSS pixels wide or wider.
34. WHILE the viewport is narrower than 900 CSS pixels or zoomed to 200%, THE Control_Row SHALL be allowed to wrap onto more than one row, and Requirement 10, criterion 26 applies instead of criteria 24 and 33.
26. WHILE the viewport is narrower than 900 CSS pixels or zoomed to 200%, THE Ghost_Cam SHALL allow vertical page scrolling, keep the order Run_Summary, screenshot, panel, Stuck_Notice, Control_Row, timeline, Provenance_Panel, and SHALL NOT require horizontal page scrolling at widths down to 320 CSS pixels (Requirement 18).
35. WHEN the current step is the last step of a Run whose result is `error` and has no finding, THE Ghost_Cam SHALL show "This run stopped because of an error, so its findings may be incomplete." inside the Stuck_Notice, in the amber warning style (an amber border and a warning icon with the text) and not in the failure red.
27. IF a step's `spoken` text (for The Listener) or `thought` text (for The Phantom or Bebe) is missing or empty, THEN THE Transcript SHALL still show a line for that step, with its step number, whose text states that nothing was spoken or thought at that step, and that line SHALL count toward the one-line-per-step rule of criterion 16.

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
7. THE Nav_Fog SHALL span the full viewport width on every Dashboard screen, with its left edge at the left edge of the viewport and its right edge at the right edge of the viewport (excluding any vertical scrollbar), each within 1 CSS pixel, at viewport widths of 320, 768, 1280, 1920 and 2560 CSS pixels and at 200% browser zoom.
8. THE Nav_Fog SHALL span the full viewport width without causing horizontal page scrolling: at each viewport width and zoom level listed in criterion 7, the page's scrollable width SHALL NOT exceed the viewport width (Requirement 18.8).
9. WHEN the viewport width or browser zoom level changes, THE Nav_Fog SHALL meet criteria 7 and 8 at the new size without a page reload.
10. THE Nav_Fog SHALL NOT block pointer or keyboard access to any navigation item, and every navigation item's text SHALL keep at least 4.5:1 contrast against the Nav_Fog behind it (Requirement 18.5).

### Requirement 17: Motion

**User Story:** As a viewer sensitive to motion, I want ambient animation to stop when I ask for reduced motion, and never to flash or startle, so that the dashboard is comfortable.

#### Acceptance Criteria

1. THE Dashboard SHALL show slow drifting fog, candle flicker on primary actions, and gently floating ghost characters.
2. WHILE Reduced_Motion is set, THE Dashboard SHALL show all ambient animations, including the Hero_Ghosts, as still images, and SHALL NOT animate the waveform.
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

### Requirement 20: Plain-words wayfinding

**User Story:** As a first-time visitor, I want every screen to say in plain words what it does and where to go next, so that the spooky names make sense without guessing.

#### Acceptance Criteria

1. THE Top_Navigation SHALL show, directly under each screen's name, that screen's Screen_Description as visible text: Haunted Map "Where ghosts got stuck", Graveyard "Every problem found", Ghost Cam "Replay a ghost's visit", Séance "Ask a ghost why", Exorcise "Before and after a fix", Spec Coverage "Which requirements people can reach". The spooky names stay unchanged.
2. THE Top_Navigation SHALL show each Screen_Description at all times, as part of the link's clickable area, and SHALL NOT use a tooltip, a `title` attribute, or hover or focus to reveal it.
3. THE Top_Navigation SHALL give each link an accessible name made of all its visible text, starting with the screen's name and followed by its Screen_Description (for example "Ghost Cam Replay a ghost's visit"), so the accessible name contains the visible label (WCAG 2.5.3).
4. THE Top_Navigation SHALL keep every Screen_Description fully visible, without truncation or clipping, at 200% browser zoom and at viewport widths down to 320 CSS pixels, with at least 4.5:1 contrast against the Nav_Fog behind it (Requirement 16.10) and without horizontal page scrolling (Requirement 18.8).
5. WHILE the viewport is narrower than 900 CSS pixels, THE Top_Navigation SHALL keep showing every Screen_Description under its screen's name, and SHALL NOT hide the descriptions or move them behind a collapsed menu.
6. THE Dashboard SHALL define each screen's name, Screen_Description, Screen_Icon and place on the Guided_Path in exactly one table, and SHALL use that table for the Top_Navigation, the Screen_Guide and the Next_Stop_Links.
7. THE Home screen SHALL show the How_It_Works_Strip: an h2 "How Haunt works" followed by an ordered list of exactly three steps, in this order: "A ghost tries a real task on your site", "It records everything it sees and hears", "You see exactly where it got stuck".
8. THE Home screen SHALL show the Screen_Guide: an h2 "What's in here" followed by one card per screen other than Home, in Top_Navigation order. Each card SHALL show the screen's Screen_Icon, the screen's name as an h3, its Screen_Description, and a link styled as a button with the text "Open <screen name>" that opens the screen's Screen_Destination.
9. IF a screen's Screen_Destination is unavailable because there are no Runs, THEN its Screen_Guide card SHALL show visible text explaining that the screen opens once a ghost has walked, in place of the link.
10. THE Dashboard SHALL show a Next_Stop_Link as the last content in the main landmark of every screen on the Guided_Path. The Next_Stop_Link SHALL have the visible text "Next stop" and the next screen's name, SHALL show the next screen's Screen_Icon and Screen_Description, and SHALL have an accessible name made of all its visible text, starting with "Next stop: <screen name>".
11. THE Next_Stop_Link SHALL follow the Guided_Path: Home leads to Ghost Cam, Ghost Cam to Graveyard, Graveyard to Haunted Map, Haunted Map to Exorcise, Exorcise to Spec Coverage, Spec Coverage to Séance, and Séance back to Home. Each Next_Stop_Link SHALL open the next screen's Screen_Destination, and IF that Screen_Destination is unavailable, THEN the Next_Stop_Link SHALL lead to the first later screen on the Guided_Path that is available.
12. THE "Start here" button SHALL begin the Guided_Path by opening the Ghost_Cam at the "Start here" step (Requirement 7.5, 7.6), which is The Listener's step 9 with the sample data. WHEN "Start here" is available, THE Home screen SHALL show visible text next to it that says which ghost and step it opens and that the "Next stop" link at the bottom of each screen continues the tour.
13. THE Home, Haunted Map, Graveyard, Ghost_Cam, Séance, Exorcise and Spec Coverage screens SHALL each show a Screen_Intro: exactly one plain sentence that says what the screen shows, placed directly after the screen's h1 in DOM order. Further explanation, such as a legend, MAY follow in a separate paragraph.
14. THE Ghost_Cam's Screen_Intro SHALL name the ghost and say whether the panel shows what it heard (The Listener) or what it was thinking (The Phantom and Bebe), and SHALL fit on one line at every viewport size in the Ghost_Cam_Viewport_Set while Requirement 10.24 still holds.
15. THE Screen_Icons SHALL be original inline SVGs drawn for this project, hidden from assistive technology, and always shown next to the screen's name in text (Requirement 15.5, 18.4).
