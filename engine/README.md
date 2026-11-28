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

Run the `haunt` npm script in `engine/`. Everything after `--` goes to the CLI. Don't use `npx haunt`: an unrelated package called `haunt` is on the npm registry, and outside `engine/` npx downloads and runs that one.

```powershell
npm run haunt -- run --ghost <listener|phantom|bebe> --mission <id> --url <url> [--out <dir>] [--site <key>] [--site-name <text>] [--seed <int>] [--headed] [--config <file>] [--missions <dir>]
```

Example:

```powershell
npm run haunt -- run --ghost listener --mission pay-bill --url http://localhost:3000
```

| Option | Meaning |
| --- | --- |
| `--ghost <name>` | Which ghost to send: `listener`, `phantom` or `bebe` (required). |
| `--mission <id>` | The mission to attempt, for example `pay-bill` (required). |
| `--url <url>` | The page to open (required). Only `localhost`, `127.0.0.1` and `allowedDomains` are accepted. |
| `--out <dir>` | Where run folders go, resolved against the current folder (`engine/`, because npm runs the script there). Default: the `runs/` folder at the repository root, whichever folder you run from. |
| `--mind <scripted\|ai>` | What chooses the actions. `scripted` (the default) follows a fixed walk. `ai` is for The Listener only and needs the Kiro CLI (see below). |
| `--site <key>` | Site key to use instead of the mission's own. Must be in `haunt.config.json`. |
| `--site-name <text>` | Name written to `site.name` in the run file. Default: the site's name in `haunt.config.json`. The run folder does not change. To record a fixed copy so the dashboard pairs it with the original, add ` (exorcised)`, for example `--site-name "Lantern Bills demo (exorcised)"`. |
| `--seed <int>` | Seed for the visual ghosts' timing jitter. Default: random, and printed. |
| `--headed` | Show the browser window. |
| `--config <file>` | Use this config file instead of `engine/haunt.config.json`. |
| `--missions <dir>` | Read missions from this folder instead of `engine/missions`. |
| `-h`, `--help` | Show the usage text. |

For The Phantom's timing to match the recorded runs, serve Lantern Bills as a production build, not the dev server. The dev server is too slow for The Phantom's slow-3G walk, and it gives up at step 1. In `demo-site/` run `npm run serve:ghosts`; it builds the site and serves it on port 3000. For the fixed copy, run the same script in `demo-site-exorcised/`; it serves on port 3002.

By default a run is saved into `runs/`, the folder of recorded evidence. The dashboard's data tests read it, so a trial run there can make some of them fail. For trial runs, add `--out` with a folder outside the repository, for example `--out ../../haunt-trials`.

The last line printed on standard output is the absolute path of the saved `run.json`. (npm prints a short header first; add `--silent` before `--` to hide it, as in `npm run --silent haunt -- run ...`.)

## The AI mind, Kiro and haunt-mcp

`--mind ai` replaces The Listener's scripted walk with a Kiro custom agent. The engine starts `kiro-cli chat --agent listener --no-interactive`. The agent is `.kiro/agents/listener.json`, and its only tools come from **haunt-mcp**, an MCP server in `src/mcp/server.ts` started by `bin/haunt-mcp.mjs`. It has seven tools: `read_page`, `read_announcements`, `press_key`, `type_text`, `jump`, `think` and `finish`. The agent chooses actions and writes one thought per step. It cannot create findings. The same detectors as the scripted walk decide them.

```powershell
npm run haunt -- run --ghost listener --mind ai --mission pay-bill --url http://localhost:3000
```

This needs the Kiro CLI, signed in to a Kiro account. If `kiro-cli` is not on your `PATH`, set `KIRO_CLI_PATH` to the full path of `kiro-cli.exe` first (`$env:KIRO_CLI_PATH = "$env:LOCALAPPDATA\Kiro-Cli\kiro-cli.exe"`). `HAUNT_AI_TIMEOUT_MS` changes the 10-minute limit. Each AI run uses Kiro credits, and the engine prints them when Kiro reports them.

## Memos

The `write-note` mission runs on a local copy of [Memos](https://github.com/usememos/memos), an open-source notes site that Haunt did not build. Start Memos yourself on port 5230 and create the throwaway account named in `missions/write-note.json`. Haunt never starts Memos. Then:

```powershell
npm run haunt -- run --ghost listener --mission write-note --url http://localhost:5230
```

Add `--mind ai` for the AI mind.

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
