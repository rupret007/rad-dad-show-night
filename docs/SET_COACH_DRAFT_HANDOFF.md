# Set Coach: advice for the reviewed draft

Base: `c0406494605e3a05c35a09d8cc57c59d1fcb8b09`.

Previously, a completed Coach review stayed under the editor when the owner
switched sets or edited songs. A delayed response could also appear after a
show switch. The API assigned fixed 35/20/60-minute windows from set slugs,
including for an untimed future show.

## Behavior

- The Coach panel and result identify the show, set, and browser draft.
- Any change to the reviewed context retires its advice and pending request.
  Returning to an earlier set or identical text does not revive a retired
  review. A new review requires the owner's click.
- The ten-second browser deadline covers response headers and body. Failure,
  timeout, malformed data, and mismatched request identity offer a manual retry
  while preserving the editable draft. Late completions cannot settle a newer
  request or overwrite the owner's save notices.
- The Coach uses only the selected set time from the verified owner response.
  Missing or duplicate set definitions cannot select a canonical fallback time.
  Blank, ambiguous, or unsupported ranges yield an unknown window and no timing
  score. Other readiness findings and the estimated runtime remain available.
- The API accepts one complete draft from one show and set. It rejects mixed
  identities, duplicate songs, invalid order, and oversized lists rather than
  silently reviewing a different list.

## Boundaries and review

Coach remains owner-only and read-only with respect to set storage. It does not
save, publish, book, or send outreach. The optional configured AI path remains
behind an explicit review click; fixture verification never calls it live.
Its outbound data remains the selected set's titles and operational metadata.
Responses render as text, and the request ID binds the response to its review.

`lib/show-data.ts` stays at blob
`7ff0a69708ccfac79aa9b35878670f31bbb83b64`. The save/revision helpers, database
schema and migrations, public surfaces, service worker, dependencies, and hosted
workflow are unchanged. Travis books; `NEVER_AUTO_POST` stays in force. Any
separate migration rollout from the previous slice remains separately held.

## Verification

The new unit tests exercise timing honesty, complete-draft validation, response
identity, and the actual Coach route with fixture auth and provider seams. The
browser tests use the real editor and Coach with every API request intercepted;
the existing fixture guard rejects unmocked APIs and external traffic.

Local verification passed: **170 isolation tests, 18 disposable D1 tests, 63
Chromium cases**, lint, focused TypeScript, production build, and seeded HTTP
checks. Desktop and 320-pixel Coach screenshots were inspected. The broad
TypeScript output exactly matches all nine existing baseline diagnostics.

Required local and hosted gates remain the isolation suite, disposable D1 tests,
lint, focused TypeScript, production build, Chromium fixtures, and seeded local
HTTP checks. The broad TypeScript command has nine existing Worker/show-store
diagnostics on the exact base; its result must be compared with that baseline,
not described as wholly green.

For a quick review, run Coach on a populated fixture, edit a cue or switch sets,
and confirm the advice disappears. Try a delayed response while switching shows.
Review an untimed set and confirm its window is unknown. Cause a review failure,
then retry explicitly and confirm the unsaved draft and save controls survive.
