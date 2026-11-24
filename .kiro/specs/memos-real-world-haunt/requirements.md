# Requirements Document

## Introduction

This feature sends The Listener into a second, real site: Memos, an open-source note-taking app that the user runs locally at `http://localhost:5230`. Lantern Bills is a demo site that Haunt built. Memos is code that Haunt did not write, so a finding on Memos shows that the detectors work on real software.

The Listener signs in with a local throwaway account, writes a short note in the editor and saves it. Expected behavior is written first as a short EARS requirement in `memos-behavior.md` in this spec directory, and the mission is tied to that requirement. The run is expected to find a keyboard problem that the existing `focus_trap` detector cannot see today: the Memos editor is a `div` with `role="textbox"`, and Tab and Shift+Tab do not move focus out of it. Only pressing Escape twice leaves the editor, and nothing is announced.

The feature has five parts:

1. A Memos site entry and a `write-note` mission.
2. A generalised `focus_trap` detector that also catches focus that cannot leave a single element.
3. A new finding type, `unlabeled_field`, in the contract, the engine and the dashboard, with its own detector.
4. A dashboard view that shows Memos as a separate "real-world haunt" site.
5. Unit tests and property tests, followed by one scripted-mind run and one AI-mind run of The Listener on Memos, written to `runs/memos/`.

Out of scope: any change to `demo-site/` or `demo-site-exorcised/`, any change to the Lantern Bills findings, and any change to the Lantern Bills end-to-end tests. Phantom and Bebe are unchanged and do not run on Memos.

## Glossary

- **Haunt_Engine**: The TypeScript engine in `engine/` that drives ghost personas and writes run files.
- **Dashboard**: The React application in `dashboard/` that reads run files and shows the results.
- **Listener**: The ghost persona that uses only a screen reader's view and the keyboard.
- **Memos**: The open-source note-taking application, run locally by the user at `http://localhost:5230`. It is the second site that Haunt visits.
- **Lantern_Bills**: The demo site that Haunt built, tested through `demo-site/` and `demo-site-exorcised/`.
- **Memos_Site**: The entry for Memos in the engine's site configuration (`engine/haunt.config.json`).
- **Throwaway_Account**: The local Memos account with username `ghost-test` and password `HauntTest123!`, created only for Haunt runs on the user's own machine.
- **Write_Note_Mission**: The mission with id `write-note`, defined in `engine/missions/`, in which The Listener signs in, writes a short note in the editor and saves it.
- **Memo_List**: The list of saved notes that Memos shows on its home page.
- **Memos_Behavior_Spec**: The file `.kiro/specs/memos-real-world-haunt/memos-behavior.md`, which holds the expected behavior of Memos as short EARS requirements.
- **Memos_Editor**: The note editor in Memos, an element with `role="textbox"` that is not a native `input` or `textarea`.
- **Detector**: An engine component that inspects the page and decides whether a Finding exists.
- **Finding**: A recorded accessibility problem in a run, produced only by a Detector.
- **Focus_Trap_Detector**: The Detector that records Findings of type `focus_trap`.
- **Element_Trap**: A situation in which keyboard focus stays on one element or inside one element that is not a dialog, and Tab and Shift+Tab do not move focus to any other element. An Element_Trap remains an Element_Trap when another key, such as Escape pressed twice, frees focus.
- **Dialog_Trap**: A situation in which keyboard focus stays inside one visible dialog, as the Focus_Trap_Detector reports it before this feature.
- **Unlabeled_Field_Detector**: The new Detector that records Findings of type `unlabeled_field`.
- **Accessible_Name**: The name that Chromium computes for an element and exposes in its accessibility tree, which a screen reader announces. Chromium computes it from sources such as `aria-labelledby`, `aria-label`, an associated `label`, `title`, `alt`, visible text and, on a native `input` or `textarea`, the native `placeholder` attribute. The `aria-placeholder` attribute is not a source of the Accessible_Name.
- **Computed_Name**: The Accessible_Name as read from Chromium's accessibility tree for an element. The Unlabeled_Field_Detector decides on the Computed_Name only.
- **Undocumented_Exit**: A way out of an Element_Trap, such as pressing Escape twice, that no visible on-page text and no announcement tells the user about.
- **Form_Field**: A visible `input`, `select` or `textarea` element, excluding inputs of type `hidden`, `submit`, `button`, `reset` and `image`.
- **Textbox_Element**: A visible element with `role="textbox"`, `role="searchbox"` or `role="combobox"` that is not a native Form_Field.
- **Run_File**: The JSON file that describes one run, conforming to `contract/run.schema.json`.
- **Contract**: The data format shared by the Haunt_Engine and the Dashboard, documented in `contract/run-format.md` and enforced by `contract/run.schema.json`.
- **Schema_Check**: Validation of a Run_File against the run schema, using the engine's existing validation.
- **Scripted_Mind**: The Mind that follows a fixed sequence of steps.
- **AI_Mind**: The mode, started with `--mind ai`, in which a Kiro custom agent chooses each next action for The Listener.
- **Lantern_Findings**: The Findings that the existing Detectors record today for the Lantern_Bills runs in `runs/lantern-bills/` and `runs/samples/`.
- **Real_World_Haunt**: The Dashboard section that presents Memos as a site Haunt did not build, separate from Lantern_Bills.
- **Home_Results**: The Dashboard home screen that shows the latest results for Lantern_Bills.
- **Tour**: The Dashboard guided tour of the Lantern_Bills results.
- **Ghost_Cam_Link**: The Dashboard link to the Ghost Cam screen for the Lantern_Bills Listener run.
- **Memos_Runs_Directory**: The directory `runs/memos/`, where Run_Files for Memos are written.

## Requirements

### Requirement 1: Memos site entry and Write_Note_Mission

**User Story:** As a Haunt developer, I want a `write-note` mission for Memos, so that The Listener can try a real task on a real site.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL define the Memos_Site in `engine/haunt.config.json` with the site key `memos`, the name `Memos`, and `http://localhost:5230` as its base URL.
2. THE Haunt_Engine SHALL provide the Write_Note_Mission as a mission file that passes the existing mission schema validation.
3. THE Write_Note_Mission SHALL direct The Listener to sign in with the Throwaway_Account, to write a short note in the Memos_Editor, and to save the note.
4. THE Write_Note_Mission SHALL define its success check as a new note, whose text equals the text that The Listener typed, appearing in the Memo_List.
5. WHEN the Write_Note_Mission succeeds, THE Haunt_Engine SHALL end the run with the result `succeeded`.
6. IF the Memo_List does not show the new note when the run ends, THEN THE Haunt_Engine SHALL end the run with the result `gave_up` or `error`, and SHALL NOT record the run as `succeeded`.
7. THE Haunt_Engine SHALL apply the existing address guard to the Memos base URL, so that only `localhost`, `127.0.0.1` and the configured `allowedDomains` are visited.
8. THE Write_Note_Mission SHALL keep the Throwaway_Account credentials in the mission file or the site configuration only, and SHALL use no other account.

### Requirement 2: Memos expected behavior

**User Story:** As a Haunt developer, I want the expected behavior of Memos written down as an EARS requirement before the run, so that the mission is tied to a stated expectation and not only to what the run happens to see.

#### Acceptance Criteria

1. THE Memos_Behavior_Spec SHALL be a file named `memos-behavior.md` in `.kiro/specs/memos-real-world-haunt/`.
2. THE Memos_Behavior_Spec SHALL state the expected behavior of writing and saving a note as at least one EARS requirement of no more than three sentences.
3. THE Memos_Behavior_Spec SHALL state that a keyboard user can move focus out of the Memos_Editor with Tab or Shift+Tab.
4. THE Memos_Behavior_Spec SHALL give each requirement an identifier that the Write_Note_Mission can cite.
5. THE Write_Note_Mission SHALL cite the identifier of the Memos_Behavior_Spec requirement that its success check verifies, in the mission's `requirement` field.
6. WHEN the Haunt_Engine writes a Run_File for the Write_Note_Mission, THE Haunt_Engine SHALL copy the cited requirement text into the Run_File's mission block.

### Requirement 3: Generalised focus_trap detection

**User Story:** As a Haunt developer, I want the `focus_trap` detector to also catch focus that cannot leave a single element, so that The Listener reports the Memos editor as a keyboard trap.

#### Acceptance Criteria

1. WHEN an Element_Trap is detected, THE Focus_Trap_Detector SHALL record one Finding of type `focus_trap`, whether or not a later key press, including Escape pressed twice, frees focus from the element.
2. THE Focus_Trap_Detector SHALL detect an Element_Trap on a Textbox_Element when all of the following hold: a Tab press leaves focus on the same element, a Shift+Tab press leaves focus on the same element, and no other visible, enabled control received focus between those presses.
3. WHEN the Focus_Trap_Detector records an Element_Trap Finding, THE Focus_Trap_Detector SHALL include in the Finding's evidence the element's role, its Accessible_Name (or the statement that it has none, or that it could not be read), the keys that did not move focus, and the keys that did move focus.
4. WHEN Escape is pressed twice in a row on an Element_Trap and focus moves away, THE Focus_Trap_Detector SHALL still record the `focus_trap` Finding and SHALL state in the evidence that Escape pressed twice freed focus. WHERE no on-page text and no announcement says that Escape works, THE Focus_Trap_Detector SHALL also state that this exit is an Undocumented_Exit. WHERE the page does say that Escape works, THE Focus_Trap_Detector SHALL state that the page mentions Escape but that Tab and Shift+Tab still cannot leave the element.
5. IF no live-region announcement or other announcement was heard while focus stayed on the trapped element, THEN THE Focus_Trap_Detector SHALL state in the evidence that nothing was announced.
6. THE Focus_Trap_Detector SHALL record one Finding for each trapped element in a run, identified by the element's key.
7. WHERE the trapped element is inside a visible dialog, THE Focus_Trap_Detector SHALL apply the Dialog_Trap rules and SHALL NOT record a second Finding for the same trap.
8. IF a Tab press or a Shift+Tab press moves focus from the element to a different element, THEN THE Focus_Trap_Detector SHALL NOT record an Element_Trap Finding for that element. A key other than Tab and Shift+Tab, including Escape, that moves focus away SHALL NOT count as Tab or Shift+Tab moving focus and SHALL NOT cancel or remove an Element_Trap Finding.
9. WHEN the Focus_Trap_Detector records a Finding of type `focus_trap` for an Element_Trap or a Dialog_Trap, THE Listener's stop rule SHALL end the run with the reason `trapped`, as it does for a Dialog_Trap, whether or not Escape pressed twice later freed focus from the trapped element.
10. WHEN a Tab press or a Tab-based jump leaves focus on the element that already had it, outside a dialog, THE Scripted_Mind SHALL confirm by pressing Shift+Tab, then Escape, then Escape, whether or not the element has an Accessible_Name, so that the Focus_Trap_Detector can record the Element_Trap. A jump that moves focus on the way and wraps round to the same control SHALL NOT start this routine.

### Requirement 4: Lantern Bills findings stay the same

**User Story:** As a Haunt maintainer, I want the Lantern Bills results to stay exactly as they are, so that the existing story, tour and sample runs still hold.

#### Acceptance Criteria

1. WHEN the Focus_Trap_Detector reads the Step traces of any Run_File in `runs/lantern-bills/` or `runs/samples/`, THE Focus_Trap_Detector SHALL produce the same Findings of type `focus_trap`, at the same steps, as it produced before this feature.
2. WHEN the Haunt_Engine runs the existing Lantern_Bills end-to-end tests, THE Haunt_Engine SHALL pass them without any change to those tests.
3. THE Unlabeled_Field_Detector SHALL record no Finding in a Lantern_Bills run that has the same pages and steps as the existing Lantern_Findings runs, unless the page contains a Form_Field or Textbox_Element with no Accessible_Name.
4. IF the Unlabeled_Field_Detector would add a Finding to a Lantern_Bills run, THEN THE Haunt_Engine SHALL report the added Finding and its element, and the task that introduced it SHALL record the difference without editing the Detector or any existing test to hide it.
5. THE Haunt_Engine SHALL leave `demo-site/` and `demo-site-exorcised/` unchanged.

### Requirement 5: unlabeled_field finding type in the Contract

**User Story:** As a Haunt developer, I want `unlabeled_field` in the shared contract, so that the engine can write it and the Dashboard can read it.

#### Acceptance Criteria

1. THE Contract SHALL list `unlabeled_field` in `contract/run-format.md` as a finding type, described as a form field or textbox with no accessible name.
2. THE Contract SHALL list `unlabeled_field` in the `type` enumeration of `contract/run.schema.json`.
3. THE Haunt_Engine SHALL include `unlabeled_field` in its `FindingType` type in `engine/src/contract/types.ts`.
4. THE Dashboard SHALL include `unlabeled_field` in its `FINDING_TYPES` list in `dashboard/src/data/types.ts`.
5. WHEN a Run_File contains a Finding of type `unlabeled_field`, THE Schema_Check SHALL accept the Run_File.
6. WHEN a Run_File contains a Finding whose type is not in the Contract enumeration, THE Schema_Check SHALL reject the Run_File.
7. THE Contract SHALL keep every previously listed finding type and SHALL keep every existing sample Run_File valid.

### Requirement 6: unlabeled_field detection

**User Story:** As a Listener user, I want fields and textboxes without a name to be reported, so that the cause of "edit text, blank" announcements can be found and fixed.

#### Acceptance Criteria

1. WHEN a Form_Field has an empty Computed_Name on a page that The Listener has visited, THE Unlabeled_Field_Detector SHALL record one Finding of type `unlabeled_field`.
2. WHEN a Textbox_Element has an empty Computed_Name on a page that The Listener has visited, THE Unlabeled_Field_Detector SHALL record one Finding of type `unlabeled_field`, even when the Textbox_Element has an `aria-placeholder` attribute.
3. THE Unlabeled_Field_Detector SHALL treat a Computed_Name that contains only whitespace as empty.
4. THE Unlabeled_Field_Detector SHALL decide whether an element is unlabeled from the Computed_Name that Chromium reports in its accessibility tree, and SHALL apply no exemption for any attribute, including `placeholder` and `aria-placeholder`. A native `input` or `textarea` whose only name source is a `placeholder` has a non-empty Computed_Name in Chromium, so the Unlabeled_Field_Detector records no Finding for it because the Computed_Name is not empty.
5. THE Unlabeled_Field_Detector SHALL ignore elements that are hidden, disabled-and-hidden, `aria-hidden`, `inert`, or Form_Field inputs of type `hidden`, `submit`, `button`, `reset` and `image`.
6. WHEN the Unlabeled_Field_Detector records a Finding, THE Unlabeled_Field_Detector SHALL include in the evidence the element's tag, role, type attribute where present, a short selector or surrounding text that identifies the element, and the statement that the Computed_Name is empty. WHERE the element has an `aria-placeholder` or `placeholder` attribute that provides no name, THE Unlabeled_Field_Detector SHALL also note in the evidence that the placeholder is present but is not providing a name.
7. THE Unlabeled_Field_Detector SHALL record one Finding for each unlabeled element in a run, identified by the element's key.
8. THE Unlabeled_Field_Detector SHALL only read the page and SHALL NOT change the page or the focus.
9. THE Unlabeled_Field_Detector SHALL cover the Listener, and SHALL apply to Phantom and Bebe runs only where those ghosts use the shared Detector list.
10. WHEN The Listener visits the Memos home page and the Memos_Editor has a `div` with `role="textbox"`, an `aria-placeholder` attribute and an empty Computed_Name, THE Unlabeled_Field_Detector SHALL record one Finding of type `unlabeled_field` for the Memos_Editor.

### Requirement 7: Finding labels in the engine and the Dashboard

**User Story:** As a Dashboard reader, I want `unlabeled_field` and the generalised `focus_trap` to have plain words, so that I can read them without technical terms.

#### Acceptance Criteria

1. THE Dashboard SHALL define a plain-language entry for `unlabeled_field` in its `FINDING_LABELS` table, with a label, a statement of what would have helped, and a one-sentence summary.
2. THE Dashboard SHALL describe `unlabeled_field` in the same plain style as `unlabeled_button`, so that the summary says a screen reader announces only the kind of field and not its purpose.
3. THE Haunt_Engine SHALL define a label for `unlabeled_field` wherever it maps finding types to words.
4. WHEN a `focus_trap` Finding describes an Element_Trap, THE Dashboard SHALL describe the place as the element, for example "the note editor", and SHALL NOT call it a pop-up.
5. WHEN a `focus_trap` Finding describes a Dialog_Trap, THE Dashboard SHALL show the same words as before this feature.
6. THE Dashboard SHALL list every finding type in `FINDING_TYPES` in its label table, so that no finding type has a missing label.
7. IF a `focus_trap` Finding at the last step of a `gave_up` run describes an Element_Trap, THEN THE Dashboard SHALL treat the Finding as a blocking finding, as it does for a Dialog_Trap.

### Requirement 8: Memos as a separate real-world haunt in the Dashboard

**User Story:** As a viewer of the Dashboard, I want Memos shown as a separate "real-world haunt", so that I can see that Haunt works on a site it did not build, while the Lantern Bills story stays intact.

#### Acceptance Criteria

1. THE Dashboard SHALL show a Real_World_Haunt section for Memos that is separate from the Lantern_Bills results.
2. THE Real_World_Haunt section SHALL label Memos as a real-world haunt and SHALL name Memos as an open-source site that Haunt did not build.
3. WHEN Run_Files exist in the Memos_Runs_Directory, THE Real_World_Haunt section SHALL show the Listener's outcome, the step count and the Findings of the latest Memos run for each mind.
4. WHEN the Real_World_Haunt section shows a run, THE Dashboard SHALL show the mind (scripted or AI) that drove the run.
5. IF the Memos_Runs_Directory has no Run_File, THEN THE Real_World_Haunt section SHALL show a message that no Memos run exists yet and SHALL keep the rest of the Dashboard working.
6. THE Home_Results SHALL continue to show only Lantern_Bills runs.
7. THE Tour SHALL continue to cover only Lantern_Bills runs.
8. THE Ghost_Cam_Link SHALL continue to open the Lantern_Bills Listener run.
9. WHEN a Real_World_Haunt run is opened, THE Dashboard SHALL show the same step-by-step view as it shows for a Lantern_Bills run.
10. THE Dashboard SHALL keep the same Run_File reading rules for Memos runs as for Lantern_Bills runs.
11. THE Dashboard SHALL leave the existing Lantern_Bills end-to-end tests in `dashboard/e2e/` unchanged and passing.

### Requirement 9: Unit tests and property tests

**User Story:** As a Haunt maintainer, I want unit tests and property tests for the new behavior, so that the detectors and the new finding type stay correct.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL include unit tests for the Element_Trap behavior of the Focus_Trap_Detector, covering a trapped Textbox_Element, a Textbox_Element where Tab moves focus away, Escape pressed twice freeing focus from a trapped Textbox_Element (the `focus_trap` Finding is still recorded and its evidence states that Escape pressed twice freed focus and that the exit is undocumented), and the nothing-announced evidence.
2. THE Haunt_Engine SHALL include unit tests for the Unlabeled_Field_Detector, covering a Form_Field with a label, a Form_Field with no name, a Textbox_Element with no name, a native `input` with only a `placeholder` (no Finding, because its Computed_Name is non-empty), a `div` with `role="textbox"` and only an `aria-placeholder` (a Finding, with evidence that the Computed_Name is empty and the placeholder is not providing a name), and an ignored hidden element.
3. THE Haunt_Engine SHALL include a property test that, for any history of key presses in which Tab or Shift+Tab moves focus to a different element, the Focus_Trap_Detector records no Element_Trap Finding for that element.
4. THE Haunt_Engine SHALL include a property test that, for any set of unlabeled elements with distinct keys, the Unlabeled_Field_Detector records exactly one Finding for each key.
5. THE Haunt_Engine SHALL include a property test that, for any Step trace sequence from the existing Lantern_Bills Dialog_Trap cases, the generalised Focus_Trap_Detector records the same Findings as the version before this feature.
6. THE Haunt_Engine SHALL include a test that a Run_File with a Finding of type `unlabeled_field` passes the Schema_Check, and a test that a Run_File with an unknown finding type fails it.
7. THE Dashboard SHALL include unit tests that every value in `FINDING_TYPES` has an entry in `FINDING_LABELS`, and that the `unlabeled_field` entry has a non-empty label, helped text and summary.
8. THE Dashboard SHALL include unit tests that the Real_World_Haunt section shows a Memos run, shows the no-run message, and that Home_Results, the Tour and the Ghost_Cam_Link use only Lantern_Bills runs.
9. THE Haunt_Engine and the Dashboard SHALL NOT weaken, skip or delete any existing test to make a new test pass. The one permitted edit to an existing test is adding the `unlabeled_field` entry to the expected label list in `dashboard/src/__tests__/models.test.ts`, which the ninth finding type in Requirement 5.4 makes necessary.

### Requirement 10: Final Memos runs

**User Story:** As a Haunt developer, I want one scripted-mind run and one AI-mind run of The Listener on Memos, so that the submission shows real results on a real site.

#### Acceptance Criteria

1. WHEN the user has started Memos at `http://localhost:5230` and the Throwaway_Account exists, THE implementation plan SHALL run The Listener once on the Write_Note_Mission with the Scripted_Mind.
2. WHEN the user has started Memos at `http://localhost:5230` and the Throwaway_Account exists, THE implementation plan SHALL run The Listener once on the Write_Note_Mission with the AI_Mind.
3. THE implementation plan SHALL write both Run_Files to the Memos_Runs_Directory.
4. THE implementation plan SHALL validate each Run_File with the Schema_Check.
5. THE implementation plan SHALL end with these two runs as its last tasks, after all code and test tasks.
6. IF Memos is not reachable at `http://localhost:5230`, THEN THE implementation plan SHALL stop the run tasks and report that the user must start Memos, and SHALL NOT start Memos itself.
7. IF either run does not record a `focus_trap` Finding and an `unlabeled_field` Finding for the Memos_Editor, THEN THE implementation plan SHALL report the difference and SHALL NOT edit a Detector or test to produce the Finding.
8. THE implementation plan SHALL report, for each run, the result, the step count and the list of Findings by type and step.
9. WHEN the AI_Mind run ends, THE implementation plan SHALL report the credits consumed, or that the credits are unknown.

### Requirement 11: Ethical and respectful testing

**User Story:** As a Haunt developer, I want testing on Memos to stay inside our own local copy and describe people respectfully, so that Haunt keeps its ethical guidelines.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL visit Memos only at the user's own local instance at `http://localhost:5230`.
2. THE Haunt_Engine SHALL use only the Throwaway_Account on Memos, and SHALL NOT use real credentials.
3. THE Haunt_Engine SHALL leave the notes that the run saves in the local Memos instance and SHALL NOT delete other notes.
4. THE Dashboard text and the Memos_Behavior_Spec SHALL describe The Listener as a person who uses a screen reader's view and the keyboard, with respectful words.
5. IF a Memos run records a Finding, THEN THE implementation plan SHALL keep the Finding as recorded and SHALL NOT weaken or delete a Detector or test to remove it.
