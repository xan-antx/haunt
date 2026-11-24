# Haunt Patrol

Haunt Patrol is a Kiro Crew app. Every night at midnight IST it builds and serves Lantern Bills on
port 3000, sends the three ghosts (The Listener, The Phantom and Bebe) through the pay-bill mission
with the engine's scripted mind, stops the site, and writes a record and a plain-text summary that
compares the night with the one before. A Crew page shows the latest patrol with a link to open each
run in the Haunt dashboard. No AI model is called.

Ghosts only visit our own local copy of Lantern Bills.

## Skipped nights

If the Crew gateway is not running, or the machine is off or asleep at midnight IST, that night is
skipped. There is no catch-up run.

## Exit codes

The patrol script exits with one of these codes:

| Code | Meaning |
|---|---|
| 0 | At least one ghost saved a run. A ghost that gave up is a finding, not a failure. |
| 1 | A prerequisite is missing. |
| 2 | The site did not start. |
| 3 | The site started but no ghost saved a run. |
| 4 | The patrol crashed: an exception escaped, or the record could not be written. |

Patrol exit code 3 is not the engine's exit code 3 (a ghost's run saved with result `error`). The
engine's code is only stored in the record. The patrol's code is only the process exit status.

## Setup

```
cd engine && npm install && npx playwright install chromium
cd ../demo-site && npm install
cd ../crew-app && npm install
```

`ui/dist/index.mjs` is a committed build artifact. A Crew install copies the app folder and builds
nothing, so rebuild it with `npm run build` in `crew-app/` and commit it whenever `ui/src/` changes.

Run one patrol by hand: `npm run patrol` in `crew-app/`. Run the tests with `npm test` and the type
check with `npm run typecheck`. To install the app in the Kiro Crew desktop app on Windows, follow
`INSTALL-WINDOWS.md`.

## How Crew runs it

- **Schedule.** The `nightly-patrol` cron is a script cron: Crew calls `run` in
  `cron/nightly_patrol.py`, which starts `node src/patrol.ts` and makes no model call. Crew refuses
  `command` crons on native Windows, so a plain command cron is not an option there.
- **Page and backend.** The page calls the backend through the gateway at
  `/apps/haunt-patrol/api/latest` and `/apps/haunt-patrol/api/summary`; the backend receives them as
  `/api/latest` and `/api/summary`. The gateway's health probe calls `/health` directly. If the backend
  is down, the page reads the static copies in `ui/dist/data/`.
- **Data.** Records are written to `data/patrols/` inside the app folder. In the repository that is
  `crew-app/data/patrols/`; in an installed copy it is `~/.kiro/crew/apps/haunt-patrol/data/patrols/`.
  The runner and the backend both find it from their own file location.

## Environment variables

- `HAUNT_REPO_ROOT`: the repository root (the folder with `engine/` and `demo-site/`). Required when
  the app runs from an installed copy, which has no repository next to it. When the app runs from the
  repository, the folder above `crew-app/` is used.
- `HAUNT_DASHBOARD_URL`: where the Haunt dashboard runs. Default `http://localhost:3001`.
- `KIROCREW_PROXY_SECRET`: set by the Crew gateway for the backend process. The backend uses it to
  verify the `X-KiroCrew-Proxy` header. Nobody sets it by hand.

## Runs in the dashboard

The page links to `<dashboard>/#/run/<runId>`. A run that does not appear there needs its run list
refreshed: run `npm run collect-runs` in `dashboard/`. The app never runs that command.

## Protection check

`npm run check:protected` fails when `git diff --name-only` lists a file under `engine/`,
`dashboard/`, `demo-site/` or `demo-site-exorcised/`. It only sees unstaged changes to tracked files.
Staged and untracked files are not listed.

## Checked against the Crew docs

The manifest, cron, backend, proxy signing and UI build were checked on 2026-11-23 against
kiro.dev/docs/crew/apps (overview, manifest reference, build your first app, publishing) and
`docs/app-kit/` plus `docs/guides/windows-install.md` in the kirodotdev/KiroCrew repository.
`test/manifest.test.ts`, `test/crewProxy.test.ts` and `test/uiConfig.test.ts` pin the results.

## Unverified facts

- Script cron details: the docs show the callable taking one `ctx` argument but do not say what a
  returned value or a raised exception does. The shim returns the summary text and raises on a
  non-zero patrol exit code, expecting the run to be marked as failed.
- Whether a script cron sees environment variables the gateway inherited, such as a user-level
  `HAUNT_REPO_ROOT`. `INSTALL-WINDOWS.md` sets it as a user variable and restarts Crew.
- Whether `useAppApi()` reaches the app's own `/apps/haunt-patrol/api/` proxy path once it is listed
  in `permissions.api`. If it does not, the page falls back to the static files.
- The status code the gateway returns when its own signing step fails. Nothing relies on it.
- The dashboard port (design risk 10) belongs to the dashboard team. Haunt Patrol does not edit
  `dashboard/`. If the dashboard serves on another port, set `HAUNT_DASHBOARD_URL`.
