---
name: reading-patrols
description: How to read Haunt Patrol records and summaries. Read-only.
triggers: [patrol, haunt patrol, ghost results]
always: false
---

# Reading patrols

Use this skill to explain what the nightly Haunt Patrol found.

## Where the data lives

- `crew-app/data/patrols/<YYYY-MM-DD>.json` is one night's Patrol_Record (date in IST).
- `crew-app/data/patrols/latest.json` is a copy of the newest record.
- `crew-app/data/patrols/summary.md` is the plain-text summary of the newest patrol.

## The record

- `date`, `seed` (the same number goes to all three ghosts) and `interrupted`.
- `ghosts` has three entries: `listener`, `phantom` and `bebe`. Each has a `result`
  (`succeeded`, `gave_up`, `error` or `no_run`), the engine `exitCode`, a `runId`, and `findings`
  (each with a `type`, a `step` and a `title`).
- `no_run` means the ghost did not save a run that night. It does not mean the page is fine.

## New, fixed and unchanged

A finding is identified by its ghost, its type and its title. Compared with the previous night, a
finding that appears only tonight is **new**, one that appears only in the previous night is **fixed**,
and one in both is **unchanged**. If a ghost had no saved run tonight, its earlier findings are
listed as **not checked tonight**, never as fixed.

## The ghosts

- **The Listener** moves through the page with the keyboard and listens to a screen reader.
- **The Phantom** browses on slow 3G and an old phone.
- **Bebe** reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording.

Each one stands for real people with real needs. Describe a finding as a barrier a person met, and
never as a fault of the person.

## Rules

Only read operations are allowed: read, list and search. Never write, delete or run anything.
