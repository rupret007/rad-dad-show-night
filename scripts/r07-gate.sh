#!/usr/bin/env bash
# Run from the worktree root via ~/bin/nuc-verify -- bash scripts/r07-gate.sh.
# Uses installed dependencies, mocked browser APIs, and disposable in-memory D1.
# No downloads, connected backend, migrations against real data, or deploys.
set -euo pipefail
export CI=1
export WRANGLER_SEND_METRICS=false
export npm_config_offline=true
python3 - <<'PY'
import os
import signal
import subprocess
import sys

checks = [
    ("R07 component regression", ["node", "--experimental-strip-types", "--test", "tests/owner-lifecycle-refresh.test.mjs"], 60),
    ("Lint", ["npm", "run", "lint"], 120),
    ("Scoped typecheck", ["npm", "run", "typecheck:suggestions"], 120),
    ("Full TypeScript check (this base has no npm typecheck script)", ["./node_modules/.bin/tsc", "--noEmit", "--incremental", "false"], 120),
    ("Standard npm test (includes production Vinext build, isolation, disposable D1)", ["npm", "test"], 600),
    ("R07 offline Chromium regression", ["npm", "run", "test:browser", "--", "tests/browser/owner-lifecycle-refresh.spec.ts"], 180),
]
failed = False
for label, command, seconds in checks:
    print(f"\nRUN: {label}\n$ {' '.join(command)}", flush=True)
    process = subprocess.Popen(command, start_new_session=True)
    try:
        result = process.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        result = 124
        print(f"TIMEOUT after {seconds}s (FAIL; no pass claimed)", flush=True)
    print(f"RESULT: {label}: exit {result}", flush=True)
    failed |= result != 0
print("\nNOT RUN: next build (Next CLI is not installed; npm test runs the configured Vinext production build).", flush=True)
print("NOT RUN: live auth, live DB/migrations, providers, physical devices, deployment.", flush=True)
sys.exit(1 if failed else 0)
PY
