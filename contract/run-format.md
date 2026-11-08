# Run Format Specification

This document explains the structure of test run JSON files that the Ghost Builder writes and the House Builder reads.

## Top-Level Fields

**formatVersion** (number)  
The version of this JSON format. Currently `1`. Allows the dashboard to handle format changes gracefully.

**runId** (string)  
A unique identifier for this test run, typically formatted as `YYYY-MM-DD-ghost-mission`. Example: `2026-11-20-listener-pay-bill`

**ghost** (string)  
The accessibility persona that performed this test. Exactly one of:
- `listener` - The Listener, who uses only a screen reader and the keyboard
- `phantom` - The Phantom, who browses on slow 3G with an old phone
- `bebe` - Bebe, who uses 200% zoom, reads Punjabi or Hindi, and is wary of tricky wording

Any other value is invalid.

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
The outcome of the test run. Exactly one of:
- `succeeded` - The mission was completed successfully
- `gave_up` - The ghost could not complete the mission
- `error` - A technical error prevented completion

Any other value is invalid.

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
Category of the issue. Exactly one of:
- `unlabeled_button` - A button with no accessible name
- `focus_trap` - Keyboard focus cannot leave an area
- `unannounced_error` - An error message is shown but not announced to a screen reader
- `slow_wait` - The ghost had to wait too long for the page to respond
- `misclick` - The ghost activated the wrong element, for example after a layout shift
- `cut_off_text` - Text is clipped and cannot be read, for example at 200% zoom
- `untranslated` - Text is not available in the user's language
- `dark_pattern` - Wording or design that pushes the user into a choice they didn't intend

Any other value is invalid.

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
