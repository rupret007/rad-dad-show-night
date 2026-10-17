#!/usr/bin/env bash
# Run from the worktree root with dependencies installed. Offline fixtures only.
# Use ~/bin/nuc-verify -- bash scripts/r11-gate.sh to offload the Node gate.
set -uo pipefail
export CI=1
export npm_config_offline=true
export NEXT_TELEMETRY_DISABLED=1
export WRANGLER_SEND_METRICS=false
export WRANGLER_WRITE_LOGS=false
export WRANGLER_LOG_PATH=.wrangler/r11-gate.log
export MINIFLARE_REGISTRY_PATH=.wrangler/registry

if [[ ! -f tests/database-docs.test.mjs || ! -x node_modules/.bin/vinext ]]; then
  echo 'Run from the worktree root with dependencies already installed.' >&2
  exit 1
fi

status=0
run_check() {
  printf '\nRunning:'
  printf ' %q' "$@"
  printf '\n'
  # Bound each of the seven checks to three minutes, including fixture startup.
  # A timeout fails the gate; it never turns an unexecuted check into a pass.
  python3 - "$@" <<'PY'
import os
import signal
import subprocess
import sys

process = subprocess.Popen(sys.argv[1:], start_new_session=True)
try:
    result = process.wait(timeout=180)
except subprocess.TimeoutExpired:
    print("CHECK FAILED: timed out after 180 seconds", flush=True)
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    result = 124
sys.exit(result if result >= 0 else 128 - result)
PY
  local result=$?
  printf 'Exit status: %s\n' "$result"
  if [[ "$result" -ne 0 ]]; then status=1; fi
}

run_check node --test tests/database-docs.test.mjs
run_check npm run lint
run_check npm run typecheck
run_check npm run typecheck:suggestions
run_check node_modules/.bin/tsc --noEmit --incremental false
# npm test includes the production Vinext build, isolation tests, and local D1.
run_check npm test
# Preserve the requested literal Next gate without installing another framework.
run_check npm exec --offline --no -- next build
printf '\nLive DB validation/migrations, hosted checks, physical devices, deploys: NOT RUN.\n'
exit "$status"
