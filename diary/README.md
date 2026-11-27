# Diary

**Owners:** Ghost Builder & House Builder

Short notes on what we decided while building Haunt for the Kiroween 2026 hackathon, and why.

- **Ghosts only visit our own sites.** Lantern Bills is ours, and Memos runs as a local copy. We never point a ghost at someone else's production site.
- **A stuck ghost is a result.** When a ghost gives up, the run is saved and the dashboard shows where. We never weaken a test or loosen a mission to make a ghost pass.
- **Recorded runs are evidence.** Nothing edits `runs/` after a run is saved. When a screen needs to say something differently, the dashboard changes how it shows the run, not the file.
- **The detectors decide findings.** Even with the AI mind, the agent has no tool that creates a finding. Only the engine's detectors do.
- **The planted problems stay planted.** `demo-site/` keeps all six. `demo-site-exorcised/` is where bugfix specs fix them.
- **The ghosts found 5 of the 6.** Problem 3, card errors that are never announced, was never reached, because the `pay-bill` mission pays with a valid card. We report that number as it is.

The specs under `.kiro/specs/` hold the full requirements, designs and task lists behind each decision.
