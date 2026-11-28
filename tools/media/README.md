# Media capture

Records the Devpost videos and gallery screenshots with Playwright. Everything is saved to
`media/` at the repo root, which git ignores.

## Setup (once)

```
cd tools/media
npm install
npx playwright install chromium
```

## Run

Start both sites first, each in its own terminal:

```
cd dashboard && npm run dev      # http://localhost:3001
cd demo-site && npm run dev      # http://localhost:3000
```

Then, from `tools/media`:

```
npm run capture     # screenshots, then videos
npm run shots       # screenshots only
npm run videos      # videos only
npx tsx capture.ts --hero   # only the README picture, docs/media/hero-ghostcam-trap.png (1600x900)
npm run typecheck
```

Other addresses: set `DASHBOARD_URL` and `LANTERN_URL` (for example
`DASHBOARD_URL=http://localhost:3001/haunt/` for `vite preview`).

## What it makes

The script reads `runs/index.json` from the dashboard and uses the newest real run (not a sample)
of each ghost on the original site. Runs on a site whose name ends in ` (exorcised)` are skipped:
those are the fixed copy's after-runs, which only the Exorcise screenshot shows. The Listener's
trap step is the step of its `focus_trap` finding.

| File | What |
| --- | --- |
| `ghostcam-listener-to-trap.webm` | Ghost Cam playing The Listener from step 1 to the trap, transcript beside it |
| `ghostcam-phantom.webm` | Ghost Cam playing The Phantom's run |
| `ghostcam-bebe.webm` | Ghost Cam playing Bebe's run |
| `lantern-bills-banner-jump.webm` | Lantern Bills loading and reloading twice; the late banner pushes the page down |
| `dashboard-home.png` | Home |
| `dashboard-ghostcam-listener-trap.png` | Ghost Cam at The Listener's trap step |
| `dashboard-graveyard.png` | Graveyard |
| `dashboard-exorcise.png` | Exorcise |
| `dashboard-spec-coverage.png` | Spec Coverage |
| `lantern-bills-en.png`, `lantern-bills-pa.png` | Lantern Bills in English and Punjabi (`?lang=`) |

All are 1920x1080. Videos are WebM and start with a moment of blank page while the first load
happens; trim it in your editor if needed.
