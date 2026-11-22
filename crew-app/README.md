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
cd ../crew-app && npm install && npm run build
```

Run one patrol by hand: `npm run patrol` in `crew-app/`. Run the tests with `npm test` and the type
check with `npm run typecheck`.

## Environment variables

- `HAUNT_REPO_ROOT`: the repository root. Needed when the app runs from an installed copy. Otherwise
  the root is found from the script's own location.
- `HAUNT_DASHBOARD_URL`: where the Haunt dashboard runs. Default `http://localhost:3001`.
- `HAUNT_CREW_PROXY_SECRET`: the secret the backend uses to verify the `X-Crew-Proxy` header.

## Runs in the dashboard

The page links to `<dashboard>/#/run/<runId>`. A run that does not appear there needs its run list
refreshed: run `npm run collect-runs` in `dashboard/`. The app never runs that command.

## Protection check

`npm run check:protected` fails when `git diff --name-only` lists a file under `engine/`,
`dashboard/`, `demo-site/` or `demo-site-exorcised/`. It only sees unstaged changes to tracked files.
Staged and untracked files are not listed.

## Unverified facts

- Crew proxy signing (design risk 8): the source of the secret, which bytes are signed, the
  timestamp tolerance, and the status code the gateway returns when its own signing fails are
  assumptions. They live in `src/backend/crewProxyConfig.ts`. Re-check them against the Crew docs or
  a real gateway request before relying on them.
- The dashboard port (design risk 10) belongs to the dashboard team. Haunt Patrol does not edit
  `dashboard/`. If the dashboard serves on another port, set `HAUNT_DASHBOARD_URL`.
- The cron `command` fields, the Node backend type, and the working directory the gateway gives a
  cron command (design risks 1 to 5) are pinned by `test/manifest.test.ts`. Re-check them against
  the Manifest reference or a `kirocrew app` install before changing the expected values.
