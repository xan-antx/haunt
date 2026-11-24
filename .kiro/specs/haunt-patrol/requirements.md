# Requirements Document

## Introduction

Haunt Patrol is a Kiro Crew app in `crew-app/` (`app.json`, `agents/`, `skills/`, `ui/`, per the Crew App Kit format). Every night at midnight IST, a scheduled plain-script job starts the Lantern Bills demo site, runs the three ghosts (listener, phantom, bebe) through the pay-bill mission with the engine's `haunt run` command, and stops the site. The job then builds a plain-code summary comparing the night's results with the previous night. A single UI page lists the latest patrol results with a link to open each run in the Haunt dashboard.

The patrol makes no AI calls. The `haunt run` command always uses the scripted mind, and the patrol never uses the `haunt-mcp` or AI path. The patrol does not change `engine/`, `dashboard/`, `demo-site/` or `demo-site-exorcised/`, and an automated check enforces this.

Out of scope: auto-fix, notifications, AI analysis, the exorcise flow, other sites, and `demo-site-exorcised/`.

## Glossary

- **Patrol_App**: The Crew App in `crew-app/` named `haunt-patrol`.
- **Manifest**: The file `crew-app/app.json` that declares the Patrol_App.
- **Patrol_Job**: The scheduled model-free script cron job that performs one nightly patrol.
- **Cron_Shim**: The Python file `crew-app/cron/nightly_patrol.py` whose `run` callable the Patrol_Job calls. It only starts the Patrol_Runner with Node.js.
- **App_Root**: The folder that holds the Manifest: `crew-app/` in the repository, or the installed copy `~/.kiro/crew/apps/haunt-patrol/`.
- **UI_Bundle**: The committed build artifact `crew-app/ui/dist/index.mjs`.
- **Patrol_Runner**: The TypeScript script the Patrol_Job executes.
- **Site_Controller**: The Patrol_Runner component that builds, starts, checks and stops Lantern Bills.
- **Lantern_Bills**: The demo site built from `demo-site/`, served at `http://localhost:3000`.
- **Ghost**: One of the three synthetic users: `listener`, `phantom` or `bebe`.
- **Haunt_Command**: `node engine/bin/haunt.mjs run --ghost <ghost> --mission pay-bill --url http://localhost:3000 --out <runsDir> [--seed N]`.
- **Runs_Dir**: The repository `runs/` directory.
- **Run_File**: The `run.json` file at `<Runs_Dir>/lantern-bills/<runId>/run.json`.
- **Run_Result**: The `result` field of a Run_File: `succeeded`, `gave_up` or `error`.
- **Saved_Run**: A Ghost entry in a Patrol_Record whose Run_Result is `succeeded`, `gave_up` or `error` (any value other than `no_run`).
- **Finding**: An entry in the `findings[]` array of a Run_File, having `type`, `step` and `title`.
- **Patrol_Record**: The JSON file `data/patrols/<IST-date>.json` under the App_Root (`crew-app/data/patrols/` in the repository) describing one patrol.
- **Latest_Record**: The file `data/patrols/latest.json` under the App_Root, a copy of the newest Patrol_Record.
- **Patrol_Summary**: The text produced by the Summary_Builder, saved as `data/patrols/summary.md` under the App_Root.
- **Summary_Builder**: The plain-code module that compares a Patrol_Record with the previous Patrol_Record.
- **Finding_Key**: The tuple of Ghost, Finding `type` and Finding `title`.
- **Patrol_Page**: The UI page at `/apps/haunt-patrol`, built with `@kirocrew/app-sdk`.
- **Patrol_Backend**: The small read-only Node backend that serves Patrol_Record data to the Patrol_Page under the gateway path `/apps/haunt-patrol/api/*`. The gateway forwards `/apps/haunt-patrol/api/<path>` to the backend as `/api/<path>`, so the backend routes are `/api/latest` and `/api/summary`; `/health` is polled directly.
- **Static_Fallback**: The static JSON files holding the `/api/latest` and `/api/summary` response bodies, written by the Patrol_Runner.
- **Crew_Proxy_Header**: The request header `X-KiroCrew-Proxy`, with value `<timestamp>:<hmac-sha256>`, that the Kiro Crew gateway adds to each proxied request.
- **Dashboard**: The Haunt dashboard in `dashboard/`.
- **Dashboard_Base_URL**: The value of the `HAUNT_DASHBOARD_URL` environment variable, or `http://localhost:3001` when unset. The Dashboard serves on port 3001 through `server.port` and `preview.port` in `dashboard/vite.config.ts`.
- **Patrol_Guide**: The explanation-only agent `patrol-guide` in `crew-app/agents/`.
- **Reading_Patrols_Skill**: The read-only skill `reading-patrols` in `crew-app/skills/`.
- **Patrol_README**: The file `crew-app/README.md`.
- **Protected_Folders**: The folders `engine/`, `dashboard/`, `demo-site/` and `demo-site-exorcised/`.
- **Protection_Check**: The automated check, run by one npm script in `crew-app/`, that detects changes under the Protected_Folders.
- **IST**: Indian Standard Time, timezone `Asia/Kolkata`.
- **Seed**: The integer passed to `--seed`, derived from the IST date.

## Documented and Unverified Facts

The Crew documentation at kiro.dev/docs/crew/apps documents that the Kiro Crew gateway proxies `/apps/{name}/api/*` to the app backend and signs each proxied request with the Crew_Proxy_Header.

Confirmed on 2026-11-23 against `docs/app-kit/api-reference.md` in the kirodotdev/KiroCrew repository (kiro.dev still names the header `X-Crew-Proxy`; the repository reference and its Node.js verifier use `X-KiroCrew-Proxy`):

- The signing secret reaches the backend process in the environment variable `KIROCREW_PROXY_SECRET`.
- The signed message is `timestamp:method:/api/path[?query]:sha256(body)`, keyed with the app secret, where the target is the raw request-target and `sha256(body)` is the lowercase hex digest of the raw body.
- The timestamp is Unix seconds and must be within 60 seconds of now.

Still unverified: the status code the gateway itself returns on signature failure. Nothing relies on it.

Also confirmed against the Crew docs: command crons are refused on native Windows (`docs/guides/windows-install.md`), `setup` scripts run through `/bin/bash` and only for registry installs, `setup.onUpdate` is never executed, an install copies the app folder without building it, and the `platform.os` default leaves Windows out.

The 401 status code the Patrol_Backend returns for a missing or invalid Crew_Proxy_Header is a project choice, not a documented value.

## Requirements

### Requirement 1: App manifest and structure

**User Story:** As a Haunt maintainer, I want the patrol packaged as a Crew App, so that Kiro Crew can install and run the schedule and page.

#### Acceptance Criteria

1. THE Manifest SHALL declare name `haunt-patrol`, version `0.1.0` and displayName `Haunt Patrol`.
2. THE Manifest SHALL declare `permissions.network` as `false`.
3. THE Manifest SHALL declare `permissions.cron` as `true`.
4. THE Patrol_App SHALL contain the directories `agents/`, `skills/` and `ui/` alongside the Manifest, following the Crew App Kit format.
5. THE Patrol_App SHALL use TypeScript in strict mode and vitest for tests.
6. THE Patrol_App SHALL require Node.js version 24 or later, matching the engine requirement.
7. THE Patrol_App SHALL leave every file under the Protected_Folders unchanged, as enforced by the Protection_Check defined in Requirement 13.
8. THE Patrol_App SHALL write every relative import in `crew-app/` TypeScript source with an explicit `.ts` file extension, so that Node 24 type stripping runs the files directly.
9. THE `crew-app/tsconfig.json` SHALL set `allowImportingTsExtensions` to `true`, `noEmit` to `true` and `strict` to `true`, and SHALL configure the Node scripts.
10. THE Patrol_App SHALL provide a separate UI tsconfig for `crew-app/ui/` that sets `jsx`, includes the DOM library, uses bundler module resolution and sets `strict` to `true`.
11. THE `crew-app/package.json` SHALL set `"type"` to `"module"`.
12. THE Manifest SHALL declare `platform.os` as `["macos", "linux", "windows"]`.
13. THE Manifest SHALL declare no `setup` scripts, because an install copies the App_Root without building it.
14. THE Patrol_App SHALL commit the UI_Bundle, and the repository `.gitignore` SHALL NOT exclude it.
15. THE UI_Bundle SHALL keep `react`, `react-dom`, `react/jsx-runtime`, `lucide-react` and `@kirocrew/app-sdk` (including its subpaths) as external imports, provided by the Crew dashboard at run time.
16. THE Manifest SHALL declare `permissions.api` as `["/apps/haunt-patrol/api"]`, so that the Patrol_Page may call the Patrol_Backend through `useAppApi`.

### Requirement 2: Nightly schedule

**User Story:** As a Haunt maintainer, I want a patrol every night at midnight IST, so that new accessibility barriers show up the next morning.

#### Acceptance Criteria

1. THE Manifest SHALL declare the Patrol_Job with `cron_expr` `0 0 * * *` and timezone `Asia/Kolkata`.
2. THE Manifest SHALL declare the Patrol_Job with `strict_schedule` set to `true`.
3. THE Manifest SHALL declare the Patrol_Job as a model-free script cron, with `script` set to `cron/nightly_patrol.py:run` and without `command`, `message` or `agent` fields.
4. THE Manifest SHALL declare the Patrol_Job with a timeout of 900 seconds and `timeout_secs` of at least 905.
5. WHEN the Patrol_Job fires, THE Patrol_Runner SHALL perform one patrol and print the Patrol_Summary to standard output.
6. IF the Kiro Crew gateway is not running or the machine is asleep at midnight IST, THEN THE Patrol_App SHALL skip that night without catch-up runs.
7. THE Patrol_README SHALL state that the night is skipped with no catch-up when the gateway is off or the machine is off or asleep at midnight IST.
8. THE Cron_Shim SHALL use only the Python standard library, run `node src/patrol.ts` from the App_Root without a shell, take the repository root from `HAUNT_REPO_ROOT` or the folder above the App_Root, stop the runner before the cron timeout, and raise an error when the Patrol_Runner exits with a non-zero code.

### Requirement 3: Site lifecycle

**User Story:** As a Haunt maintainer, I want the patrol to start and stop Lantern Bills itself, so that no manual setup is needed each night.

#### Acceptance Criteria

1. WHEN a patrol starts, THE Site_Controller SHALL build `demo-site/` with Vite, passing `--outDir` set to the absolute path of `crew-app/.patrol/site-build` resolved from the repository root, so that the Vite build writes no file inside `demo-site/` or any other Protected_Folder.
2. WHEN the build succeeds, THE Site_Controller SHALL serve the build with `vite preview` on `localhost:3000` with a strict port.
3. THE Site_Controller SHALL spawn child processes without a shell.
4. WHEN the preview process is spawned, THE Site_Controller SHALL poll `http://localhost:3000` until the page title contains `Lantern Bills`.
5. IF the page title does not contain `Lantern Bills` within the readiness deadline, THEN THE Site_Controller SHALL report the site as not started.
6. IF another process already holds port 3000 before the preview starts, THEN THE Site_Controller SHALL refuse to start and report the port conflict.
7. WHEN the platform is Windows, THE Site_Controller SHALL stop the preview process tree with `taskkill /T /F`.
8. WHEN the platform is not Windows, THE Site_Controller SHALL stop the preview process with `SIGKILL`.
9. WHEN the site was started, THE Patrol_Runner SHALL stop the site in a `finally` block, whether the ghosts succeeded, failed or threw errors.
10. THE Site_Controller SHALL contain its own copy of the lifecycle logic and import nothing from `dashboard/scripts/liveGhost.ts`.
11. IF the build fails, the port is in conflict, or the page title check times out, THEN THE Site_Controller SHALL report the site as not started with the reason.

### Requirement 4: Running the ghosts

**User Story:** As a Haunt maintainer, I want all three ghosts to visit the site with the scripted mind, so that results are repeatable and cost nothing.

#### Acceptance Criteria

1. WHEN the site is ready, THE Patrol_Runner SHALL run the Ghosts sequentially in the order listener, phantom, bebe.
2. THE Patrol_Runner SHALL run each Ghost by executing the Haunt_Command with `--mission pay-bill`, `--url http://localhost:3000` and `--out` set to the Runs_Dir.
3. THE Patrol_Runner SHALL pass the same Seed to all three Ghosts, derived from the IST date, and record the Seed in the Patrol_Record.
4. THE Patrol_Runner SHALL execute no AI model calls and SHALL NOT invoke `haunt-mcp`.
5. WHEN a Haunt_Command exits with code 0, THE Patrol_Runner SHALL take the last standard output line that is an absolute path ending in `run.json` as the Run_File path and record the run as saved.
6. WHEN a Haunt_Command exits with code 3, THE Patrol_Runner SHALL record the run as saved with an error and take the last standard output line that is an absolute path ending in `run.json` as the Run_File path.
7. IF a Haunt_Command exits with code 1 or 2, THEN THE Patrol_Runner SHALL record the Ghost as having no saved run, together with the exit code and the error text.
8. IF a Haunt_Command exits with code 130, THEN THE Patrol_Runner SHALL record the Ghost as interrupted and stop running further Ghosts.
9. IF a Ghost's Haunt_Command fails, THEN THE Patrol_Runner SHALL continue with the remaining Ghosts.
10. THE Patrol_Runner SHALL keep every mission unchanged and run `pay-bill` as defined by the engine.
11. IF a Haunt_Command exits with code 0 or 3 and no standard output line is an absolute path ending in `run.json`, THEN THE Patrol_Runner SHALL record the Ghost as having no saved run with an error text stating that no Run_File path was printed.

### Requirement 5: Patrol records

**User Story:** As a Haunt maintainer, I want each night's results stored as data, so that the summary and page read from one trustworthy source.

#### Acceptance Criteria

1. WHEN a patrol finishes running the Ghosts, THE Patrol_Runner SHALL write a Patrol_Record to `data/patrols/<IST-date>.json` under the App_Root (`crew-app/data/patrols/` in the repository), where `<IST-date>` is formatted `YYYY-MM-DD`.
2. THE Patrol_Record SHALL contain the IST date, the Seed, and one entry per Ghost.
3. THE Patrol_Record entry for each Ghost SHALL contain the Run_Result or `no_run`, the exit code, the runId, finding counts by `type`, the finding titles, and the error text.
4. WHEN a Patrol_Record is written, THE Patrol_Runner SHALL write the same content to the Latest_Record.
5. IF a Run_File cannot be read or does not contain a valid Run_Result, THEN THE Patrol_Runner SHALL record the Ghost as having no saved run and include the read error text.
6. WHEN two patrols run on the same IST date, THE Patrol_Runner SHALL overwrite the earlier Patrol_Record for that date.
7. THE Patrol_App SHALL gitignore `crew-app/data/` except `crew-app/data/.gitkeep`.
8. THE Patrol_Runner SHALL write runs to the repository `runs/` directory.

### Requirement 6: Patrol summary

**User Story:** As a Haunt maintainer, I want a short summary comparing tonight with last night, so that I see what changed without reading every run.

#### Acceptance Criteria

1. WHEN a Patrol_Record is written, THE Summary_Builder SHALL produce the Patrol_Summary using plain code with no AI calls.
2. THE Patrol_Summary SHALL state, for each Ghost, whether the Ghost succeeded, gave up or had an error, and list the Ghost's Findings.
3. WHEN a previous Patrol_Record exists, THE Summary_Builder SHALL compare the two records and report Run_Result changes per Ghost.
4. WHEN a previous Patrol_Record exists, THE Summary_Builder SHALL classify each Finding_Key as new, fixed or unchanged, and SHALL classify a Finding_Key as fixed only when the Ghost of that Finding_Key has a Saved_Run in the current Patrol_Record.
5. WHEN no previous Patrol_Record exists, THE Summary_Builder SHALL state that there is no previous patrol.
6. THE Summary_Builder SHALL select the previous Patrol_Record as the newest record with an IST date earlier than the current IST date.
7. WHEN the Summary_Builder compares a Patrol_Record with itself, THE Summary_Builder SHALL report zero new Findings, zero fixed Findings and zero Run_Result changes.
8. WHEN the Patrol_Summary is built, THE Patrol_Runner SHALL print the Patrol_Summary to standard output and save the Patrol_Summary to `data/patrols/summary.md` under the App_Root.
9. IF the previous Patrol_Record cannot be parsed, THEN THE Summary_Builder SHALL state that the previous patrol was unreadable and omit the comparison.
10. WHEN a Ghost has no Saved_Run in the current Patrol_Record, THE Summary_Builder SHALL report that Ghost's previous Findings as not checked tonight.

### Requirement 7: Exit codes

**User Story:** As a Haunt maintainer, I want the job to fail only when the patrol itself could not work, so that ghosts getting stuck are treated as findings.

#### Acceptance Criteria

1. WHEN at least one Ghost has a Saved_Run, THE Patrol_Runner SHALL exit with code 0, including when a Ghost has Run_Result `gave_up`.
2. IF a prerequisite check fails, THEN THE Patrol_Runner SHALL exit with code 1 and print the missing item.
3. IF the Lantern_Bills site could not start, THEN THE Patrol_Runner SHALL exit with code 2 and print the reason.
4. IF the site started and no Ghost has a Saved_Run, THEN THE Patrol_Runner SHALL exit with code 3.
5. IF an exception escapes the patrol or the write of the Patrol_Record fails, THEN THE Patrol_Runner SHALL exit with code 4 and print the error text.
6. THE Patrol_Runner SHALL use each of the codes 1, 2, 3 and 4 for exactly one cause.
7. THE Patrol_Runner SHALL map exit conditions to codes in one pure function that vitest tests can call.
8. THE Patrol_README SHALL state that patrol exit code 3 means that no Ghost saved a run and is not the engine's exit code 3.

### Requirement 8: Prerequisite checks

**User Story:** As a Haunt maintainer, I want missing prerequisites reported clearly, so that I can fix setup without guessing.

#### Acceptance Criteria

1. WHEN a patrol starts, THE Patrol_Runner SHALL check for Node.js 24 or later, `node_modules` in `engine/`, `demo-site/` and `crew-app/`, and an installed Playwright Chromium browser.
2. IF a prerequisite is missing, THEN THE Patrol_Runner SHALL print the missing item with the command that fixes it and exit with code 1 before starting the site.
3. THE Patrol_Runner SHALL install no dependencies and download no browsers.

### Requirement 9: Patrol page

**User Story:** As a Haunt maintainer, I want one page showing the latest patrol, so that I can read results and jump to a run.

#### Acceptance Criteria

1. THE Patrol_Page SHALL be available at `/apps/haunt-patrol` and be built with `@kirocrew/app-sdk`.
2. THE Patrol_Page SHALL display the patrol date in IST, the Patrol_Summary, and one row per Ghost.
3. THE Patrol_Page SHALL display for each Ghost row a text badge with the Run_Result (`Succeeded`, `Gave up`, `Error` or `No run`), so that status is not conveyed by color alone.
4. THE Patrol_Page SHALL display for each Ghost row the finding counts by type.
5. WHERE a Ghost has at least one finding, THE Patrol_Page SHALL display an expandable "Show findings" section in that Ghost's row, listing each finding's type, step and title. Patrol runs live in Haunt Patrol's own data folder, which the Dashboard cannot read, so the page SHALL NOT link to a patrol run in the Dashboard.
6. THE Patrol_Page SHALL display one link to the live Dashboard, `https://xan-antx.github.io/haunt/`, labelled as the place for the recorded demo runs.
7. THE Patrol_App SHALL NOT run `npm run collect-runs`.
8. IF the Latest_Record does not exist, THEN THE Patrol_Page SHALL display a message that no patrol has run yet.
9. IF the Latest_Record cannot be parsed, THEN THE Patrol_Page SHALL display an error message naming the file.
10. THE Patrol_Page SHALL be operable by keyboard, and each "Show findings" control SHALL have an accessible name that includes the Ghost name.
11. THE Patrol_Page SHALL read patrol data only from the Patrol_Backend `/api/latest` and `/api/summary` endpoints (called as `/apps/haunt-patrol/api/latest` and `/apps/haunt-patrol/api/summary`) or the Static_Fallback, and read no files or environment values directly.

### Requirement 10: Data access for the page

**User Story:** As a Haunt maintainer, I want the page to read patrol data without any write access, so that viewing results cannot alter them.

#### Acceptance Criteria

1. THE Patrol_Backend SHALL be a Node backend that serves the Latest_Record and Patrol_Summary read-only.
2. WHEN a request with a method other than GET or HEAD is received on any route, including `/health`, THE Patrol_Backend SHALL respond with status 405 and serve no data.
3. WHEN a patrol writes the Latest_Record and the Patrol_Summary, THE Patrol_Runner SHALL also write the `/api/latest` and `/api/summary` response bodies as static JSON files in `ui/dist/data/` under the App_Root for the Patrol_Page to read as a fallback, whether or not the Patrol_Backend is reachable.
4. WHEN the UI is rebuilt with `npm run build`, THE Patrol_App SHALL keep the static JSON files from criterion 3 intact, so that the Patrol_Page still reads the latest patrol after a rebuild.
5. THE Patrol_Backend SHALL read only files under `data/patrols/` in the App_Root, found from its own file location.
6. WHEN a GET request for `/api/latest` is received, THE Patrol_Backend SHALL return the Latest_Record together with a `dashboardBaseUrl` field holding the Dashboard_Base_URL.
7. WHEN a GET request for `/api/summary` is received, THE Patrol_Backend SHALL return the Patrol_Summary text.
8. WHEN a request for any route other than `/health` is received, THE Patrol_Backend SHALL verify the Crew_Proxy_Header immediately after the method check in criterion 2 and before any other processing.
9. IF the Crew_Proxy_Header is missing or invalid on a route other than `/health`, THEN THE Patrol_Backend SHALL respond with status 401 and serve no data.
10. WHEN a GET or HEAD request for `/health` is received, THE Patrol_Backend SHALL skip Crew_Proxy_Header verification and respond with the body `{"ok":true}` and no other field, so that the response contains no patrol data, no file paths and no version.
11. THE Patrol_Backend SHALL keep the signing secret source (`KIROCREW_PROXY_SECRET`), the signed message and the 60 second timestamp tolerance, as documented above, in one configuration file.

### Requirement 11: Agent and skill

**User Story:** As a Haunt maintainer, I want an assistant that explains patrol results without taking actions, so that I can understand findings safely.

#### Acceptance Criteria

1. THE Patrol_Guide SHALL be declared with no tools and explain patrol results only.
2. THE Manifest SHALL NOT reference the Patrol_Guide from the Patrol_Job.
3. THE Reading_Patrols_Skill SHALL describe how to read Patrol_Records and the Patrol_Summary and SHALL permit read-only operations only.

### Requirement 12: Tests

**User Story:** As a Haunt maintainer, I want automated tests of the patrol logic, so that regressions are caught.

#### Acceptance Criteria

1. THE Patrol_App SHALL include required vitest tests for the Summary_Builder diff, the exit-code mapping, and the Patrol_Record schema.
2. THE Patrol_App SHALL include one required vitest property test asserting that a Patrol_Record compared with itself yields no changes.
3. THE Patrol_App SHALL include required vitest tests of the Patrol_Runner that use a fake command runner and fake site controller, so that tests start no browser and no server.
4. THE Patrol_App SHALL keep every test asserting its original expectation and SHALL NOT weaken or delete a test to make the suite pass.

### Requirement 13: Protected folders check

**User Story:** As a Haunt maintainer, I want an automated check that the patrol work leaves other teams' folders untouched, so that ownership boundaries hold.

#### Acceptance Criteria

1. THE Patrol_App SHALL provide the Protection_Check as one npm script in `crew-app/package.json`.
2. WHEN the Protection_Check runs, THE Protection_Check SHALL run `git diff --name-only` and examine every listed path.
3. IF `git diff --name-only` lists any path under the Protected_Folders, THEN THE Protection_Check SHALL print each such path and exit with a non-zero code.
4. WHEN `git diff --name-only` lists no path under the Protected_Folders, THE Protection_Check SHALL exit with code 0.
5. IF the `git diff --name-only` command fails, THEN THE Protection_Check SHALL print the error text and exit with a non-zero code.
