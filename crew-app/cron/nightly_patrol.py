"""Kiro Crew script cron entry for Haunt Patrol.

Kiro Crew refuses `command` crons on native Windows (docs/guides/windows-install.md in
kirodotdev/KiroCrew), so app.json declares the nightly patrol as a `script` cron:
"cron/nightly_patrol.py:run". This file only starts the TypeScript Patrol_Runner,
`node src/patrol.ts`, and reports its result. It makes no model call, imports only the
Python standard library and Kiro Crew's own cron_script module, and never uses a shell.

The installed copy of the app (~/.kiro/crew/apps/haunt-patrol) has no engine/ or
demo-site/ next to it, so the repository root comes from the HAUNT_REPO_ROOT environment
variable. When the app runs straight from the repository, the folder above the app root is
used instead.

How Crew reads the result (kiro_crew/cron_script.py and slack/gateway_runtime/cron_exec.py
in Kiro Crew 2026-11): the value `run` returns is ignored and the run is recorded with an
empty result. Raising `Report(text)` records `text` as the run's result, delivers it as a
notification and keeps the job scheduled. Raising any other exception marks the run as an
error with the exception's text.

Every step is appended to data/logs/patrol.log inside the app folder.
"""

import datetime
import os
import shutil
import subprocess
from pathlib import Path

try:
    from kiro_crew.cron_script import Report
except ImportError:  # Outside Kiro Crew, for example in the tests.

    class Report(Exception):
        """Stands in for kiro_crew.cron_script.Report: carries the run's result text."""

        def __init__(self, message=""):
            self.message = message
            super().__init__(message)


APP_ROOT = Path(__file__).resolve().parent.parent
RUNNER = APP_ROOT / "src" / "patrol.ts"
LOG_FILE = APP_ROOT / "data" / "logs" / "patrol.log"
ENGINE_CLI = Path("engine") / "bin" / "haunt.mjs"
# Below the cron's own 900 second `timeout`, so the runner's exit code is reported rather than a kill.
RUNNER_TIMEOUT_SECONDS = 890
TAIL_CHARACTERS = 4000

# The patrol's exit codes, from crew-app/README.md.
EXIT_MEANINGS = {
    1: "A prerequisite is missing.",
    2: "Lantern Bills did not start.",
    3: "The site started but no ghost saved a run.",
    4: "The patrol crashed.",
}


def log(message):
    """Appends one timestamped entry to data/logs/patrol.log. Never raises."""
    stamp = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    lines = str(message).rstrip("\n").split("\n") or [""]
    text = f"{stamp} {lines[0]}\n" + "".join(f"    {line}\n" for line in lines[1:])
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(text)
    except OSError:
        pass  # A log that cannot be written must not stop the patrol.


def fail(message):
    """Logs the error and raises it, so Crew marks the run as failed with this text."""
    log(f"ERROR: {message}")
    raise RuntimeError(message)


def output_block(label, text):
    text = (text or "").rstrip()
    return f"{label}:\n{text}" if text else f"{label}: (empty)"


def as_text(value):
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def find_repo_root(env):
    """The Haunt repository root. Raises RuntimeError with the fix when it cannot be found."""
    configured = (env.get("HAUNT_REPO_ROOT") or "").strip()
    if configured:
        root = Path(configured)
        log(f"HAUNT_REPO_ROOT: {configured}")
        if not root.is_dir():
            fail(
                f"HAUNT_REPO_ROOT is set to {configured}, but that folder does not exist. "
                "Set it to the folder that holds engine/ and demo-site/, then restart Kiro Crew."
            )
        source = "HAUNT_REPO_ROOT"
    else:
        root = APP_ROOT.parent
        log(f"HAUNT_REPO_ROOT is not set. Looking for the repository above the app: {root}")
        if not (root / ENGINE_CLI).is_file():
            fail(
                "Haunt Patrol cannot find the Haunt repository: HAUNT_REPO_ROOT is not set, and "
                f"there is no engine next to the app ({root / ENGINE_CLI} does not exist). Set the "
                "HAUNT_REPO_ROOT environment variable to the folder that holds engine/ and "
                "demo-site/, then restart Kiro Crew."
            )
        source = "the folder above the app"
    engine = root / ENGINE_CLI
    if not engine.is_file():
        fail(
            f"Haunt Patrol cannot find the engine: {engine} does not exist. HAUNT_REPO_ROOT must "
            "name the Haunt repository folder, the one that holds engine/ and demo-site/."
        )
    log(f"Repository root: {root} (from {source})")
    log(f"Engine: {engine}")
    return root


def find_node(env):
    node = shutil.which("node", path=env.get("PATH"))
    if node is None:
        fail(
            "Haunt Patrol cannot find node on PATH. Install Node.js 24 or later from "
            "https://nodejs.org, then restart Kiro Crew so it sees the new PATH."
        )
    log(f"Node: {node}")
    return node


def patrol(env):
    """Runs one patrol and returns its summary text. Raises RuntimeError when it fails."""
    log(f"Patrol starting. App folder: {APP_ROOT}")
    repo_root = find_repo_root(env)
    node = find_node(env)
    if not RUNNER.is_file():
        fail(f"Haunt Patrol cannot find its runner: {RUNNER} does not exist. Reinstall or update the app.")

    command = [node, str(RUNNER)]
    child_env = dict(env)
    child_env["HAUNT_REPO_ROOT"] = str(repo_root)
    log(f"Command: {subprocess.list2cmdline(command)} (in {repo_root}, timeout {RUNNER_TIMEOUT_SECONDS} s)")
    try:
        completed = subprocess.run(
            command,
            cwd=str(repo_root),
            env=child_env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=RUNNER_TIMEOUT_SECONDS,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as error:
        log(output_block("Output so far", as_text(error.stdout)))
        log(output_block("Errors so far", as_text(error.stderr)))
        fail(f"Haunt Patrol did not finish within {RUNNER_TIMEOUT_SECONDS} seconds and was stopped.")
    except OSError as error:
        fail(f"Haunt Patrol could not start {node}: {error}")

    log(f"Exit code: {completed.returncode}")
    log(output_block("Output", completed.stdout))
    log(output_block("Errors", completed.stderr))
    if completed.returncode != 0:
        meaning = EXIT_MEANINGS.get(completed.returncode, "Unexpected exit code.")
        details = completed.stderr.strip()[-TAIL_CHARACTERS:] or "The patrol printed no error text."
        fail(
            f"Haunt Patrol exited with code {completed.returncode}: {meaning} "
            "See crew-app/README.md for what each code means.\n" + details
        )
    summary = completed.stdout.strip()
    if not summary:
        fail("Haunt Patrol exited with code 0 but printed no summary.")
    log(f"Patrol finished. Returning the summary ({len(summary)} characters).")
    return summary


def run(ctx=None):
    """Kiro Crew's entry point. Ends by raising Report(summary), which Crew records as the result."""
    raise Report(patrol(os.environ))
