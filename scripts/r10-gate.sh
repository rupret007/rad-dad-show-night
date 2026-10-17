#!/usr/bin/env bash
# Run from the worktree root with dependencies already installed.
# Offline fixtures only. No installs, live DB access, or deployment.
set -uo pipefail
result=0
run() {
  printf '\n==> %s\n' "$*"
  # Bound each command and its children; a timeout fails the gate, never skips it.
  # Six commands at most: under 25 minutes including termination grace periods.
  python3 - "$@" <<'PY'
import os
import signal
import subprocess
import sys

process = subprocess.Popen(sys.argv[1:], start_new_session=True)
try:
    status = process.wait(timeout=240)
except subprocess.TimeoutExpired:
    print("FAIL: command exceeded 240 seconds", flush=True)
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    status = 124
sys.exit(status if status >= 0 else 128 - status)
PY
  local status=$?
  printf 'EXIT %s: %s\n' "$status" "$*"
  if [ "$status" -ne 0 ]; then result=1; fi
}
run node --experimental-strip-types --test tests/show-clone-validation.test.mjs
run npm run lint
run npm run typecheck:suggestions
# This baseline has no npm typecheck script; still execute the full compiler.
if node -e 'process.exit(JSON.parse(require("fs").readFileSync("package.json", "utf8")).scripts.typecheck ? 0 : 1)'; then
  run npm run typecheck
else
  printf '\nNOT RUN: npm run typecheck (script absent); running full tsc directly.\n'
  run ./node_modules/.bin/tsc --noEmit --incremental false
fi
# npm test includes the declared Vinext production build, isolation, and D1 suites.
run npm test
# Vinext production build (package.json "build"); npm test already runs it once.
if node -e 'process.exit(JSON.parse(require("fs").readFileSync("package.json", "utf8")).scripts.build ? 0 : 1)'; then
  run npm run build
else
  printf '\nFAIL: package.json has no build script for this Vinext app.\n'
  result=1
fi
exit "$result"
