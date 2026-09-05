# Conflict-safe owner saves and review

September 5, 2026. Base: `1f01baad6f2b19ffd7d4d3237120cb0d1f2b44fc`
(after merged #22). Branch: `codex/show-night-owner-product-20260905`.
Source for draft review only; no live Sites deployment or database migration.

## Product delta

Two owner tabs could pass #22's receipt check before either transaction began.
The second save could replace the first, including populated sets. Empty-set
cycles and identical timestamps could reuse an older row receipt. A separate
read after a successful save could even return a later writer's list as that
save's result. Check retained the local draft while silently accepting a newer
receipt, without showing the competing saved work.

This slice closes those connected gaps on the existing Show Control surface:

- A persistent exact-show/set write version is claimed atomically with the
  expected rows. Every replacement statement requires that operation's token.
- A second save using the same version loses with `409`. Empty sets retain
  version history, and failed transactions roll back the version and songs.
- Canonical rows and version come back from the save's own transaction.
  Owner GET also reads rows and versions together; public GET omits versions.
- Divergent Check shows Saved list and Your browser draft, including changed
  cues/resources/private notes. It retains local work and blocks Save until an
  explicit choice. Neither choice writes or calls a provider.
- Use saved list changes only browser state. Keep my draft stages a full-set
  replacement for a separate Save. Removed local IDs are named before this
  explicit choice stages them as new draft rows; titles never establish identity.
- Missing/malformed receipts or versions do not grant write authority. Another
  intervening save requires another check. Uncertain writes are never retried
  automatically, and edits made while a request is pending remain local.
- A successful response must match the normalized submitted content, retained
  identities, order and exact show/set before clearing the draft. Save and Check
  deadlines cover both response headers and body; late results cannot clear a
  newer operation. Unresolved saves/reviews also block Publish and Archive.
- Owner reads use explicit authenticated `scope=owner` requests and cannot fall
  back to cached public data. Default reads remain public even with an owner
  cookie. Cache version 3 and its matching readiness key retire earlier Rad Dad
  caches; new public caches omit credentials and reject private notes, owner
  scope, or write receipts on both writes and offline reads. No cache was changed
  on the live site during this task. An older active worker cannot mark the new
  cache ready: the preparation reply must match cache version 3.

This is optimistic conflict review, not simultaneous collaborative editing,
a reservation of another owner's tab, or a title-based merge.

## Migration and compatibility

`drizzle/0003_official_set_revisions.sql` adds only the
`official_set_revisions(show_id, set_slug, version)` table with a composite
primary key. Existing songs are not rewritten or backfilled. A validated owner
read of an absent version row yields `initial:0`; each successful save replaces
that initial authority with a fresh UUID. Do not delete version rows when a set
becomes empty or to bypass a conflict.

A future separately approved deployment must include this additive migration
before owner editing is exposed. This task applies it only to disposable local
fixtures. If the table is missing, owner reads/saves fail closed. Old browser
pages must reload to obtain `reviewedVersion`; the new server rejects writes
that lack it. Public canonical fallback remains available, but never grants
owner editing authority. Do not roll back to the old unconditional save path
and continue claiming concurrent-save protection.

## Verification and remaining gates

The draft PR records the executed local counts and exact-head hosted run; this
document is not a substitute for those receipts. Required verification covers:

- Actual handler and disposable D1 collisions for empty and populated lists;
  same-clock saves, empty cycles, wrong-show/set isolation, transaction rollback,
  and delayed response ownership.
- Owner snapshots, missing/invalid versions, unauthenticated refusal, and public
  payloads without owner receipt metadata; real service-worker script tests for
  owner bypass, cache preparation, invalid offline copies, and old-cache cleanup.
- Offline phone-browser conflict review, both no-write choices, preserved edits,
  re-created draft identities only after explicit review, and failed/stale reads.
- Production build, isolation suite, real D1 suite, lint, focused types, browser
  suite, and seeded local HTTP public/clone isolation.

Executed local gates: production build PASS; isolation 152/152; actual-handler
D1 18/18; lint PASS; focused types PASS; Chromium browser 50/50; seeded local
HTTP public/clone isolation PASS. The browser fixtures include 320px and 390px
review layouts. No tests were skipped.

Broad standalone TypeScript is **not green**: its nine diagnostics are identical
to exact base `1f01baad` after removing line/column offsets. They concern existing
Cloudflare ambient types, a missing `ShowNotFoundError` import, and timeline
typing. No diagnostic was hidden and no unrelated baseline type repair is
claimed. The repository's required focused type gate is green.

Live owner sign-in, production D1, Google Forms/Sheets, optional paid/provider
features, and deployment are not tested or authorized by this work. Public
source does not imply a live rollout. Karen review and any future merge or
deployment approval remain separate.

The historical [#22 handoff](OWNER_SAVE_RECOVERY_HANDOFF.md) describes that earlier
change and its known race; do not redo its in-flight edit or Undo protection.
`lib/show-data.ts` remains unchanged. Suggestions cannot mutate official sets.
Travis owns booking. Nothing pitches, posts, sends, or changes owner settings.

Made-with: Codex Astra Ultra
