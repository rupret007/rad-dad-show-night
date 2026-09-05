# Owner save recovery — product handoff

Grok Cloud, September 5, 2026. Base:
`348f626345b60aee5991d4a28a2c96751159cded`, after #21.
Branch: `cursor/owner-save-recovery-9788`.
Coordination: [Bob-the-Bot #11](https://github.com/rupret007/Bob-the-Bot/issues/11).
Source for draft review; this does not update the live Sites deployment.

## Product problem and change

Show Control could lose or overwrite official-set work after Save:

- Edits typed while Save was in flight were replaced by the list that was sent.
- A committed write whose official readback failed looked like a failed save, so
  an unreviewed retry could write again.
- Undo Remove survived a show switch and could restore a song onto another night.

Official Save now sends the last verified official-set receipt with the write.
That receipt is the sorted `id:updatedAt` pairs for the exact show/set, not a
maximum timestamp. A newer saved list refuses the write (`409`) until the owner
checks it. A committed write without a verified official list returns `202` with
`written: true` and no songs. The phone next step becomes **Check saved [set]**.
Later edits stay in this browser after the sent list writes. Undo Remove applies
only on the show and set that removed the song.

## Reused boundaries

- Existing songs table, owner authentication, identity validation, and atomic D1
  batch. No schema, provider, or credential change.
- Existing Show Control Save, leftover owner actions, and public isolation.
- Suggestions still cannot mutate official sets. Travis still books. Nothing
  pitches, posts, or sends.

## Verification and limits

Run the repository's full test/build, lint, focused types, browser, and local D1
gates. The PR and coordination AFTER record the actual executed counts, exact
source tip, and hosted run.

Two empty-set first saves that start from the same `empty:0` receipt can still
replace each other. This is not a shared live cursor and not a multi-user lock
beyond the reviewed official-set receipt. Live owner sign-in was not tested.

`lib/show-data.ts` remains unchanged. Empty clones stay empty. Owner-only writes
remain gated. Nothing pitches or posts. No merge, tag, release, or deploy
belongs to this handoff.
