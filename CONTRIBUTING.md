# Contributing to Haunt

Issues and pull requests are welcome. Three rules apply to every change:

1. **Keep the planted problems planted.** `demo-site/` (Lantern Bills) keeps its six deliberate problems. They are the teaching examples the ghosts find, and tests guard them. Fix a problem only in `demo-site-exorcised/`, and only through a bugfix spec that names it.
2. **Never weaken a test to make a ghost pass.** If a ghost gets stuck, that is information about a real barrier. Fix the site, not the test.
3. **Only point ghosts at sites you own.** Run them on your own sites or on local copies of open-source sites, never on someone else's production site.

Also: never edit anything in `runs/`, which holds the recorded evidence. For trial runs, use `--out` with a folder outside the repository (see [Run a ghost](README.md#run-a-ghost)).

The decisions behind the code are written down as Kiro specs in [`.kiro/specs/`](.kiro/specs). Read the spec for the part you change, and run `npm test` in each folder you touch.
