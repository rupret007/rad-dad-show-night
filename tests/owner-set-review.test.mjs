import assert from "node:assert/strict";
import test from "node:test";
import { readOwnerSetSongs, readOwnerShowSongs, removedDraftSongs, stageReviewedOwnerDraft, ownerSongReviewDetails } from "../lib/owner-set-review.ts";

const song = (id, extra = {}) => ({
  id, showId: "fixture-night", setSlug: "rad-dad", position: 1, title: "Fixture song", artist: "Fixture band",
  transition: false, isOriginal: true, durationSeconds: 180, performanceNote: "Hold ending", songKey: "G", tuning: "",
  youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "Private fixture only",
  updatedAt: "2026-09-05T20:00:00.000Z", ...extra,
});

test("canonical owner reads preserve private notes and reject malformed or foreign data", () => {
  assert.deepEqual(readOwnerSetSongs([song(1)], "fixture-night", "rad-dad"), [song(1)]);
  for (const rows of [[null], [song(1, { showId: "other" })], [song(1, { setSlug: "stalemate" })],
    [song(1, { isOriginal: "false" })], [song(1, { rehearsalNotes: null })], [song(1, { id: "1" })],
    [song(1), song(1, { position: 2 })], [song(1), song(2)], [song(1, { title: "x".repeat(141) })]]) {
    assert.equal(readOwnerSetSongs(rows, "fixture-night", "rad-dad"), null);
  }
  assert.equal(readOwnerShowSongs([song(1), song(1, { setSlug: "stalemate" })], "fixture-night"), null);
  assert.equal(readOwnerShowSongs([song(1, { setSlug: "foreign" })], "fixture-night"), null);
  assert.deepEqual(readOwnerShowSongs([], "fixture-night"), { "rad-dad": [], stalemate: [], "jeff-story-friends": [] });
});

test("explicit replacement stages only removed numeric IDs as new, never matching titles", () => {
  const draft = [song(1), song(2, { position: 2 }), song("draft-local-1", { position: 3 })];
  const saved = [song(1), song(99, { position: 2, title: draft[1].title })];
  assert.deepEqual(removedDraftSongs(draft, saved).map((row) => row.id), [2]);
  let next = 0;
  const staged = stageReviewedOwnerDraft(draft, saved, "fixture-night", "rad-dad", () => `draft-reviewed-${++next}`);
  assert.deepEqual(staged.map((row) => row.id), [1, "draft-reviewed-1", "draft-local-1"]);
  assert.equal(staged[1].rehearsalNotes, draft[1].rehearsalNotes);
  assert.equal(draft[1].id, 2, "Choice planning must not mutate the retained draft");
});

test("replacement refuses wrong ownership, duplicate or malformed identities", () => {
  for (const draft of [[song(1, { showId: "other" })], [song(1), song(1)], [song("unknown")], [song("draft-test-1\n")]]) {
    assert.equal(stageReviewedOwnerDraft(draft, [], "fixture-night", "rad-dad", () => "draft-review-1"), null);
  }
  assert.equal(stageReviewedOwnerDraft([song(1), song(2)], [], "fixture-night", "rad-dad", () => "draft-review-1"), null);
});

test("comparison shows changed cues, durations, flags and resources without a wall of unchanged details", () => {
  assert.deepEqual(ownerSongReviewDetails(song(1), song(1)), []);
  const details = ownerSongReviewDetails(song(1, { performanceNote: "New cue", durationSeconds: 240, isOriginal: false, lyricsUrl: "https://example.test/fixture" }), song(1));
  assert.deepEqual(details.map((row) => row.label), ["Duration (seconds)", "Performance cue", "Original / hide resources", "Lyrics URL"]);
  assert.equal(details.find((row) => row.label === "Original / hide resources").text, "No");
});
