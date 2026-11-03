# Run Format Specification

This document explains the structure of test run JSON files that the Ghost Builder writes and the House Builder reads.

## Top-Level Fields

**formatVersion** (number)  
The version of this JSON format. Currently `1`. Allows the dashboard to handle format changes gracefully.

**runId** (string)  
A unique identifier for this test run, typically formatted as `YYYY-MM-DD-ghost-mission`. Example: `2026-11-20-listener-pay-bill`

**ghost** (string)  
The name of the accessibility persona that performed this test. Example: `listener` for a screen reader user.

**mission** (object)  
Describes what the ghost was trying to accomplish:
- **id** (string) - Short identifier for the mission (e.g., `pay-bill`)
- **goal** (string) - Human-readable description of what the user wants to do
- **requirement** (string) - Formal requirement in WHEN/SHALL format describing expected behavior
- **successCheck** (string) - Concrete success criteria the ghost looks for

**site** (object)  
Information about the website being tested:
- **name** (string) - Human-friendly name of the site
- **url** (string) - Base URL where the site is running
- **commit** (string) - Git commit hash of the site version being tested

**startedAt** (string)  
ISO 8601 timestamp when the test run began. Example: `2026-11-20T00:00:05Z`

**result** (string)  
The outcome of the test run. Possible values:
- `gave_up` - The ghost could not complete the mission
- `success` - The mission was completed successfully
- `error` - A technical error prevented completion

## Steps Array

A chronological list of interactions the ghost performed. Each step contains:

**n** (number)  
Step number, starting from 1.

**page** (string)  
The URL path where this step occurred. Example: `/bill`

**action** (string)  
The keyboard or interaction action taken. Examples: `Tab`, `Enter`, `Space`, `ArrowDown`

**spoken** (string)  
What the screen reader announced to the ghost at this moment. This is what a blind user would hear.

**thought** (string)  
The ghost's internal reasoning about what it's trying to do.

**screenshot** (string)  
Relative path to a screenshot image showing the page state. Example: `shots/001.png`

**focusBox** (object, optional)  
Coordinates of the focused element's bounding box:
- **x** (number) - Left edge position
- **y** (number) - Top edge position
- **w** (number) - Width
- **h** (number) - Height

**waitMs** (number)  
How many milliseconds the ghost waited after this action before continuing.

## Findings Array

Accessibility issues discovered during the test. Each finding contains:

**type** (string)  
Category of the issue. Examples: `unlabeled_button`, `missing_alt`, `keyboard_trap`, `poor_contrast`

**step** (number)  
Which step number revealed this issue.

**title** (string)  
A short, clear description of the problem.

**evidence** (string)  
What the ghost observed that proves the issue exists.

**screenshot** (string)  
Path to a screenshot showing the problem.

---

This format allows the dashboard to replay the ghost's journey, understand what went wrong, and help developers fix accessibility barriers.
