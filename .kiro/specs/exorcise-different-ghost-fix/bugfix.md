# Bugfix Requirements Document

## Introduction

The Exorcise screen compares a "before" run and an "after" run of the same mission and labels each finding as Exorcised, Still haunting, New haunting, or Not reached. Today it also compares runs made by different ghosts. A ghost can only confirm a fix for problems it is able to detect, so comparing, for example, a Listener run against a Bebe run makes findings look exorcised (or newly haunting) when nobody checked them. That gives a false signal that a barrier is fixed.

The fix restricts the comparison to runs by the same ghost on the same mission. When the before run's ghost has no other run of that mission, the screen says "No after run yet for [ghost name]" instead of showing a comparison. With the current sample data (one Listener run and one Bebe run of pay-bill), neither ghost has an after run, so the screen shows this message.

This bugfix supersedes criterion 13.8 of `.kiro/specs/haunt-dashboard/requirements.md` ("warn when ghosts differ") for the Exorcise screen, and narrows criterion 13.1 (the after list is filtered by ghost as well as mission).

**Assumption (open point settled):** a URL that names a before/after pair by different ghosts (for example an old shared link to `#/exorcise/:beforeKey/:afterKey`) does not render a comparison. The screen keeps both pickers usable, shows the before run, and shows a plain message that the two runs are by different ghosts and cannot be compared. The after picker then lists only the before ghost's runs of that mission, or says "No after run yet for [before ghost name]" if there are none.

**Assumption:** "newest first" means sorted by `startedAt`, newest first, as elsewhere on the dashboard. When no same-ghost pair exists at `#/exorcise`, the newest run is used as the default before run so the "No after run yet" message can name its ghost.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user opens the "After run (same mission)" picker for a before run THEN the system lists every other run of the same mission, including runs by other ghosts

1.2 WHEN the before run's ghost has no other run of the same mission but another ghost does THEN the system picks a run by the other ghost as the default after run and shows a comparison

1.3 WHEN the user opens `#/exorcise` and the only runs sharing a mission are by different ghosts THEN the system builds a default pair from those different-ghost runs and shows a comparison

1.4 WHEN the before and after runs are by different ghosts THEN the system shows a "Different ghosts." warning and still renders the status table, labelling findings "Exorcised", "Still haunting", "New haunting", or "Not reached"

1.5 WHEN a URL `#/exorcise/:beforeKey/:afterKey` names two runs of the same mission by different ghosts THEN the system renders the comparison for that pair

1.6 WHEN a run has another run of the same mission only by a different ghost THEN the system treats it as having a partner in the Before picker (the option is enabled and selecting it produces a different-ghost comparison)

### Expected Behavior (Correct)

2.1 WHEN the user opens the after-run picker for a before run THEN the system SHALL list only other runs with the same ghost and the same mission.id as the before run, sorted newest first

2.2 WHEN the before run's ghost has no other run of the same mission THEN the system SHALL NOT show a comparison and SHALL show the message "No after run yet for [ghost name]", where the ghost name is the before run's ghost from GHOSTS ("The Listener", "The Phantom", or "Bebe")

2.3 WHEN the user opens `#/exorcise` THEN the system SHALL choose the default pair only from runs by the same ghost on the same mission (the newest run that has such a partner as after, and its newest same-ghost partner as before), and WHEN no such pair exists but runs exist THEN the system SHALL use the newest run as the before run and show "No after run yet for [that run's ghost name]"

2.4 WHEN the before and after runs are by different ghosts THEN the system SHALL NOT render the status table or any "Exorcised", "Still haunting", "New haunting", or "Not reached" labels for that pair

2.5 WHEN a URL `#/exorcise/:beforeKey/:afterKey` names two runs of the same mission by different ghosts THEN the system SHALL show the before run, keep both pickers usable, show a plain message stating that the runs are by different ghosts and cannot be compared, and limit the after picker to the before ghost's runs of that mission (or show "No after run yet for [before ghost name]" if there are none)

2.6 WHEN the user selects a before run in the Before picker THEN the system SHALL accept any run, and SHALL set the after run to the newest same-ghost, same-mission run, or show "No after run yet for [ghost name]" if there is none

2.7 WHEN the "No after run yet" or different-ghosts message is shown THEN the system SHALL convey it in text (not by color alone) and SHALL NOT use the failure red for it

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the before and after runs are by the same ghost on the same mission THEN the system SHALL CONTINUE TO match findings as a multiset by (type, page of the finding's step) and label them "Exorcised", "Still haunting", or "New haunting" exactly as before

3.2 WHEN a before finding has no match and the same-ghost after run has no step on that finding's page THEN the system SHALL CONTINUE TO label it "Not reached" with the note that the ghost never got as far as that page

3.3 WHEN a URL names two runs with different mission.id values THEN the system SHALL CONTINUE TO show "These runs are different missions, so there is nothing to compare."

3.4 WHEN a URL names a run key that does not exist THEN the system SHALL CONTINUE TO show the unknown-run screen

3.5 WHEN there are no runs at all THEN the system SHALL CONTINUE TO show the existing empty-state message instead of pickers

3.6 WHEN a same-ghost comparison is shown THEN the system SHALL CONTINUE TO show the Before and After run summaries (ghost badge, result badge, goal, finding count, Ghost Cam link, provenance panel) and the "What changed" table, or "Neither run found any problems." when both runs have no findings

3.7 WHEN the user changes a picker THEN the system SHALL CONTINUE TO update the URL to `#/exorcise/:beforeKey/:afterKey` using replace navigation

3.8 WHEN Exorcise statuses are shown THEN the system SHALL CONTINUE TO show each status with text plus an icon, and use the failure red only for "New haunting"

3.9 WHEN the rows for a same-ghost pair are computed THEN the system SHALL CONTINUE TO include every before finding exactly once and every after finding exactly once (Property 5, Exorcise rows partition findings)
