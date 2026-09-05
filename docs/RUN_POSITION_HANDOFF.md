# Keep your place through an official set update

Codex Astra Ultra, September 5, 2026. Base:
`8219a2148e40e984631942ec71106837dc550a4c`, after #20.
Branch: `codex/show-night-run-product-20260905`.
Coordination: [Bob-the-Bot #11](https://github.com/rupret007/Bob-the-Bot/issues/11).
Source for draft review; this does not update the live Sites deployment.

## Product problem and change

The old official Save deleted the selected set and inserted every song without
its ID. Even a key or cue correction therefore changed the identity stored by
each performer's current-song marker. The next public refresh lost their place.

Official Save now retains an existing song's ID only when it belongs to that
exact show and set. Reordering or correcting that song keeps its identity;
genuinely new additions receive new database IDs. Duplicate, foreign, unknown,
or malformed supplied identities are refused before the replacement batch.
No matching by title, artist, or position can silently adopt another record.

Band run mode keeps the same selected song through metadata and order changes.
Previous and Next follow the newly verified order. A removed or replaced song
requires an explicit new choice; the app does not skip ahead for the performer.
Conflicting identities disable current-song navigation instead of marking two
rows. The marker belongs to this device; it is not a shared stage cue or a claim
that the band has performed a song or completed a show.

Live reads are serialized and have a ten-second confirmation deadline covering
the response body. Failed, malformed, other-show, or retired reads cannot replace
the current verified list. A new show retires the previous reader and position.
An older confirmed fallback cannot declare a saved song removed while the first
live read is pending. Live rows with malformed original/transition flags are
rejected, so normalization cannot turn an original into a cover with media links.
Storage denial leaves run controls usable in the open page with a clear warning;
it does not claim that the device will remember the position after closing.

## Reused boundaries

- Existing songs table, owner authentication, normalization, and atomic D1 batch.
- Exact show/set membership, official/public projections, and scoped snapshots.
- Existing practice-position key and controls, not a second store or live cursor.
- Existing fixture browser harness and local D1 verifier. Test ports are explicit;
  the verifier must own its server and never reuse unrelated localhost apps.

The official baseline `lib/show-data.ts` remains unchanged. Suggestions do not
change official sets. Original-song media rules, empty clones, lifecycle guards,
and owner-only writes remain intact. Travis still books; nothing pitches, sends,
posts, publishes, or deploys automatically.

## Verification and limits

Run the repository's full test/build, lint, focused types, browser, and local D1
gates. The PR and coordination AFTER receipt record the actual executed counts,
exact source tip, and hosted run; earlier main or #20 evidence is not evidence
for this slice. Browser tests use the real component with intercepted fixtures,
not live owner sign-in or a Sites session. D1 write tests use synthetic records
and a test-only authenticated context, never a product authentication bypass.

Existing local positions referencing IDs destroyed by an older app version
cannot be reconstructed safely. Choose the current song once; no title/index
guess is made. A removed song that is added again is a new record, not the old
performance position. Clients omitting IDs still create new rows; the existing
owner editor sends IDs for saved songs and temporary draft tokens for additions.

Identity continuity is **not** the later owner-save recovery work. That dedicated
slice now lives in [OWNER_SAVE_RECOVERY_HANDOFF.md](OWNER_SAVE_RECOVERY_HANDOFF.md):
reviewed-base receipts, in-flight edit keep, uncertain readback, and bound Undo.
Do not claim song-ID retention solved those. A durable revision is still not a
maximum song timestamp: removing songs can move that value backward or empty it.

Standalone full TypeScript has the documented pre-existing Worker/show-store
diagnostics; the focused check is not a claim that the unrelated baseline is
green. No dependency or schema change is required by the identity improvement.
Live provider delivery, owner login, device acceptance, merge, and deployment
remain untested or owner-gated. No hosted success is claimed until the exact
draft head's run executes and passes.
