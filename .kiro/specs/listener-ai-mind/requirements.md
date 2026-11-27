# Requirements Document

## Introduction

This feature lets an AI agent choose the next action for The Listener, the screen-reader and keyboard-only ghost. Today the Listener follows a scripted sequence of steps. With this feature, `haunt run --mind ai` starts a loopback-only bridge inside the engine process. The bridge holds the real browser session, the recorder and the detectors. A thin MCP server (haunt-mcp) forwards the tool calls of a Kiro custom agent (`.kiro/agents/listener.json`) to the bridge. The agent decides which keyboard action to take next. The scripted mind remains the default.

The AI agent only chooses actions and writes the thought for each step. The engine's existing detectors decide every finding. The AI-driven run is expected to produce the same two findings as the scripted run and must pass the same run schema check. Only The Listener is in scope. Phantom and Bebe are unchanged.

Out of scope: running the end-to-end tests, changes to `dashboard/`, `demo-site/` or `demo-site-exorcised/`, and writes into `runs/`.

## Glossary

- **Haunt_Engine**: The TypeScript engine in `engine/` that drives ghost personas and writes run files.
- **Listener**: The ghost persona that uses only a screen reader's view and the keyboard.
- **Mind**: The component that chooses the Listener's next action. Two Minds exist: scripted and AI.
- **Scripted_Mind**: The existing Mind that follows a fixed sequence of steps.
- **AI_Mind**: The mode in which a Kiro custom agent chooses each next action through haunt-mcp tools.
- **Bridge**: The loopback-only HTTP server started by the Run_Command in AI_Mind mode. It holds the Body, the recorder and the Detectors and executes tool calls.
- **Haunt_MCP**: The MCP server named haunt-mcp, started by Kiro over standard input and output, that forwards tool calls to the Bridge.
- **Listener_Agent**: The Kiro custom agent defined in `.kiro/agents/listener.json`.
- **Kiro_CLI**: The `kiro-cli` executable that runs the Listener_Agent.
- **Detector**: An existing engine component that inspects the page and decides whether a finding exists.
- **Finding**: A recorded accessibility problem in a run, produced only by a Detector.
- **Run_Command**: The Haunt_Engine command-line entry point (`haunt run`) that starts a run.
- **Mind_Option**: The `--mind` option of the Run_Command, with values `scripted` and `ai`.
- **Run_File**: The JSON file that describes one run, conforming to the run schema in `contract/run.schema.json`.
- **Schema_Check**: Validation of a Run_File against the run schema using the engine's existing validation in `core/finalize.ts`.
- **Fallback_Thought**: The plain sentence recorded for a step in which the Listener_Agent made no `think` call.
- **Credits_Report**: A printed statement of the Kiro credits consumed by an AI-driven run.
- **Baseline_Findings**: The two Findings (an unlabeled button and a focus trap) that the Scripted_Mind produces for the Listener on Lantern Bills.
- **Self_Check_Task**: The manual final task of the implementation plan, carried out by the agent that executes the tasks.

## Requirements

### Requirement 1: haunt-mcp server and tools

**User Story:** As a Haunt developer, I want an MCP server that exposes only the Listener's own abilities, so that an AI agent can act as the Listener's mind.

#### Acceptance Criteria

1. THE Haunt_MCP SHALL run as a TypeScript MCP server over standard input and output and SHALL forward every tool call to the Bridge.
2. THE Haunt_MCP SHALL expose exactly these tools: `read_page`, `read_announcements`, `press_key`, `type_text`, `jump`, `think` and `finish`.
3. THE `press_key` tool SHALL accept only keys from the ListenerKey set: Tab, Shift+Tab, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter, Space and Escape.
4. THE `jump` tool SHALL accept a `to` value of heading, landmark, field or button and a `dir` value of next or previous.
5. IF a tool call carries a key, target or direction outside the allowed values, THEN THE Haunt_MCP SHALL return a tool error that names the unsupported value and SHALL NOT perform an action.
6. WHEN the Listener_Agent calls `read_page`, THE Haunt_MCP SHALL return the Listener's screen-reader view of the page, using the opaque `ax-<id>` refs.
7. WHEN the Listener_Agent calls `read_announcements`, THE Haunt_MCP SHALL return the live announcements heard since the previous call.
8. WHEN the Listener_Agent calls `finish`, THE Bridge SHALL end the action loop and the run SHALL end through the existing give-up path.
9. IF the browser session fails during a tool call, THEN THE Haunt_MCP SHALL return a tool error that contains the failure message, and THE run SHALL end through the existing error path.
10. THE Bridge SHALL listen only on 127.0.0.1 on a random port and SHALL reject any request that lacks the one-time token.
11. THE Run_Command SHALL pass the Bridge address and the token to the Haunt_MCP process through environment variables.

### Requirement 2: Listener custom agent

**User Story:** As a Haunt developer, I want a Kiro custom agent for the Listener, so that the AI mind has a defined role, a tight tool set and clear instructions.

#### Acceptance Criteria

1. THE Listener_Agent SHALL be defined in `.kiro/agents/listener.json` and SHALL register the haunt-mcp server.
2. THE Listener_Agent SHALL allow only the `@haunt-mcp/*` tools.
3. THE Listener_Agent SHALL have no shell, read or write built-in tools.
4. THE Listener_Agent prompt SHALL describe the Listener respectfully as a person who uses a screen reader's view and the keyboard.
5. THE Listener_Agent prompt SHALL direct the agent to read the page before acting, to call `think` on every step, and to avoid giving up early.
6. THE Listener_Agent prompt SHALL direct the agent to choose actions and to leave the decision of what counts as a Finding to the Detectors.

### Requirement 3: Mind run option

**User Story:** As a Haunt developer, I want a `--mind` run option, so that I can choose between the scripted and AI minds.

#### Acceptance Criteria

1. THE Run_Command SHALL accept the Mind_Option with the values `scripted` and `ai`.
2. WHERE the Mind_Option is omitted, THE Run_Command SHALL use the Scripted_Mind.
3. WHEN the Mind_Option is `ai` and the ghost is the Listener, THE Run_Command SHALL drive the Listener with the AI_Mind.
4. IF the Mind_Option has a value other than `scripted` or `ai`, THEN THE Run_Command SHALL exit with code 2 and print the accepted values.
5. IF the Mind_Option is `ai` and the ghost is not the Listener, THEN THE Run_Command SHALL exit with code 2 and print a message that the AI mind supports only the Listener.
6. WHEN the Mind_Option is `scripted` or omitted, THE Run_Command SHALL behave and produce output exactly as before this feature.
7. THE Run_Command SHALL apply the existing address guard to the target URL in AI_Mind mode, so that only localhost, 127.0.0.1 and the config's allowedDomains are allowed.

### Requirement 4: Step pipeline and findings

**User Story:** As a Haunt maintainer, I want the detectors to decide all findings and the per-step pipeline to stay the same, so that the AI mind cannot invent or hide accessibility problems.

#### Acceptance Criteria

1. THE Haunt_Engine SHALL record a Finding only when a Detector reports the Finding.
2. WHILE the AI_Mind drives the Listener, THE Haunt_Engine SHALL run the same per-step pipeline as the Scripted_Mind, in the same order: Detectors, success check, stop rule, 60-step limit, then the next action, and the Detectors' `finish()` after the loop.
3. THE Haunt_MCP SHALL expose no tool that creates, edits, reads or removes a Finding.
4. THE AI_Mind SHALL never receive a Probe, a StepTrace or a Finding.
5. THE `think` tool SHALL fill only the thought of the current step, and the Haunt_Engine SHALL NOT use thought text to create or change a Finding.
6. IF the Listener_Agent makes no `think` call for a step, THEN THE Haunt_Engine SHALL record a plain Fallback_Thought for that step.
7. THE Haunt_Engine SHALL leave the scripted run path and every existing test unchanged and unweakened.

### Requirement 5: Kiro CLI process

**User Story:** As a Haunt developer, I want the engine to start and supervise Kiro CLI safely, so that a run cannot hang, leak processes or write a bad file.

#### Acceptance Criteria

1. WHEN the Mind_Option is `ai`, THE Run_Command SHALL start `kiro-cli chat --agent listener --no-interactive` with the tool-trust flags for the haunt-mcp tools and the mission goal as the prompt.
2. THE Run_Command SHALL find the Kiro_CLI executable from the `KIRO_CLI_PATH` environment variable first, then from the PATH.
3. IF the Kiro_CLI executable cannot be found, THEN THE Run_Command SHALL exit with code 2 and print installation help.
4. THE Run_Command SHALL stop the Kiro_CLI process after a timeout that defaults to 10 minutes and that `HAUNT_AI_TIMEOUT_MS` overrides.
5. IF the Kiro_CLI process exits before the run has ended, THEN THE run SHALL end through the normal give-up or error path.
6. WHEN Ctrl+C is pressed, THE Run_Command SHALL kill the Kiro_CLI process and close the Bridge, SHALL write nothing, and SHALL exit with code 130.
7. THE Run_Command SHALL NOT write a Run_File that fails the Schema_Check.
8. WHEN the Kiro_CLI process ends, THE Run_Command SHALL parse the credits consumed from its output and print the Credits_Report.
9. IF the credits cannot be parsed, THEN THE Run_Command SHALL print that the credits are unknown.

### Requirement 6: Self-check task

**User Story:** As a Haunt developer, I want one documented manual check of the AI mind against the scripted Listener, so that I know the two minds find the same problems.

#### Acceptance Criteria

1. THE implementation plan SHALL end with the Self_Check_Task, a manual task for the agent that executes the tasks and not an automated check in the Haunt_Engine.
2. THE Self_Check_Task SHALL run the Listener once with `--mind ai` on Lantern Bills (the `pay-bill` mission) with `--out engine/test-output/ai-runs/`.
3. THE Self_Check_Task SHALL validate the resulting Run_File against `contract/run.schema.json`.
4. THE Self_Check_Task SHALL compare the Findings with those of scripted runs and SHALL report the Credits_Report.
5. IF the Findings differ from the Baseline_Findings, THEN THE Self_Check_Task SHALL record the difference and SHALL NOT edit any Detector or test.
6. THE Self_Check_Task SHALL NOT start a dev server. The user starts Lantern Bills.
7. WHEN the Haunt_Engine finishes any run, THE Haunt_Engine SHALL apply only its existing validation, and SHALL NOT compare the Findings with the Baseline_Findings.

### Requirement 7: Scope boundaries

**User Story:** As a Haunt maintainer, I want strict boundaries around this feature, so that other parts of the project stay untouched.

#### Acceptance Criteria

1. THE implementation SHALL leave all files in `dashboard/`, `demo-site/`, `demo-site-exorcised/` and `runs/` unchanged.
2. THE new code SHALL reside in `engine/src/mcp/`, `engine/src/mind/ai/` and `engine/bin/haunt-mcp.mjs`, plus tests in `engine/test/`, the changes to `engine/package.json` (a `bin.haunt-mcp` entry and the `@modelcontextprotocol/sdk` dependency), the step pipeline extraction in `engine/src/core/`, and the `--mind` wiring in `engine/src/cli/main.ts`.
3. THE implementation SHALL leave the Phantom and Bebe behaviour unchanged.
4. THE tests for this feature SHALL use a fake Body, a fake Kiro launcher and fast-check property tests, and no task SHALL run `test:e2e*`.
5. THE new code SHALL use TypeScript in strict mode on Node.js 24 or later.
6. THE AI_Mind SHALL describe the Listener respectfully wherever persona text appears.

## Choices made

1. `--mind <scripted|ai>` defaults to scripted. A bad value exits 2. `--mind ai` works only with `--ghost listener`; other ghosts exit 2.
2. Because `decide` is synchronous, the AI mind is tool-driven. `haunt run --mind ai` starts a loopback-only bridge (127.0.0.1, random port, one-time token) that holds the real Body, recorder and detectors. haunt-mcp is a thin stdio MCP server that forwards tool calls to the bridge. Bridge address and token reach the MCP process through environment variables. A task must verify that Kiro CLI passes environment variables to MCP servers.
3. The per-step pipeline (detectors, success check, stop rule, step limit, finish()) is extracted from `runLoop` and reused unchanged. The scripted path and its tests stay as they are.
4. Detectors decide every finding. No tool can add, edit or read findings. `think` only fills the current step's thought. The mind never sees a Probe or StepTrace.
5. MCP tools: `read_page`, `read_announcements`, `press_key` (restricted to the ListenerKey set), `type_text`, `jump(to, dir)`, `think`, plus `finish`. **Deviation to flag for review:** `finish` is not in the user's original tool list. It lets a stuck agent end the run.
6. A step with no `think` call gets a plain fallback thought.
7. `.kiro/agents/listener.json` allows only the `@haunt-mcp/*` tools, has no shell, read or write built-ins, and registers the haunt-mcp server. The prompt describes The Listener respectfully as a keyboard and screen-reader user. Behaviour: read before acting, think each step, don't give up early.
8. The CLI runs `kiro-cli chat --agent listener --no-interactive --trust-tools=...` with the mission goal. The binary is found from `KIRO_CLI_PATH` first, then PATH, else exit 2 with install help. On the developer machine it is at `%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe` (v3.5.0, logged in). Task 1 checks the exact flags with `kiro-cli chat --help`. Credits are parsed from CLI output and printed; if unparseable, the report says so.
9. Guards: Kiro process timeout (default 10 minutes, `HAUNT_AI_TIMEOUT_MS`). Ctrl+C kills the child and the bridge and writes nothing. If Kiro exits early, the run ends through the normal give-up or error path. An invalid run is never written.
10. Layout: new `engine/src/mcp/` and `engine/src/mind/ai/`, plus `engine/bin/haunt-mcp.mjs`. `package.json` gets `bin.haunt-mcp` and `@modelcontextprotocol/sdk`. No changes to `dashboard/`, `demo-site/`, `demo-site-exorcised/` or `runs/`.
11. Tests use a fake Body and a fake Kiro launcher, plus fast-check property tests. No task runs `test:e2e*`. Existing tests are never weakened.
12. The final self-check is a manual task: one Listener run with `--mind ai` on Lantern Bills with `--out engine/test-output/ai-runs/`, validated against `contract/run.schema.json`, findings compared with scripted runs, credits reported. If findings differ, the difference is recorded and detectors and tests are not edited. The user starts Lantern Bills; the task never starts a dev server.
13. Only localhost, 127.0.0.1 and allowedDomains are allowed, through the existing address guard. Persona text is respectful.

## Risks for task 1

- The exact Kiro CLI flags (`kiro-cli chat --help`).
- Whether and how environment variables reach MCP servers started by Kiro CLI.
