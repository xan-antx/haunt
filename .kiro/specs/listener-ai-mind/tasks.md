# Implementation Plan: Listener AI Mind

## Overview

These tasks add `haunt run --ghost listener --mind ai` to the engine in `engine/`, bottom-up. Task 1 verifies the Kiro CLI facts the design depends on and records them in the design before anything else is built. Tasks 2 to 9 extract the shared step pipeline, then add the tool contract, the AI run driver, the Bridge, haunt-mcp, the Kiro launcher, the Listener agent and the CLI wiring. Task 10 is a checkpoint. Task 11 is the manual self-check against the real Kiro CLI and Lantern Bills.

Rules for every task:

- Never create, change or delete files in `dashboard/`, `demo-site/`, `demo-site-exorcised/` or `runs/`. New code goes in `engine/src/mcp/`, `engine/src/mind/ai/`, `engine/bin/haunt-mcp.mjs`, `engine/test/` and `engine/test-output/`, plus edits to `engine/package.json`, `engine/src/core/` (the pipeline extraction) and `engine/src/cli/main.ts`. The only files outside `engine/` are `.kiro/agents/listener.json` (task 8) and the findings section added to `.kiro/specs/listener-ai-mind/design.md` (task 1).
- Tests use a fake Body, a fake Kiro launcher and fast-check. They write only into `engine/test-output/`, never start a browser or the real Kiro CLI, and always pass `--out`. No task runs `test:e2e*` or a dev server.
- Use the file tools to create and edit files. Use the terminal only for `npm`, `npx`, `node` and read-only `git` commands, from `engine/`, in PowerShell. The only other terminal commands are the read-only `kiro-cli` checks in task 1 and the run in task 11.
- Existing tests are never edited, weakened or deleted, and the scripted path stays unchanged. If a test fails after a change, fix the new code.
- Tasks marked `*` are optional property tests. Each carries the tag `Feature: listener-ai-mind, Property N: <title>` and runs at least 100 times.
- Persona text describes The Listener respectfully as a person who uses a screen reader's view and the keyboard.
- TypeScript strict mode, Node.js 24 or later.
- Each task ends with `npm run build` and `npm test` in `engine/` passing, unless the task says otherwise.

## Tasks

- [x] 1. Verify the Kiro CLI facts and record them in the design
  - [x] 1.1 Check the facts
    - Find `kiro-cli`: run `kiro-cli --version`; if it is not on PATH, confirm with the file tools that `%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe` exists and run it by full path
    - Run `kiro-cli chat --help` and copy the exact flags for the agent (`--agent`), non-interactive mode (`--no-interactive`) and trusting tools (`--trust-tools`, `--trust-all-tools`), and the exact trust syntax for MCP tools
    - Read the Kiro CLI custom agent documentation (web search or fetch) and confirm the agent JSON keys: `name`, `description`, `prompt`, `mcpServers`, `tools`, `allowedTools`, `includeMcpJson`, and the form of an MCP tool reference such as `@haunt-mcp/*`
    - Confirm how environment variables reach MCP servers: the `env` key of the `mcpServers` entry, whether `${VAR}` substitution works there, and whether the child's own environment is inherited by the MCP process. If the child environment is not inherited, find the working alternative (for example a `${VAR}` reference in the agent's `env` block, or a temporary agent file written per run)
    - If an exact behaviour cannot be settled from help and documentation, check it with a throwaway agent and a tiny stdio MCP script under `engine/test-output/kiro-probe/`, using one short prompt to keep credits low. Delete nothing outside that folder
    - Read `engine/src/core/finalize.ts`, `engine/src/core/recorder.ts` and `contract/run.schema.json` and confirm that a step with `intentionId: 'ai-mind'` passes the schema and the invariants. If `intentionId` is restricted, record the exact rule and what the driver must send instead
    - Read how the existing CLI reports a missing Chromium and how `runWithInterrupt` works, so later tasks reuse them
    - _Requirements: 5.1, 5.2, 1.11, 2.1, 2.2_
  - [x] 1.2 Record the findings in the design
    - Add a section "Verified Kiro CLI facts" to `.kiro/specs/listener-ai-mind/design.md` with: the CLI version, the resolved executable path, the exact `buildKiroArgs` output, the final agent JSON keys, the way `HAUNT_BRIDGE_URL` and `HAUNT_BRIDGE_TOKEN` reach haunt-mcp, the `intentionId` result, and the credits line format seen in the output (or "not seen")
    - Update the placeholder `env` block, the "Listener agent" section and the "Kiro launcher" section so they match the findings. Keep the design's component names and interfaces
    - Later tasks read this section and follow it. If a finding contradicts the requirements, stop and ask the user
    - _Requirements: 1.11, 5.1, 5.2, 5.8_
  - Run `npm run build` and `npm test` in `engine/` (no engine code changes in this task)

- [x] 2. Package setup and step pipeline extraction
  - [x] 2.1 Update `engine/package.json`
    - Add `"haunt-mcp": "bin/haunt-mcp.mjs"` to `bin` and the `@modelcontextprotocol/sdk` dependency (current stable version), then run `npm install` in `engine/`
    - _Requirements: 7.2_
  - [x] 2.2 Extract `engine/src/core/stepPipeline.ts` from `runLoop`
    - Implement `afterStep` (detectors, success check, stop rule, step limit, in that order) and `closeRun` (detectors' `finish()` unless the outcome is an error, then the closing sentence) exactly as the design's section 1
    - Rewrite `runLoop` to call them. Behaviour, messages and step order must not change
    - _Requirements: 4.2, 4.7_
  - [x] 2.3 Unit tests for the pipeline
    - Write `engine/test/stepPipeline.test.ts`: order of detectors, success, stop rule and limit; `closeRun` skips `finish()` on error. Run the existing `runLoop` tests unchanged and confirm they pass
    - _Requirements: 4.2, 4.7_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 3. Tool contract
  - [x] 3.1 Write `engine/src/mind/ai/tools.ts`
    - `LISTENER_KEYS`, `JUMP_TARGETS`, `JUMP_DIRS`, `ToolCall`, `ToolResult`, `parseToolCall` (error names the bad value; `type_text` limited to 500 characters and `think` to 1000, both trimmed), `formatHeard`, and the mapping from action calls to `ListenerAction`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 4.3_
  - [x]* 3.2 Write property test for tool input validation in `engine/test/tools.properties.test.ts`
    - **Property 1: Tool input validation**
    - Uses a fake Body that counts `act` calls; rejected calls must cause none
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  - [x]* 3.3 Write property test for the page view in `engine/test/formatHeard.properties.test.ts`
    - **Property 2: Page view keeps what the Listener hears**
    - **Validates: Requirements 1.6**
  - Run `npm run build` and `npm test` in `engine/`

- [x] 4. AI run driver
  - [x] 4.1 Write `engine/src/mind/ai/driver.ts` and `engine/src/mind/ai/memory.ts`
    - `AiRunDriver` with `start`, serialised `handle`, `outcome`, `ended` and `endExternally`, behaving per tool exactly as in the design's section 3. The Probe stays inside the driver, no tool reads or writes findings, `recorder.add` uses `intentionId` as verified in task 1, and the thought is the last `think` text or the Fallback_Thought
    - `AiMindMemory` builds the closing give-up sentence from the action count only
    - A thrown `perceive` or `act` becomes an `error` outcome with the first non-empty message line and a tool error with the same text
    - Tool calls after the outcome return "The run has ended. Stop now."
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 4.1, 4.2, 4.4, 4.5, 4.6, 5.5_
  - [x]* 4.2 Write property test for announcements in `engine/test/announcements.properties.test.ts`
    - **Property 3: Announcements are delivered exactly once, in order**
    - **Validates: Requirements 1.7**
  - [x]* 4.3 Write property test for browser failures in `engine/test/failures.properties.test.ts`
    - **Property 4: Browser failures surface and end the run**
    - **Validates: Requirements 1.9**
  - [x]* 4.4 Write property test for findings in `engine/test/findings.properties.test.ts`
    - **Property 7: Detectors alone decide findings**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
  - [x]* 4.5 Write property test for pipeline sharing in `engine/test/pipeline.properties.test.ts`
    - **Property 8: The AI driver and `runLoop` share one pipeline**
    - **Validates: Requirements 4.2**
  - [x]* 4.6 Write property test for thoughts in `engine/test/thoughts.properties.test.ts`
    - **Property 9: Thoughts come from `think` or the fallback**
    - **Validates: Requirements 4.5, 4.6**
  - [x] 4.7 Unit tests for the driver in `engine/test/driver.test.ts`
    - `finish` ends with `gave_up` and reason `no_match`; early Kiro exit with code 0 gives `gave_up`, non-zero gives `error` naming the code; timeout gives `error` naming the limit; calls after the end are refused; a step with no `think` records a non-empty Fallback_Thought; nothing the driver returns contains a Probe, StepTrace or Finding
    - _Requirements: 1.8, 4.4, 4.6, 5.5_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 5. Bridge
  - [x] 5.1 Write `engine/src/mind/ai/bridge.ts`
    - `startBridge(driver, { token? })`: listens on `127.0.0.1` port 0, `POST /tool` with a bearer token compared in constant time, JSON body limited to 64 KB validated by `parseToolCall`, 401 without driver contact on a bad token, 404 for anything else, `close()`
    - _Requirements: 1.10_
  - [x]* 5.2 Write property test for the token in `engine/test/bridge.properties.test.ts`
    - **Property 5: The Bridge accepts only the right token**
    - **Validates: Requirements 1.10**
  - [x] 5.3 Unit tests for the Bridge in `engine/test/bridge.test.ts`
    - Right token reaches a fake driver; missing header, wrong token and other paths or methods do not; oversized body is refused; `close()` frees the port
    - _Requirements: 1.10_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 6. haunt-mcp server
  - [x] 6.1 Write `engine/src/mcp/server.ts`
    - `McpServer` over `StdioServerTransport` with exactly the seven tools and input schemas that mirror `tools.ts`; each handler POSTs to `HAUNT_BRIDGE_URL` with `HAUNT_BRIDGE_TOKEN` and returns the result as MCP content (`isError: true` for errors); exit with a clear message on stderr when either variable is missing
    - _Requirements: 1.1, 1.2, 1.11, 4.3_
  - [x] 6.2 Write `engine/bin/haunt-mcp.mjs`
    - Thin launcher that imports the TypeScript entry the same way `bin/haunt.mjs` does
    - _Requirements: 1.1, 7.2_
  - [x] 6.3 Unit tests for the server in `engine/test/mcp.test.ts`
    - Tool list equals exactly `read_page`, `read_announcements`, `press_key`, `type_text`, `jump`, `think`, `finish`; no tool name mentions findings; a call is forwarded to a fake Bridge with the token; missing environment variables give the stderr message and a non-zero exit
    - _Requirements: 1.2, 1.11, 4.3_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 7. Kiro launcher
  - [x] 7.1 Write `engine/src/mind/ai/kiro.ts`
    - `resolveKiroCli` (`KIRO_CLI_PATH` first, then each PATH entry with `.exe` and `.cmd` on Windows, else install help), `parseTimeoutMs` (positive integer, default 600000), `buildKiroArgs` as recorded in task 1, `parseCredits` as recorded in task 1, and the default launcher using `child_process.spawn` without a shell, merging stdout and stderr into `output`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.8, 5.9_
  - [x]* 7.2 Write property test for resolution in `engine/test/kiroResolve.properties.test.ts`
    - **Property 10: Kiro CLI resolution order**
    - **Validates: Requirements 5.2, 5.3**
  - [x]* 7.3 Write property test for timeout parsing in `engine/test/kiroTimeout.properties.test.ts`
    - **Property 11: Timeout parsing**
    - **Validates: Requirements 5.4**
  - [x]* 7.4 Write property test for credits parsing in `engine/test/kiroCredits.properties.test.ts`
    - **Property 12: Credits parsing**
    - **Validates: Requirements 5.8, 5.9**
  - [x] 7.5 Unit tests for the launcher in `engine/test/kiro.test.ts`
    - `buildKiroArgs` contains the agent name, the non-interactive flag, the trust flag for haunt-mcp tools and the goal; a real credits line from task 1 parses; install help mentions `KIRO_CLI_PATH`
    - _Requirements: 5.1, 5.3, 5.8, 5.9_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 8. Listener agent
  - [x] 8.1 Write `.kiro/agents/listener.json`
    - Keys and environment wiring exactly as verified in task 1. Register `haunt-mcp`, allow only `@haunt-mcp/*`, no `fs_read`, `fs_write` or `execute_bash`, `includeMcpJson: false`
    - The prompt describes The Listener respectfully, tells the agent to read the page before acting, to call `think` with one plain sentence on every step, not to give up early, and to leave the judgement of what is wrong to the engine
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.6_
  - [x] 8.2 Unit tests for the agent file in `engine/test/agent.test.ts`
    - Parse `.kiro/agents/listener.json`: `haunt-mcp` is registered, `allowedTools` and `tools` contain only `@haunt-mcp` entries, no built-in tool names appear, the prompt contains instructions to read, to `think` and not to give up early
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 9. CLI wiring
  - [x] 9.1 Add the `--mind` option to `parseArgs` in `engine/src/cli/main.ts`
    - `scripted` (default) or `ai`; a bad value gives exit 2 with the accepted values; `ai` with another ghost gives exit 2 with "The AI mind supports only the listener ghost."; add one line to `USAGE`
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  - [x]* 9.2 Write property test for option parsing in `engine/test/mindOption.properties.test.ts`
    - **Property 6: Mind option parsing**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
  - [x] 9.3 Add the AI run path to `engine/src/cli/main.ts`
    - Add optional `kiroLauncher` and `kiroExists` to `CliDeps`. After the address guard, mission and site checks and before any browser starts, resolve Kiro; not found prints install help and exits 2
    - Replace only the `runLoop` call for the AI path: build the driver, start the Bridge, spawn Kiro with `HAUNT_BRIDGE_URL` and `HAUNT_BRIDGE_TOKEN` in its environment (as verified in task 1), and race `driver.ended`, Kiro's exit and the timeout (`HAUNT_AI_TIMEOUT_MS`). Then kill the child, close the Bridge and continue into the existing `finalize`, write and exit-code code unchanged, so a run that fails validation is never written
    - Extend `runWithInterrupt` cleanup to kill the child and close the Bridge; nothing is written and the exit code is 130
    - Print the credits line ("Kiro credits used: N" or "Kiro credits used: unknown (reason)") on the status stream, not on the line that carries the run path
    - The scripted path must produce the same output as before
    - _Requirements: 3.3, 3.6, 3.7, 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 1.11_
  - [x] 9.4 Unit tests for the CLI in `engine/test/cli.ai.test.ts`
    - Fake Body, fake detectors and fake launcher only: the launcher receives both environment variables and the agent arguments; Kiro not found exits 2 before any browser launch; a disallowed address is refused in AI mode; `--mind ai --ghost phantom` exits 2; an early exit, a `finish` call and a timeout end the run through the right outcome; Ctrl+C kills the fake child, closes the Bridge, writes nothing and exits 130; credits are printed or reported unknown; the scripted run output is unchanged
    - _Requirements: 3.3, 3.5, 3.6, 3.7, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9_
  - Run `npm run build` and `npm test` in `engine/`

- [x] 10. Checkpoint: before the self-check
  - Run `npm run build` and `npm test` in `engine/`. `npm test` is `vitest run` and does not include the `test:e2e*` scripts
  - Run `npx vitest run -t "Feature: listener-ai-mind, Property"` in `engine/` (the existing `npm run test:properties` script filters on `Feature: haunt-engine` only, so it does not select these tests). Confirm Properties 1 to 12 ran and passed if the optional tests were written, and that every existing test still passes unchanged
  - Run `git status --porcelain -- dashboard demo-site demo-site-exorcised runs` and confirm it prints nothing
  - Ensure all tests pass, ask the user if questions arise

- [x] 11. Self-check (manual, run by the agent executing the tasks)
  - [x] 11.1 Run the Listener with the AI mind on Lantern Bills and compare (done: the AI run is saved as `runs/lantern-bills/2026-11-23T1020Z-listener-pay-bill`, commit `9a7a48b`. The engine checks every run against the schema before saving it. Its two findings, an unlabeled button and a focus trap, equal the baseline and the saved scripted run `2026-11-10T1822Z-listener-pay-bill`, so no `self-check.md` difference note was needed)
    - Ask the user to start Lantern Bills and give its URL. Do not start a dev server and do not run e2e tests
    - From `engine/`, run `npm run haunt -- run --ghost listener --mind ai --mission pay-bill --url <Lantern Bills URL> --out test-output/ai-runs/` (use the option names `--help` prints). Set `KIRO_CLI_PATH` to `%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe` if `kiro-cli` is not on PATH. Allow up to the 10 minute timeout
    - Validate the written `run.json` against `contract/run.schema.json` with the engine's existing validation (for example a short `npx tsx` script that calls `validate` from `src/contract`). Report the result
    - Compare the Findings with the Baseline_Findings (an unlabeled button and a focus trap) and with a scripted run: run `npm run haunt -- run --ghost listener --mission pay-bill --url <Lantern Bills URL> --out test-output/ai-runs/scripted/` and compare the finding types and the steps they point to
    - Report: run path, result, number of steps, the Findings of each run, schema result, and the Credits_Report line (or "unknown" with the reason)
    - If the Findings differ from the baseline, record the difference in the report and in `engine/test-output/ai-runs/self-check.md`. Do not edit any detector, mission or test, and do not weaken a check
    - Confirm with `git status --porcelain -- dashboard demo-site demo-site-exorcised runs` that nothing changed there
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1_

## Notes

- Task 1 comes first because the agent file, the Kiro arguments, the environment wiring and the `intentionId` value all depend on its findings.
- Tasks that write the same file sit in different waves: `engine/src/cli/main.ts` is edited in 9.1, then 9.3, and tested in 9.4.
- Each optional property test has its own file, so the property tests of one task can run in parallel.
- Flagged deviation: the `finish` tool (task 6.1, task 4.1) is not in the original tool list. It is kept so a stuck agent can end the run, and it needs the user's review.
- Tasks marked with `*` are optional. Core implementation tasks and unit tests are required.
- Task 11 is manual and is not an automated test. It needs the user to start Lantern Bills and uses real Kiro credits.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "3.1", "7.1", "8.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.1", "6.1", "7.2", "7.3", "7.4", "7.5", "8.2", "9.2"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "5.1", "6.2"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.3", "9.3"] },
    { "id": 7, "tasks": ["9.4"] },
    { "id": 8, "tasks": ["10"] },
    { "id": 9, "tasks": ["11.1"] }
  ]
}
```
