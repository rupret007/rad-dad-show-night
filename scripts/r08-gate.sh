#!/usr/bin/env bash
# Run from the worktree root with dependencies and Playwright Chromium installed.
# Offline only: mocked browser APIs and ephemeral local D1; no hosted checks.
set -uo pipefail
export CI=1
export WRANGLER_SEND_METRICS=false
export WRANGLER_WRITE_LOGS=false
export MINIFLARE_REGISTRY_PATH="$PWD/.wrangler/registry"
export SHOW_NIGHT_BROWSER_FIXTURE_PORT="${SHOW_NIGHT_BROWSER_FIXTURE_PORT:-4388}"
failed=0
run() {
  printf '\nR08 gate: %s\n' "$*"
  "$@"
  result=$?
  printf 'R08 result: %s (exit %s)\n' "$*" "$result"
  if (( result != 0 )); then failed=1; fi
  return "$result"
}

run node --experimental-strip-types --test tests/owner-song-tools.test.mjs tests/control-focus-visible.test.mjs tests/show-lifecycle-guard.test.mjs
run npm run test:browser
run npm run lint
run npm run typecheck:suggestions
# Full production type checking is mandatory; preserve any failure.
run npm run typecheck
# The project uses Vinext, not a Next CLI. npm test includes its production
# build, the isolation suite, and local D1 tests. Build exactly once.
if ! run npm test; then
  # npm test short-circuits on failure. Still collect the other gate results.
  run npm run test:isolation
  run npm run test:d1
fi
printf '\nLive site, real owner authentication, physical phones, screen readers, real DB/migrations, deploys: NOT RUN.\n'
exit "$failed"
