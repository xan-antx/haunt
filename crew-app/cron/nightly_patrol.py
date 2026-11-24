"""Kiro Crew script cron entry for Haunt Patrol.

Kiro Crew refuses `command` crons on native Windows (docs/guides/windows-install.md in
kirodotdev/KiroCrew), so app.json declares the nightly patrol as a `script` cron:
"cron/nightly_patrol.py:run". This file only starts the TypeScript Patrol_Runner,
`node src/patrol.ts`, and reports its result. It makes no model call, imports only the
Python standard library, and never uses a shell.

The installed copy of the app (~/.kiro/crew/apps/haunt-patrol) has no engine/ or
demo-site/ next to it, so the repository root comes from the HAUNT_REPO_ROOT environment
variable. When the app runs straight from the repository, the folder above the app root is
used instead.
"""

import os
import shutil
import subprocess
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
RUNNER = APP_ROOT / "src" / "patrol.ts"
# Below the cron's own 900 second `timeout`, so the runner's exit code is reported rather than a kill.
RUNNER_TIMEOUT_SECONDS = 890
TAIL_CHARACTERS = 4000


def find_repo_root(env):
    """The Haunt repository root, or None when it cannot be found."""
    configured = (env.get("HAUNT_REPO_ROOT") or "").strip()
    if configured:
        root = Path(configured)
        return root if (root / "engine" / "bin" / "haunt.mjs").is_file() else None
    parent = APP_ROOT.parent
    if (parent / "engine" / "bin" / "haunt.mjs").is_file():
        return parent
    return None


def run(ctx=None):
    """Runs one patrol. Raises RuntimeError when the patrol exits with a non-zero code."""
    repo_root = find_repo_root(os.environ)
    if repo_root is None:
        raise RuntimeError(
            "Haunt Patrol cannot find the Haunt repository. Set the HAUNT_REPO_ROOT environment "
            "variable to the folder that holds engine/ and demo-site/, then restart Kiro Crew."
        )
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Haunt Patrol needs Node.js 24 or later on PATH. Install it from https://nodejs.org")

    env = dict(os.environ)
    env["HAUNT_REPO_ROOT"] = str(repo_root)
    completed = subprocess.run(
        [node, str(RUNNER)],
        cwd=str(repo_root),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=RUNNER_TIMEOUT_SECONDS,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    print(completed.stdout, end="")
    if completed.returncode != 0:
        raise RuntimeError(
            f"Haunt Patrol exited with code {completed.returncode}. "
            "See crew-app/README.md for what each code means.\n"
            + completed.stderr[-TAIL_CHARACTERS:]
        )
    return completed.stdout
