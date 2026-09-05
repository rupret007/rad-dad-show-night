import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applySuccessfulOfficialSave,
  bindUndoRemove,
  canApplyUndoRemove,
  classifyOwnerSaveResult,
  EMPTY_OFFICIAL_SET_REVISION,
  officialSetRevision,
  ownerSetDraftEquals,
  readReviewedBase,
  reconcileCheckedOfficialSet,
  remapSavedOfficialIdentities,
} from "../lib/owner-set-save.ts";
import {
  showOwnerCheckedKeptDraftNotice,
  showOwnerSaveHoldNotice,
  showOwnerSavedWithLaterEditsNotice,
} from "../lib/show-lifecycle.ts";

const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const routeUrl = new URL("../app/api/show/route.ts", import.meta.url);
const leftoverHostedUrl = new URL("../scripts/hosted-leftover-honesty.mjs", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);

const song = (id, extra = {}) => ({
  id,
  showId: "fixture-show",
  setSlug: "rad-dad",
  position: 1,
  title: `Fixture ${id}`,
  artist: "Fixture band",
  transition: false,
  isOriginal: false,
  durationSeconds: 180,
  performanceNote: "",
  songKey: "",
  tuning: "",
  youtubeUrl: "",
  youtubeVideoId: "",
  chordsUrl: "",
  lyricsUrl: "",
  rehearsalNotes: "",
  updatedAt: "2026-09-05T00:00:00.000Z",
  ...extra,
});

test("official set revision is sorted identities, not a max timestamp", () => {
  assert.equal(officialSetRevision([]), EMPTY_OFFICIAL_SET_REVISION);
  const newerOlder = officialSetRevision([
    song(22, { updatedAt: "2026-09-05T02:00:00.000Z" }),
    song(11, { updatedAt: "2026-09-05T03:00:00.000Z" }),
  ]);
  const removedNewest = officialSetRevision([
    song(22, { updatedAt: "2026-09-05T02:00:00.000Z" }),
  ]);
  assert.equal(newerOlder, "2:11:2026-09-05T03:00:00.000Z|22:2026-09-05T02:00:00.000Z");
  assert.equal(removedNewest, "1:22:2026-09-05T02:00:00.000Z");
  assert.notEqual(removedNewest, newerOlder);
  assert.equal(officialSetRevision([song("draft-r0-1")]), null);
  assert.equal(readReviewedBase(newerOlder), newerOlder);
  assert.equal(readReviewedBase("2:22:2026-09-05T02:00:00.000Z|11:2026-09-05T03:00:00.000Z"), null);
  assert.equal(readReviewedBase(null), null);
  assert.equal(readReviewedBase(""), null);
});

test("a successful save keeps later edits and remaps only the sent identities", () => {
  const sent = [song(11, { performanceNote: "Count in" })];
  const saved = [song(11, { performanceNote: "Count in", updatedAt: "2026-09-05T01:00:00.000Z" })];
  const applied = applySuccessfulOfficialSave({
    currentSongs: [song(11, { performanceNote: "Hold the ending" })],
    sentSongs: sent,
    savedSongs: saved,
  });
  assert.equal(applied.stillDirty, true);
  assert.equal(applied.songs[0].performanceNote, "Hold the ending");
  assert.equal(applied.songs[0].updatedAt, "2026-09-05T01:00:00.000Z");
  assert.equal(applied.reviewedBase, officialSetRevision(saved));

  const clean = applySuccessfulOfficialSave({
    currentSongs: sent,
    sentSongs: sent,
    savedSongs: saved,
  });
  assert.equal(clean.stillDirty, false);
  assert.deepEqual(clean.songs, saved);

  const remapped = remapSavedOfficialIdentities(
    [song("draft-r0-1", { title: "Later title" }), song("draft-r0-2", { title: "After save" })],
    [song("draft-r0-1", { title: "Sent title" })],
    [song(91, { title: "Sent title", updatedAt: "2026-09-05T01:00:00.000Z" })],
  );
  assert.equal(remapped[0].id, 91);
  assert.equal(remapped[0].title, "Later title");
  assert.equal(remapped[1].id, "draft-r0-2");
});

test("save results distinguish refused, conflict, uncertain, and verified readback", () => {
  const saved = [song(11, { updatedAt: "2026-09-05T01:00:00.000Z" })];
  assert.equal(classifyOwnerSaveResult({
    ok: true, status: 200, showId: "fixture-show", setSlug: "rad-dad",
    body: { songs: saved, reviewedBase: officialSetRevision(saved) },
  }).kind, "saved");
  assert.equal(classifyOwnerSaveResult({
    ok: false, status: 409, showId: "fixture-show", setSlug: "rad-dad",
    body: { error: "This set changed since you last loaded it." },
  }).kind, "conflict");
  assert.equal(classifyOwnerSaveResult({
    ok: true, status: 202, showId: "fixture-show", setSlug: "rad-dad",
    body: { written: true, error: "unverified" },
  }).kind, "uncertain");
  assert.equal(classifyOwnerSaveResult({
    ok: true, status: 200, showId: "fixture-show", setSlug: "rad-dad",
    body: { songs: [song(11, { showId: "other-show" })] },
  }).kind, "uncertain");
  assert.equal(classifyOwnerSaveResult({
    ok: false, status: 400, showId: "fixture-show", setSlug: "rad-dad",
    body: { error: "Reload the official set before saving." },
  }).kind, "refused");
  assert.equal(classifyOwnerSaveResult({
    ok: false, status: 500, showId: "fixture-show", setSlug: "rad-dad",
    body: {},
  }).kind, "uncertain");
});

test("checking a saved list keeps a diverged draft and binds undo to one show and set", () => {
  const official = [song(11, { performanceNote: "Saved cue", updatedAt: "2026-09-05T01:00:00.000Z" })];
  const kept = reconcileCheckedOfficialSet({
    draftSongs: [song(11, { performanceNote: "Later cue" })],
    officialSongs: official,
  });
  assert.equal(kept.stillDirty, true);
  assert.equal(kept.songs[0].performanceNote, "Later cue");
  assert.equal(kept.reviewedBase, officialSetRevision(official));

  const matched = reconcileCheckedOfficialSet({
    draftSongs: [song("draft-r0-1", { title: official[0].title, performanceNote: "Saved cue" })],
    officialSongs: official,
  });
  assert.equal(matched.stillDirty, false);
  assert.equal(matched.songs[0].id, 11);
  assert.equal(ownerSetDraftEquals(official, official), true);

  const undo = bindUndoRemove("night-a", "rad-dad", song(11), 0);
  assert.equal(canApplyUndoRemove(undo, "night-a", "rad-dad"), true);
  assert.equal(canApplyUndoRemove(undo, "night-b", "rad-dad"), false);
  assert.equal(canApplyUndoRemove(undo, "night-a", "stalemate"), false);
  assert.equal(canApplyUndoRemove(null, "night-a", "rad-dad"), false);
});

test("Show Control save recovery stays on the existing owner write path", async () => {
  const [control, route, leftoverHosted, page] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(leftoverHostedUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);

  assert.match(control, /reviewedBase/);
  assert.match(control, /sentSongs/);
  assert.match(control, /applySuccessfulOfficialSave/);
  assert.match(control, /classifyOwnerSaveResult/);
  assert.match(control, /checkSavedSet/);
  assert.match(control, /bindUndoRemove/);
  assert.match(control, /data-save-hold=/);
  assert.match(control, /Check saved \$\{activeDefinition\.title\}/);
  assert.match(control, /OWNER_SAVE_DEADLINE_MS/);
  assert.doesNotMatch(control, /action:\s*"pitch"|action:\s*"post"|action:\s*"send"/);

  assert.match(route, /readReviewedBase/);
  assert.match(route, /officialSetRevision/);
  assert.match(route, /status: 409/);
  assert.match(route, /written: true/);
  assert.match(route, /SELECT id, created_at, updated_at FROM songs/);

  assert.match(leftoverHosted, /Check leftover saved|Check saved/);
  assert.doesNotMatch(page, /Check leftover saved/);
  assert.doesNotMatch(page, /data-save-hold/);
  assert.match(showOwnerSaveHoldNotice("uncertain", "Rad Dad"), /may have landed/);
  assert.match(showOwnerSaveHoldNotice("conflict", "Rad Dad"), /changed since you last loaded/);
  assert.match(showOwnerSavedWithLaterEditsNotice("Rad Dad", "draft"), /Later edits/);
  assert.match(showOwnerCheckedKeptDraftNotice("Rad Dad"), /Saving now writes this draft/);
});
