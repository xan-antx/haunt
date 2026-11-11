# Engine

**Owner:** Ghost Builder

The engine sends a ghost (The Listener, The Phantom or Bebe) through a mission on a website and writes a `run.json` folder that the dashboard reads. All commands below are PowerShell, run from `engine/` unless noted.

## Install

Needs Node.js 24 or newer.

```powershell
npm install
npx playwright install chromium
```

## Run a ghost

```powershell
npx haunt run --ghost <listener|phantom|bebe> --mission <id> --url <url> [--out <dir>] [--site <key>] [--seed <int>] [--headed] [--config <file>] [--missions <dir>]
```

Example:

```powershell
npx haunt run --ghost listener --mission pay-bill --url http://localhost:3000
```

| Option | Meaning |
| --- | --- |
| `--ghost <name>` | Which ghost to send: `listener`, `phantom` or `bebe` (required). |
| `--mission <id>` | The mission to attempt, for example `pay-bill` (required). |
| `--url <url>` | The page to open (required). Only `localhost`, `127.0.0.1` and `allowedDomains` are accepted. |
| `--out <dir>` | Where run folders go, resolved against the current folder. Default: `runs/` at the repository root. |
| `--site <key>` | Site key to use instead of the mission's own. Must be in `haunt.config.json`. |
| `--seed <int>` | Seed for the visual ghosts' timing jitter. Default: random, and printed. |
| `--headed` | Show the browser window. |
| `--config <file>` | Use this config file instead of `engine/haunt.config.json`. |
| `--missions <dir>` | Read missions from this folder instead of `engine/missions`. |
| `-h`, `--help` | Show the usage text. |

The last line printed on standard output is the absolute path of the saved `run.json`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The ghost succeeded or gave up, and the run was saved. |
| 1 | Invalid run, Chromium missing, or the page did not open. |
| 2 | Bad arguments, config, mission, site, address or output folder. |
| 3 | Result error. The run was saved. |
| 130 | Interrupted with Ctrl+C. Nothing was written. |

## Safety rules

- Ghosts only visit `localhost`, `127.0.0.1` and domains listed in `allowedDomains` in the config. Any other address is refused with exit code 2 before a browser starts.
- Ghosts do not test third-party production sites.
- Tests never write into the repository's `runs/` folder. Under the test runner (`HAUNT_UNDER_TEST=1`) the CLI refuses it; use `--out test-output/...`.
- Nothing is weakened to make a run pass. A ghost that gets stuck is a finding.

## Tests

```powershell
npm run build            # type check (tsc --noEmit)
npm test                 # unit and property tests
npm run test:properties  # property tests only
npm run test:e2e         # all three ghosts against Lantern Bills (slow)
npm run test:e2e:listener
npm run test:e2e:phantom
npm run test:e2e:bebe
```

The end-to-end tests start Lantern Bills on port 3000 and write to `test-output/e2e/`.

## Demos

```powershell
npm run demo       # The Listener, into test-output/demo-run/
npm run demo:all   # The Listener, The Phantom and Bebe (seed 1), into test-output/demo-runs/
```

Each demo starts Lantern Bills on port 3000, checks every `run.json` against the Run_Schema, prints each absolute path, and stops the server.
