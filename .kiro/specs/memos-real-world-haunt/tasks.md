# Implementation Plan: Memos Real-World Haunt

## Overview

The language is TypeScript (engine, dashboard, tests), as in the existing code. The plan changes the shared contract first, then the engine (site and mission, the pure selection of unnamed fields from Chromium's accessibility tree, generalised `focus_trap`, `unlabeled_field`, Listener Mind), then the dashboard (labels, element-trap words, real-world screen). A checkpoint follows. The last two tasks are the two Memos runs of The Listener, scripted mind first and AI mind second, written to `runs/memos/`.

Ground rules for every task:

- Existing tests are not edited, weakened, skipped or deleted. This includes all Lantern Bills tests in `engine/test/` and `dashboard/e2e/`. If a code change makes an existing test fail, change the new code, not the test.
- `demo-site/` and `demo-site-exorcised/` are not changed.
- Files are created and edited with the file tools, never with shell commands. The terminal is used only for `npm`, `npx` and `node`.
- The dashboard test `dashboard/src/__tests__/models.test.ts` is the one test that cannot stay byte-identical. It compares `FINDING_TYPES` against an exact list of labels, and Requirement 5.4 adds a ninth type. Task 7.1 adds one line for `unlabeled_field` and changes nothing else in that file.
- Property tests use fast-check with `{ numRuns: 100 }` and a `describe` name that starts with `Feature: memos-real-world-haunt, Property N:`.
- `unlabeled_field` decides on the name that Chromium computes in `Accessibility.getFullAXTree` and on nothing else. There is no in-page name computation and no exemption for `placeholder` or `aria-placeholder`.
- A way out of an element trap by Escape pressed twice never cancels or suppresses the `focus_trap` finding. Only a Tab or Shift+Tab press that moves focus to another element clears a trap candidate.
- Memos is never started by this plan. Tasks 1 to 8 need no running Memos.

## Tasks

- [x] 1. Add the `unlabeled_field` finding type to the engine side of the contract
  - [x] 1.1 Update the contract files and the engine type
    - In `contract/run.schema.json`, append `"unlabeled_field"` to the `findings[].type` enumeration and keep every existing value.
    - In `contract/run-format.md`, add a bullet after `unlabeled_button`: `unlabeled_field` - A form field or textbox with no accessible name.
    - In `engine/src/contract/types.ts`, add `| 'unlabeled_field'` to `FindingType`.
    - Run `npm run build` in `engine/` and fix any exhaustive type table in non-test source that now needs the new member.
    - Check that every file under `contract/` and `runs/samples/` still passes the schema.
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 7.3_

  - [x]* 1.2 Write property test for the run schema finding types
    - Create `engine/test/contract.properties.test.ts`. Build a valid run from `contract/example-run.json`, set one finding's `type` to a generated string, and check it with `validateSchema`.
    - Also check an `unlabeled_field` run is accepted, an unknown type is rejected, and the eight earlier types are still accepted.
    - **Property 11: The run schema accepts a finding type if and only if it is one of the nine** (the dashboard half, `FINDING_TYPES` equals the schema list, is in task 7.3)
    - **Validates: Requirements 5.2, 5.5, 5.6, 5.7, 9.6**

- [x] 2. Memos site, mission schema, templates, behavior spec and mission
  - [x] 2.1 Add `baseUrl` to the site config and the Memos site entry
    - In `engine/schemas/config.schema.json`, add `site.properties.baseUrl` as `{ "type": "string", "minLength": 1 }`. It stays optional.
    - Add `baseUrl?: string` to `SiteConfig`.
    - In `loadConfig`, after schema validation, reject a site whose `baseUrl` fails `isAllowedAddress(baseUrl, config)` with a `ConfigError('schema', ...)` that names the site and the address.
    - In `engine/haunt.config.json`, add `"memos": { "name": "Memos", "allowedTerms": ["Memos"], "baseUrl": "http://localhost:5230" }`. Do not change the existing sites.
    - _Requirements: 1.1, 1.7, 11.1_

  - [x]* 2.2 Write property test for the base URL guard
    - Create `engine/test/loadConfig.properties.test.ts`. Write temporary config files with a generated `baseUrl` and compare `loadConfig` acceptance with `isAllowedAddress`.
    - **Property 3: The address guard decides whether a site base URL loads**
    - **Validates: Requirements 1.7, 11.1**

  - [x] 2.3 Add the `unnamedField` last resort value and the `{{runStamp}}` template
    - In `engine/schemas/mission.schema.json`, change `intention.properties.lastResort` to the enum `["unnamedButton", "unnamedField"]`. In `loadMission.ts`, change the type to `lastResort?: 'unnamedButton' | 'unnamedField'`.
    - In `engine/src/missions/templates.ts`, export `runStamp(start: Date)` (UTC, `YYYYMMDD-HHmmss`) and make `applyTemplates` replace `{{runStamp}}`.
    - Make `expandMission` expand `goal`, `successCheck.text`, `successCheck.visible` and intention values, and leave `requirement` alone. A mission with no placeholder expands to an equal mission.
    - In `engine/src/cli/main.ts`, use the expanded mission in `checkSuccess`, in the Kiro prompt goal, and in `finalizeRun`.
    - Do not edit `engine/missions/pay-bill.json`. It must stay valid and expand to itself.
    - _Requirements: 1.2, 1.4, 4.1_

  - [x]* 2.4 Write property tests for the mission schema and template expansion
    - Create `engine/test/missions.properties.test.ts`.
    - **Property 1: Mission schema accepts exactly the two last-resort values**
    - **Property 2: Template expansion is the identity without placeholders and total with them**
    - **Validates: Requirements 1.2, 1.4, 4.1**

  - [x] 2.5 Write `memos-behavior.md`
    - Create `.kiro/specs/memos-real-world-haunt/memos-behavior.md` with three EARS requirements, each of at most three sentences and each with an identifier: `MEMOS-1` (a signed-in user types a note and activates Save, so a new memo with that text is added at the top of the memo list), `MEMOS-2` (focus in the note editor, Tab or Shift+Tab moves focus to the next or previous control), `MEMOS-3` (the note editor has an accessible name that a screen reader announces).
    - Describe The Listener as a person who uses a screen reader's view and the keyboard, with respectful words.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.4_

  - [x] 2.6 Write the `write-note` mission
    - Create `engine/missions/write-note.json` with `id` `write-note`, `site` `memos`, and a `goal` that names the Throwaway_Account (`ghost-test`, `HauntTest123!`) and the note text `Haunt was here {{runStamp}}`.
    - Set `requirement` to `MEMOS-1: <the exact MEMOS-1 text from memos-behavior.md>`.
    - Set `successCheck.text` and `successCheck.visible` so the check matches one saved memo card with exactly the stamped note text, and not the editor.
    - Define intentions: username (type), password (type), sign-in (activate), note (type, `lastResort: "unnamedField"`, `doneWhen.present` with `^haunt was here`), save (activate, `doneWhen` success).
    - Write the name patterns from the Memos user interface. If `http://localhost:5230` answers, read the page markup to confirm them. If it does not answer, use the documented Memos labels and add a note at the top of the final report that the patterns are unconfirmed. Do not start Memos and do not ask the user.
    - Keep the credentials in this file only. Use no other account.
    - Confirm the mission loads through the mission schema validation.
    - _Requirements: 1.2, 1.3, 1.4, 1.8, 2.5, 2.6, 11.2_

  - [x]* 2.7 Write the Memos mission and spec tests
    - Create `engine/test/memosMission.test.ts`. Check that `write-note` loads, that its `requirement` is `<id>: <text>` with an id and text taken from `memos-behavior.md`, and that the spec has `MEMOS-n` identifiers of at most three sentences each, including a Tab and Shift+Tab requirement for the editor.
    - Check that the credentials appear only in the mission file, that `haunt.config.json` has `memos` with `baseUrl` `http://localhost:5230`, and that `listenerGhost.detectors()` includes `focus_trap` and `unlabeled_field`.
    - Check that the run's mission block carries the cited requirement text through `finalizeRun`.
    - _Requirements: 1.1, 1.2, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.9_

- [x] 3. Pure selection of unnamed fields from Chromium's accessibility tree
  - [x] 3.1 Create the pure `selectUnnamedFields` step in `engine/src/detectors/unlabeledField.ts`
    - Create the file with the exports `FIELD_AX_ROLES` (`textbox`, `searchbox`, `combobox`, `listbox`, `spinbutton`, `checkbox`, `radio`, `switch`, `slider`) and `selectUnnamedFields(nodes: RawAxNode[])`.
    - `selectUnnamedFields` reads the raw nodes of `Accessibility.getFullAXTree` with `buildHeard` from `engine/src/ghosts/listener/ax.ts`, which leaves out the nodes Chromium ignores (`aria-hidden`, `hidden`, `display: none`, `inert`). It returns the nodes whose role is in `FIELD_AX_ROLES` and whose name is empty after `trim()`, in tree order.
    - The step decides on the Computed_Name only. It reads no `placeholder` or `aria-placeholder` data and has no exemption for any attribute. There is no name computation in the page and no shared name source.
    - Do not edit `unlabeledButton.ts` or `ax.ts`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 3.2 Write property test for the selection step
    - Create `engine/test/unlabeledField.properties.test.ts` (task 5.2 adds Properties 9 and 10 to the same file). Generate raw accessibility nodes with any roles, ignored flags and names (including whitespace-only names), together with arbitrary `placeholder` and `aria-placeholder` data that the page reports for them, and compare `selectUnnamedFields` with a TypeScript oracle.
    - **Property 8: Only the Computed_Name decides which nodes are unlabeled**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 4. Generalised `focus_trap` detector
  - [x] 4.1 Create the pure element trap analysis
    - Create `engine/src/detectors/elementTrap.ts` with `TrapEvent`, `TrapCandidate`, `TrapResolution`, `findElementTraps(events)`, `TrapElementInfo` and `describeElementTrap(candidate, info, announcements)` as in the design.
    - A stay press leaves focus on the same element with no dialog key. A streak is unbroken by any other focus. A streak qualifies with at least one Tab and one Shift+Tab stay press.
    - Only a Tab or Shift+Tab press made while focus was on the element that lands on a different element clears the element, for the whole history. An Escape press, or two in a row, that moves focus off the element never clears it or removes the candidate, and neither does any other key.
    - Two Escape presses in a row only describe how the trap ended: the resolution is `freed_by_double_escape` when focus moved and `not_freed_by_double_escape` when it stayed. A qualified candidate with no double Escape is `open`. Return at most one candidate for each element key, whatever the resolution.
    - `TrapElementInfo` carries `present`, `textbox`, `role`, `name` (`string | null`, null when the name could not be read) and `escapeDocumented`.
    - The evidence, in this order: the role and the name (or the statement that there is no name, or that the name could not be read); the keys that left focus on the element with counts; the keys that moved focus by resolution. For `freed_by_double_escape` it says that Escape pressed twice did free focus, then either `This exit is undocumented: no text on the page and no announcement says that Escape works.` or, when `escapeDocumented` is true, that the page does mention that Escape works but Tab and Shift+Tab still cannot leave the text box. Then `Nothing was announced while focus was stuck.` when no announcement was heard in the window, else the first announcement. It uses none of the words dialog, modal or pop-up.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 7.4_

  - [x]* 4.2 Write property tests for the element trap analysis
    - Create `engine/test/elementTrap.properties.test.ts` with arbitrary event histories (including Escape presses, in a row or not, that free focus or do not) and element descriptions. No browser.
    - **Property 4: One qualified trap per stuck element**
    - **Property 5: Only a Tab or Shift+Tab that moves focus away clears the element**
    - **Property 6: Element trap evidence states what was tried and what happened**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 7.4**

  - [x] 4.3 Compose the dialog part and the element part in `focusTrap.ts`
    - In `engine/src/detectors/focusTrap.ts`, rename the existing factory to `createDialogTrapDetector` and leave its body and the rest of the file unchanged. Keep `listenerStopRule` exported from this file.
    - Add a new `createFocusTrapDetector` that runs the dialog part and an element part. `observe` returns the dialog problems followed by the element problems. `finish` returns the element part's open traps.
    - The element part reads focus with the existing `READ_FOCUS_SCRIPT` and builds `TrapEvent[]` from `ctx.steps`. While focus is on a non-native element with a textbox-like role, it reads `Accessibility.getFullAXTree`, builds a `Heard` with `buildHeard`, takes `focusedNode(heard)`, and remembers that node's role and Computed_Name by element key. This is the name the evidence shows. It is read while the element has focus, because after a double Escape focus has already left it. The element part computes no name of its own.
    - It calls `findElementTraps`, and reads the element with a read-only page script (`window.__haunt.keys.element(key)`: connected, visible, Textbox_Element, and `escapeDocumented` from the visible page text, `title`, `aria-description` and `aria-describedby` text, looking for the whole word `Esc` or `Escape`, case-insensitive). It records a problem only when the element is a Textbox_Element. An element that is gone is still recorded from the role and name remembered while it had focus, as long as that read showed a textbox-like role on a non-native element, and is not recorded otherwise.
    - Report a resolved candidate (`freed_by_double_escape` or `not_freed_by_double_escape`) at its `resolutionStep` from `observe`, so the stop rule sees it in the same loop pass. A double Escape that frees focus is recorded exactly like one that does not, and only the evidence differs. Report an `open` candidate from `finish` at its `qualifiedStep`. Use the key `focus-trap-element:<doc>:<elementKey>` and keep a `reported` set and a `rejected` set.
    - Do not record a second finding for a trap that is inside a dialog.
    - Leave `listenerStopRule` unchanged. It ends the run with `trapped` when `findingCounts.focus_trap > 0`, whether or not Escape pressed twice later freed focus.
    - Run the existing `engine/test/focusTrap.test.ts` and `engine/test/listenerDetectors.test.ts` unchanged and confirm they pass.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2_

  - [x]* 4.4 Write property test for a double Escape exit
    - Add to `engine/test/elementTrap.properties.test.ts` (created in task 4.2). Use a fake `DetectorContext` and generated histories in which an element qualifies as a trap and Escape pressed twice in a row then moves focus away. Check that the element part returns one `focus_trap` problem for that element at the Step of the second Escape, with evidence that says Escape pressed twice freed focus, and that `listenerStopRule`, applied to the finding counts after that Step, returns the reason `trapped`.
    - **Property 16: A double Escape exit still gives the finding and the stop**
    - **Validates: Requirements 3.1, 3.4, 3.9**

  - [x]* 4.5 Write property test for dialog parity
    - Create `engine/test/focusTrap.dialogParity.properties.test.ts`. Use a fake `DetectorContext` whose `inspect` answers the focus read and the dialog read from a generated history. Run `createFocusTrapDetector()` and `createDialogTrapDetector()` side by side on dialog-shaped histories, including histories where focus stays on an element inside the dialog.
    - **Property 7: Dialog histories give the same findings as before**
    - **Validates: Requirements 3.7, 4.1, 9.5**

  - [x]* 4.6 Write browser fixture tests for the element trap
    - Create `engine/test/fixtures/element-trap.html` with a `div role="textbox"` that stops Tab and Shift+Tab and needs Escape twice, plus a variant where Tab moves away, a variant with a visible "Press Esc to leave" text, and a variant inside a dialog. Create `engine/test/focusTrap.element.test.ts` with the existing `startFixtureServer`.
    - Cover a trapped textbox, and a textbox where Tab moves focus away (no finding).
    - Cover Escape pressed twice freeing focus from the trapped textbox: the `focus_trap` finding is still recorded, its evidence says Escape pressed twice freed focus and that the exit is undocumented, and `listenerStopRule` returns `trapped`.
    - Cover the same fixture with the visible "Press Esc to leave" text: the finding is still recorded and its evidence says the page does mention Escape.
    - Cover the nothing-announced evidence, an open trap reported from `finish()`, and a trap inside a dialog giving only the dialog finding.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 9.1_

- [x] 5. `unlabeled_field` detector
  - [x] 5.1 Create the detector and register it for The Listener
    - In `engine/src/detectors/unlabeledField.ts` (created in task 3.1), add `createUnlabeledFieldDetector()` with `type: 'unlabeled_field'`. It decides on the Computed_Name from `Accessibility.getFullAXTree` and nothing else, using `selectUnnamedFields` from task 3.1. It follows the method of `unlabeledButton.ts`.
    - For each selected node, find the page element with the read-only CDP methods `DOM.describeNode` and `DOM.getBoxModel`: one read-only `ctx.inspect` call picks the element with the same tag, attributes and border box, and identical twins are told apart by document order. If an unnamed node cannot be matched to a page element, record the finding from what `DOM.describeNode` said (tag, type, role) and leave out the placeholder sentence.
    - The page script returns, for each matched element, `key` (from `__haunt.keys.key`, `null` when there is no key script, then the id falls back to the selector and ordinal), `tag`, `role` (Chromium's role), `type`, `selector`, container text, `placeholder`, `ariaPlaceholder` and `ignored` (a reason or `null`). It marks an element ignored when it is not a Form_Field (`input`, `select`, `textarea`) or a Textbox_Element (a non-native element with role `textbox`, `searchbox` or `combobox`), is not visible, is `inert`, has an `aria-hidden` ancestor, or is an input of type `hidden`, `submit`, `button`, `reset` or `image`. It reads `placeholder` and `aria-placeholder` only for the evidence and never uses them to decide. There is no placeholder exemption: an empty Computed_Name is a finding even with an `aria-placeholder` (the Memos editor), and a native `input` whose only name source is a `placeholder` gets no finding only because Chromium reports a non-empty name for it.
    - `observe` stores each unignored element by `<doc>:<elementKey>` with the first Step and page path, and returns nothing. It calls only the three read-only CDP methods and `ctx.inspect`, and never changes the page or the focus. `finish` returns one problem for each stored element, at the Step where The Listener first focused it, else the Step where it was first seen.
    - The title is `Form field has no accessible name`. The evidence names the page path, tag, type, role, selector and container text, says that the name Chromium computes for the element is empty, and says a screen reader announces only the kind of field. When the element has a non-empty `aria-placeholder` or `placeholder` attribute, it also says that a placeholder is present and is not providing a name. When neither attribute is present, that sentence is left out. It then says when The Listener first focused the element, or that it was never focused.
    - In `engine/src/ghosts/listener/index.ts`, append `createUnlabeledFieldDetector()` at the end of the detector list. Do not change the Phantom or Bebe lists.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x]* 5.2 Write property tests for the detector
    - Add to `engine/test/unlabeledField.properties.test.ts` (created in task 3.2). Use a fake `cdp` that answers `Accessibility.getFullAXTree`, `DOM.describeNode` and `DOM.getBoxModel`, and a fake `inspect`.
    - **Property 9: One finding per unlabeled element**
    - **Property 10: Unlabeled field evidence identifies the element and the missing name**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 9.4**

  - [x]* 5.3 Write browser fixture tests for the detector
    - Create `engine/test/fixtures/unlabeled-field.html` and `engine/test/unlabeledField.test.ts`. Cover a labelled field, a native `input` with only a `placeholder` (no finding, because Chromium gives it a non-empty name), a native field with no name, a `div role="textbox"` with no name, a `div role="textbox"` with only an `aria-placeholder` (a finding, with evidence that the computed name is empty and that the placeholder is not providing a name; this is the Memos editor shape), a hidden input and an `aria-hidden` field.
    - Cross-check against Chromium's accessibility tree: read `Accessibility.getFullAXTree` independently in the test and assert that the set of flagged elements equals the unignored Form_Field and Textbox_Element nodes with an empty AX name. Include every native input type in the fixture and assert that `FIELD_AX_ROLES` covers the role Chromium gives each one. If a type has an empty name and a role outside the list, correct `FIELD_AX_ROLES` in `unlabeledField.ts` and do not loosen the detector.
    - Check that the detector changes neither the page nor the focus.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.10, 9.2_

  - [x] 5.4 Check the Lantern Bills pages for added findings
    - Create `engine/test/unlabeledField.lantern.test.ts`. Play the same Lantern Bills flow that `engine/test/listenerDetectors.test.ts` plays, with `createUnlabeledFieldDetector()` deciding on Chromium's computed names, and compare the findings with an `EXPECTED` list that is empty (Requirement 4.3).
    - If a finding appears, do not edit the detector or any existing test. Create `.kiro/specs/memos-real-world-haunt/lantern-regression.md` that records the page, the element and the evidence of each added finding, and set `EXPECTED` in the new test to that recorded list.
    - Run the existing Lantern Listener tests (`engine/test/focusTrap.test.ts`, `engine/test/listenerDetectors.test.ts`) unchanged and confirm the `focus_trap` findings are unchanged.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Listener Mind: unnamed field last resort and stuck routine
  - [x] 6.1 Add the `unnamedField` last resort
    - In `engine/src/ghosts/listener/mind.ts` and `thoughts.ts`, add `lastResortKind: 'button' | 'field'` to `Search`. When a Full_Pass of field jumps finds no match and the intention has `lastResort: "unnamedField"`, take the controls with a field role and an empty name, in the order reached, that were not used before.
    - Jump to the next candidate until it has focus, then type the intention's `value` (for `type`) or press Enter (for `activate`), mark the control used, and remember it as `unnamedTyped`.
    - Add first-person thoughts in the existing style, for example that the field has no name and the Listener will try it.
    - Leave the `unnamedButton` path and every decision for missions without `lastResort: "unnamedField"` unchanged.
    - _Requirements: 1.3, 3.2, 4.2_

  - [x] 6.2 Add the stuck-in-a-typed-field routine
    - In `mind.ts`, when `unnamedTyped` is set and focus is still on `unnamedTyped.ref` after a jump or Tab press, press Shift+Tab, then Escape, then Escape. If focus moves after any of these, resume the normal search. After the second Escape, clear `unnamedTyped` and drop the search state.
    - Add `elementTrap` to `ListenerMemory` (the control and the keys tried). In `thoughts.ts`, make `trappedThought` say that the Listener is stuck in a text box with no name and that Tab and Shift+Tab do not move it when the scope is `page`. Leave the dialog sentences unchanged.
    - The routine only makes the key presses that the `focus_trap` detector reads. The Mind does not decide whether a trap is reported: the detector records the finding at the second Escape whether or not focus moved, and the stop rule then ends the run with `trapped`.
    - The routine runs only for a field the Mind itself typed into through `unnamedField`, so the existing test "gives up with no_match when the button jump finds no button at all" and every Lantern decision stay unchanged.
    - _Requirements: 3.2, 3.4, 3.9, 4.2_

  - [x]* 6.3 Write tests for the Mind changes
    - Create `engine/test/listenerMind.unnamedField.test.ts` with a fake `Heard` walk of `write-note`. Cover typing into the unnamed field as a last resort, then Shift+Tab, Escape, Escape when focus does not move, the normal search when focus does move, and a Mind without `unnamedField` deciding exactly as before.
    - _Requirements: 1.3, 3.2, 3.4, 4.2_

- [x] 7. Dashboard: labels, element-trap words and the real-world screen
  - [x] 7.1 Add the `unlabeled_field` type and its plain words
    - In `dashboard/src/data/types.ts`, append `'unlabeled_field'` to `FINDING_TYPES`.
    - In `dashboard/src/model/findingLabels.ts`, add the `unlabeled_field` entry with `label`, `helped`, `blocker`, `thing`, `stuck` and `summary` in the plain style of `unlabeled_button` (a screen reader says only the kind of field, like "edit text", and not what it is for).
    - In `dashboard/src/__tests__/models.test.ts`, add the one line `unlabeled_field: 'Field with no name',` to the expected object in the test `has the plain-words labels from the requirements` (describe `ghosts and labels`). Change nothing else in that file. Requirement 9.9 names this as the one permitted edit to an existing test.
    - Confirm that `dashboard/` builds with `npx tsc -b` and that the existing dashboard unit tests pass.
    - _Requirements: 5.4, 7.1, 7.2, 7.6_

  - [x] 7.2 Describe an element trap as the element
    - In `dashboard/src/model/findingWords.ts`, add an `ELEMENT_TRAP` pattern for the first sentence of an element-trap evidence (`Keyboard focus could not leave the text box "<name>"` or `a text box with no name`). `trapPlace(run, finding)` checks it before the dialog patterns, and a named element gives `the '<name>' text box`.
    - In `dashboard/src/model/sites.ts`, add an optional `unnamedTextbox?: string` to `SiteAbout` and the `Memos` entry (a description that names Memos as an open-source site that Haunt did not build and runs locally, page names for `/` and `/auth`, and `unnamedTextbox: 'the note editor'`, with no `tryLink`).
    - In `dashboard/src/model/results.ts`, make `blocker()` return `got trapped in <place>` for an element trap. Do not change `blockingFindings`, which already treats every `focus_trap` as blocking.
    - Dialog findings keep the same words as before.
    - _Requirements: 7.4, 7.5, 7.7, 8.2, 11.4_

  - [x] 7.3 Write tests for the labels and element-trap words
    - Create `dashboard/src/__tests__/findingWords.element.test.ts`. Check that every value in `FINDING_TYPES` has a complete label entry, that `unlabeled_field` has a non-empty label, helped text and summary, that an element trap is named as the element and is blocking in a `gave_up` run, and that the dialog wording is unchanged.
    - In the same file, read `contract/run.schema.json` with `node:fs` and check that `FINDING_TYPES` equals the `findings[].type` enumeration, so the dashboard list and the schema cannot drift apart.
    - **Property 11 (dashboard half): `FINDING_TYPES` equals the schema's list**
    - **Property 12: Every finding type has complete plain words**
    - **Property 13: An element trap is named as the element, and is blocking**
    - **Validates: Requirements 5.4, 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 9.7**

  - [x] 7.4 Add the real-world flag and keep Lantern results separate
    - Create `dashboard/src/model/realWorld.ts` with `isRealWorldRun`, `realWorldRuns` and `latestPerMind(runs)`, keyed by `siteKey(run.site.name)` in one set containing `memos`. Import only `routes.ts` and the data types, so there is no import cycle.
    - In `fixedCopy.originalSiteRuns`, also drop real-world runs and update its comment. In `origin.ghostsWithRealRuns`, ignore real-world runs.
    - Check that `buildTour`, `screenDestinations` and the Séance redirect use `originalSiteRuns` and need no other change.
    - Check that `dashboard/scripts/collect-runs.ts` collects `runs/memos/` with the same reading rules as the other run folders, and change it only if it does not.
    - _Requirements: 8.6, 8.7, 8.8, 8.10_

  - [x] 7.5 Add the real-world screen and its route
    - In `dashboard/src/routes.ts`, add `PATTERNS.realWorld = '/real-world'`, `realWorldPath()`, the route `{ screen: 'real_world' }` and its `parseRoute` case. In `screens.ts`, make `screenOfRoute` return `null` for it so the navigation order and the guided path do not change. Register the route in `App.tsx`.
    - Create `dashboard/src/screens/RealWorldScreen.tsx` and `RealWorldScreen.module.css`. Show a heading "A real-world haunt", a panel that names Memos as an open-source site that Haunt did not build, and up to two result cards (scripted mind and AI mind) built from `latestPerMind`.
    - Each card shows The Listener (`GhostCharacter`), the mind tag, `ResultBadge`, `resultHeadline`, the step count, one line per finding (plain type, title, step) and a "Watch it happen" button to `stepPath(run.key, watchStep(run))`, which opens the same step-by-step Ghost Cam view as Lantern runs.
    - With no real-world run, show "No Memos run exists yet." and what to do (start Memos, then run The Listener). Read runs through `useAllRuns`. Use existing style tokens only, and show findings with text and an icon, never by color alone.
    - In `HomeScreen.tsx`, build `haunts` and the recent walks from runs without real-world runs, and show one link to `/real-world` below the haunted sites only when at least one real-world run exists. With none, Home is unchanged.
    - Do not edit anything under `dashboard/e2e/`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 8.10, 8.11, 11.4_

  - [x] 7.6 Write property tests for the real-world separation
    - Create `dashboard/src/__tests__/realWorld.properties.test.ts` with the Run arbitraries in `arbitraries.ts` and a site name override.
    - **Property 14: Home, the tour and the Ghost Cam link ignore real-world runs**
    - **Property 15: The real-world screen shows the newest run for each mind**
    - **Validates: Requirements 8.3, 8.4, 8.6, 8.7, 8.8, 9.8**

  - [x] 7.7 Write unit tests for the real-world screen
    - Create `dashboard/src/__tests__/RealWorldScreen.test.tsx`. Check that a Memos run shows the outcome, step count, findings and mind tag, that the no-run message shows when there is no Memos run, that Home with Lantern runs only has no real-world link, and that a Memos run opens in the Ghost Cam.
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.9, 9.8_

- [x] 8. Checkpoint - Ensure all tests pass
  - Run `npm run build` and `npm test` in `engine/`, and `npx tsc -b` and `npm test` in `dashboard/`. Ensure all tests pass, ask the user if questions arise.
  - Confirm with `git diff --stat` that no file under `demo-site/`, `demo-site-exorcised/` or `dashboard/e2e/` changed, and that the only change to an existing test file is the one added line in `dashboard/src/__tests__/models.test.ts`.
  - Confirm that `engine/` tests did not write into the repository `runs/` folder.
  - _Requirements: 4.2, 4.5, 8.11, 9.9_

- [ ] 9. Final run 1: The Listener on Memos with the scripted mind
  - Check that Memos answers. In `engine/`, run `node -e "fetch('http://localhost:5230').then(r=>console.log('reachable',r.status)).catch(()=>{console.log('UNREACHABLE');process.exit(1)})"`.
  - If the output is `UNREACHABLE`, stop here. Do not start Memos, do not write any file, and do not continue to task 10. Tell the user that Memos must be started at `http://localhost:5230` and that the local Throwaway_Account `ghost-test` must exist, and ask them to start it and continue.
  - If it is reachable, in `engine/` run `npm run haunt -- run --ghost listener --mission write-note --url http://localhost:5230 --mind scripted` with `--out` left at its default so the run folder is written under `runs/memos/`. Do not set `HAUNT_UNDER_TEST`.
  - Find the new folder under `runs/memos/` and check its `run.json` with the engine's `validateSchema` (the Schema_Check). Report if it fails.
  - Report the result, the step count and the findings by type and step. Check whether a `focus_trap` finding exists for the note editor and whether an `unlabeled_field` finding exists for it (a `div role="textbox"` with an `aria-placeholder` and an empty computed name).
  - The expected end is `gave_up` with reason `trapped` and the note not saved. The `focus_trap` finding is recorded at the Step of the second Escape whether or not that Escape moved focus. If Escape pressed twice freed focus, its evidence says so and says that the exit is undocumented (or that the page documents Escape, if it does). The finding is not suppressed or removed because Escape freed focus.
  - If the run has no `focus_trap` finding for the editor, or no `unlabeled_field` finding for it, or ends with `no_match` or `error`, report the difference and the evidence. Do not edit a detector, a test or an existing finding to produce or remove a finding. A pattern or selector in `engine/missions/write-note.json` is the only file that may be corrected, and then only for a `no_match` or `error` that comes from the Memos page, and the correction and the failed run are both reported. Keep every written run folder.
  - Leave the saved notes in the local Memos instance and delete no other notes.
  - _Requirements: 3.4, 3.9, 6.10, 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2, 11.3, 11.5_

- [ ] 10. Final run 2: The Listener on Memos with the AI mind
  - Check that Memos answers with the same `node -e "fetch('http://localhost:5230')..."` command as task 9. If task 9 stopped because Memos was unreachable, or this check prints `UNREACHABLE`, stop here. Do not start Memos, do not write any file, and tell the user that Memos must be started at `http://localhost:5230` and ask them to start it and continue.
  - If it is reachable, in `engine/` run `npm run haunt -- run --ghost listener --mission write-note --url http://localhost:5230 --mind ai` with `--out` left at its default so the run folder is written under `runs/memos/`. Do not set `HAUNT_UNDER_TEST`. If the Kiro CLI cannot be found, report the CLI's help text and stop without writing a run.
  - Find the new folder under `runs/memos/` that has `mind` `ai` and check its `run.json` with `validateSchema`. Report if it fails.
  - Report the result, the step count and the findings by type and step. Check whether a `focus_trap` finding exists for the note editor and whether an `unlabeled_field` finding exists for it. If the AI Mind pressed Escape twice and that freed focus, the `focus_trap` finding is still expected, with evidence that says Escape pressed twice freed focus and that the exit is undocumented (or that the page documents Escape, if it does), and the Listener's stop rule ends the run with `trapped`.
  - Report the credits consumed from the CLI's credits line, or state that the credits are unknown if Kiro printed none.
  - If the run has no `focus_trap` finding for the editor, or no `unlabeled_field` finding for it, report the difference. Do not edit a detector or a test to produce the finding, and do not weaken or delete a finding that was recorded.
  - Leave the saved notes in the local Memos instance and delete no other notes.
  - _Requirements: 3.4, 3.9, 6.10, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.1, 11.2, 11.3, 11.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Tasks 5.4 and 7.3 to 7.7 are not marked optional because they check Requirements 4 and 8, which protect the Lantern Bills results.
- Tasks 9 and 10 are the last tasks and need the user to have started Memos at `http://localhost:5230`. If Memos is not reachable they stop and ask the user to start it.
- Each task references specific requirements for traceability.
- Property tests validate the 16 correctness properties in the design. Unit and fixture tests validate examples and edge cases.
- Decision (design D6, D7, Requirement 6.4): `unlabeled_field` has no placeholder exemption. It flags an element whose Computed_Name from Chromium's accessibility tree is empty, even with an `aria-placeholder` (the Memos editor). A native `input` with only a `placeholder` is not flagged because Chromium reports a non-empty name for it.
- Decision (design D2, D3, Requirements 3.1, 3.4, 3.8, 3.9): Escape pressed twice that frees focus does not cancel or suppress the `focus_trap` finding. Only Tab or Shift+Tab moving focus away clears a trap candidate. The run still ends with `trapped`, so the scripted Memos run is expected to end `gave_up` with the note not saved.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "2.5", "3.1", "4.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.4", "2.6", "3.2", "4.2", "4.3", "5.1", "6.1", "7.2", "7.4"] },
    { "id": 2, "tasks": ["2.7", "4.4", "4.5", "4.6", "5.2", "5.3", "5.4", "6.2", "7.3", "7.5", "7.6"] },
    { "id": 3, "tasks": ["6.3", "7.7"] },
    { "id": 4, "tasks": ["8"] },
    { "id": 5, "tasks": ["9"] },
    { "id": 6, "tasks": ["10"] }
  ]
}
```
