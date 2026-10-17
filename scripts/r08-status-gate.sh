#!/usr/bin/env bash
# From the worktree root: ~/bin/nuc-verify -- bash -c 'bash scripts/r08-status-gate.sh'
# Offline fixtures only; no installs, live DB, provider requests, or deployment.
set -euo pipefail
python3 - <<'PY'
import os
import signal
import subprocess
import time

commands = [
    ["node", "--experimental-strip-types", "--test", "tests/owner-status-recovery.test.mjs"],
    ["npm", "run", "lint"],
    ["npm", "run", "typecheck:suggestions"],
    ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"],
    # npm test runs the production vinext build, isolation tests, and disposable D1.
    ["npm", "test"],
    ["npm", "run", "test:browser", "--", "tests/browser/owner-status-recovery.spec.ts"],
]
# A timeout is a FAILED gate, never a pass or skipped test. Bound the entire run.
deadline = time.monotonic() + 1500
failed = False
for command in commands:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        print("FAIL: gate exceeded its 25-minute budget", flush=True)
        failed = True
        break
    print("RUN: " + " ".join(command), flush=True)
    child = subprocess.Popen(command, start_new_session=True)
    try:
        code = child.wait(timeout=remaining)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        code = 124
    print("EXIT: " + str(code), flush=True)
    failed = failed or code != 0
raise SystemExit(1 if failed else 0)
PY
