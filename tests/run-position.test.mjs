import assert from "node:assert/strict";
import test from "node:test";
import { resolveRunPosition } from "../lib/run-position.ts";

const song = (id, title = `Fixture ${id}`, setSlug = "rad-dad") => ({ id, title, setSlug });

test("no selected place never invents the first or next song", () => {
  for (const selection of [null, undefined, ""]) {
    const result = resolveRunPosition([song(1), song(2)], selection);
    assert.equal(result.kind, "unselected");
    assert.equal(result.currentSong, null);
    assert.equal(result.nextSong, null);
    assert.equal(result.currentIndex, -1);
  }
});

test("metadata edits preserve exact identity and display the updated record", () => {
  const updated = song(2, "Corrected fixture title");
  const result = resolveRunPosition([song(1), updated, song(3)], "2");
  assert.equal(result.kind, "selected");
  assert.equal(result.currentSong, updated);
  assert.equal(result.previousSong.id, 1);
  assert.equal(result.nextSong.id, 3);
});

test("reordering follows the same song, with next drawn from the new order", () => {
  const result = resolveRunPosition([song(3), song(2), song(1)], "2");
  assert.equal(result.currentIndex, 1);
  assert.equal(result.previousSong.id, 3);
  assert.equal(result.nextSong.id, 1);
  const moved = resolveRunPosition([song(2), song(1), song(3)], "2");
  assert.equal(moved.currentIndex, 0);
  assert.equal(moved.previousSong, null);
  assert.equal(moved.nextSong.id, 1);
});

test("an actually removed place requires a new choice, even with matching titles or positions", () => {
  const result = resolveRunPosition([song(1, "Same title"), song(4, "Same title")], "2");
  assert.equal(result.kind, "missing");
  assert.equal(result.currentSong, null);
  assert.equal(result.nextSong, null);
  assert.equal(result.previousSong, null);
});

test("an empty show never borrows a prior place", () => {
  assert.equal(resolveRunPosition([], "2").kind, "missing");
  assert.equal(resolveRunPosition([], null).kind, "unselected");
  assert.equal(resolveRunPosition([song(5, "Other show")], "2").currentSong, null);
});

test("last song has no next and does not infer show completion", () => {
  const result = resolveRunPosition([song(1), song(2)], "2");
  assert.equal(result.kind, "selected");
  assert.equal(result.currentSong.id, 2);
  assert.equal(result.nextSong, null);
  assert.equal("showCompleted" in result, false);
});

test("next may cross an explicit set boundary without inventing songs in empty sets", () => {
  const result = resolveRunPosition([song(1, "Opening", "jeff-story-friends"), song(2)], "1");
  assert.equal(result.nextSong.setSlug, "rad-dad");
});

test("duplicate or malformed identities fail closed for the entire navigation order", () => {
  for (const songs of [
    [song(1), song(1)], [song(1), song("1")], [song(1), song(2), song(2)],
    [song(0)], [song(-1)], [song(1.5)], [song(NaN)], [song(Infinity)],
    [song(Number.MAX_SAFE_INTEGER + 1)], [song("")], [song(" padded ")],
    [song("x".repeat(141))], [song("101\n")], [song("101\r\n")], [song(null)], [null],
  ]) {
    const result = resolveRunPosition(songs, "1");
    assert.equal(result.kind, "ambiguous", JSON.stringify(songs));
    assert.equal(result.currentSong, null);
    assert.equal(result.nextSong, null);
  }
});

test("saved identity is exact, bounded and never numerically coerced", () => {
  for (const selection of ["01", " 1 ", "1.0", "1\n", "-1", "x".repeat(141)]) {
    assert.equal(resolveRunPosition([song(1)], selection).kind, "missing");
  }
  assert.equal(resolveRunPosition([song("fixture-1")], "fixture-1").kind, "selected");
});

test("resolving a place does not mutate or reorder source records", () => {
  const songs = Object.freeze([Object.freeze(song(2)), Object.freeze(song(1))]);
  const result = resolveRunPosition(songs, "2");
  assert.deepEqual(songs.map((entry) => entry.id), [2, 1]);
  assert.equal(result.currentSong, songs[0]);
});
