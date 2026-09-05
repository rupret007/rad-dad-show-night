import assert from "node:assert/strict";
import test from "node:test";
import * as identity from "../lib/official-set-identity.ts";
import { loadOfficialSetRoute } from "./fixtures/official-set-route.mjs";
const SHOW = { id: "fixture-show", slug: "fixture-night", status: "draft" };
const SET = "rad-dad";
const columns = [
  "show_id", "set_slug", "position", "title", "artist", "transition", "is_original",
  "duration_seconds", "performance_note", "song_key", "tuning", "youtube_url",
  "youtube_video_id", "chords_url", "lyrics_url", "rehearsal_notes", "updated_by",
  "created_at", "updated_at",
];
const clone = (value) => structuredClone(value);

function storedSong(id, extra = {}) {
  return {
    id, show_id: SHOW.id, set_slug: SET, position: id === 11 ? 1 : 2,
    title: `Fixture song ${id}`, artist: "Fixture band", transition: 0, is_original: 0,
    duration_seconds: 180, performance_note: "", song_key: "", tuning: "",
    youtube_url: "", youtube_video_id: "", chords_url: "", lyrics_url: "",
    rehearsal_notes: "Owner-only fixture notes", updated_by: "fixture@test.invalid",
    created_at: "2026-09-05T00:00:00.000Z", updated_at: "2026-09-05T00:00:00.000Z",
    ...extra,
  };
}

function songPayload(row) {
  return {
    id: row.id, showId: row.show_id, setSlug: row.set_slug,
    position: row.position, title: row.title, artist: row.artist,
    transition: Boolean(row.transition), isOriginal: Boolean(row.is_original),
    durationSeconds: row.duration_seconds, performanceNote: row.performance_note,
    songKey: row.song_key, tuning: row.tuning, youtubeUrl: row.youtube_url,
    youtubeVideoId: row.youtube_video_id, chordsUrl: row.chords_url,
    lyricsUrl: row.lyrics_url, rehearsalNotes: row.rehearsal_notes, updatedAt: row.updated_at,
  };
}

// Exact allowed SQL and transaction-local state. This fake proves handler
// sequencing/bindings; a separate disposable D1 gate proves engine behavior.
function routeFixture(options = {}) {
  let rows = clone(options.rows ?? [
    storedSong(11), storedSong(22),
    storedSong(33, { set_slug: "stalemate", title: "Another set" }),
    storedSong(44, { show_id: "foreign-show", title: "Another night" }),
  ]);
  let sequence = 90;
  const calls = { seeded: 0, scope: [], reads: [], batches: [], savedReads: 0 };
  const db = {
    prepare(sql) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      return {
        bind(...bindings) {
          return {
            sql: normalizedSql,
            bindings,
            async all() {
              assert.equal(normalizedSql, "SELECT id, created_at FROM songs WHERE show_id = ? AND set_slug = ?");
              assert.equal(bindings.length, 2);
              calls.reads.push(clone(bindings));
              if (options.readFailure) throw new Error("Fixture identity read unavailable");
              if (options.readResult) return clone(options.readResult);
              return { success: true, results: rows.filter((row) => row.show_id === bindings[0] && row.set_slug === bindings[1]).map(({ id, created_at }) => ({ id, created_at })) };
            }
          };
        }
      };
    },
    async batch(statements) {
      calls.batches.push(statements.map(({ sql, bindings }) => clone({ sql, bindings })));
      let staged = clone(rows);
      let stagedSequence = sequence;
      for (const [index, statement] of statements.entries()) {
        const { sql, bindings } = statement;
        if (index === 0) {
          assert.equal(sql, "DELETE FROM songs WHERE show_id = ? AND set_slug = ?");
          assert.deepEqual(bindings, [SHOW.id, SET]);
          staged = staged.filter((row) => row.show_id !== bindings[0] || row.set_slug !== bindings[1]);
          continue;
        }
        const match = /^INSERT INTO songs \( (.+) \) VALUES \((.+)\)$/.exec(sql);
        assert.ok(match, `Unexpected SQL: ${sql}`);
        const names = match[1].split(",").map((name) => name.trim());
        const placeholders = match[2].split(",").map((value) => value.trim());
        const reusing = names[0] === "id";
        assert.deepEqual(names, reusing ? ["id", ...columns] : columns);
        assert.equal(placeholders.every((value) => value === "?"), true);
        assert.equal(bindings.length, names.length);
        assert.equal(placeholders.length, names.length);
        const row = Object.fromEntries(names.map((name, item) => [name, bindings[item]]));
        if (!reusing) row.id = ++stagedSequence;
        else stagedSequence = Math.max(stagedSequence, row.id);
        assert.equal(staged.some((stored) => stored.id === row.id), false, "An existing row outside the selected set must never be replaced");
        if (options.failInsertAt === index) throw new Error("Fixture batch insert failed");
        staged.push(row);
      }
      rows = staged;
      sequence = stagedSequence;
      return statements.map(() => ({ success: true }));
    }
  };
  const route = loadOfficialSetRoute({
    db,
    getAdminUser: async () => options.anonymous ? null : { email: "owner-fixture@test.invalid" },
    store: {
        ensureShowSeeded: async () => { calls.seeded += 1; },
        getShowRecord: async (slug, scope) => {
          calls.scope.push([slug, scope]);
          if (slug !== SHOW.slug) throw Object.assign(new Error("Show not found."), { name: "ShowNotFoundError" });
          return SHOW;
        },
        getOfficialSongs: async (showId) => {
          calls.savedReads += 1;
          assert.equal(showId, SHOW.id);
          return rows.filter((row) => row.show_id === showId).sort((a, b) => a.position - b.position).map(songPayload);
        },
    },
  });
  return { POST: route.POST, calls, get rows() { return clone(rows); } };
}

function request(songs, extra = {}) {
  return new Request("https://fixture.invalid/api/show", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showSlug: SHOW.slug, setSlug: SET, songs, ...extra }),
  });
}

test("identity plans retain only proven numeric IDs and never guess from names or positions", () => {
  assert.deepEqual(identity.resolveOfficialSetSongIds([
    { id: 22 }, { id: "draft-r0-1" }, { title: "Same title as saved row", position: 1 }, { id: 11 }, { id: "draft--2" },
  ], [11, 22], SHOW.id, SET), [22, null, null, 11, null]);
});

test("malformed, ambiguous, or repeated identity tokens fail closed", () => {
  for (const id of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "11", "011", " 11", "", "draft", "draft-r0-0", "draft-r0-1\n", "draft-r0-1\r", "draft-<script>-1", `draft-${"x".repeat(130)}-1`, {}, []]) {
    assert.throws(() => identity.resolveOfficialSetSongIds([{ id }], [11], SHOW.id, SET), identity.OfficialSetIdentityError, String(id));
  }
  for (const submitted of [null, [], "song", 42]) {
    assert.throws(() => identity.resolveOfficialSetSongIds([submitted], [11], SHOW.id, SET), identity.OfficialSetIdentityError);
  }
  for (const id of [11, "draft-r0-1"]) {
    assert.throws(() => identity.resolveOfficialSetSongIds([{ id }, { id }], [11], SHOW.id, SET), identity.OfficialSetIdentityError);
  }
});

test("the actual owner save preserves IDs through metadata edits and reordering", async () => {
  const h = routeFixture();
  const untouched = h.rows.filter((row) => row.id === 33 || row.id === 44);
  const response = await h.POST(request([
    { ...songPayload(storedSong(22)), position: 999, songKey: " G ", transition: true, performanceNote: "Count in together" },
    { ...songPayload(storedSong(11)), title: "Revised fixture title", tuning: "Drop D" },
  ]));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.songs.map((song) => song.id), [22, 11]);
  assert.deepEqual(result.songs.map((song) => song.position), [1, 2]);
  assert.equal(result.songs[0].songKey, "G");
  assert.equal(result.songs[0].transition, true);
  assert.equal(result.songs[1].title, "Revised fixture title");
  assert.equal(result.songs[1].rehearsalNotes, "Owner-only fixture notes");
  assert.equal(h.rows.find((row) => row.id === 11).created_at, storedSong(11).created_at);
  assert.equal(h.rows.find((row) => row.id === 22).created_at, storedSong(22).created_at);
  assert.deepEqual(h.rows.filter((row) => row.id === 33 || row.id === 44), untouched);
  assert.deepEqual(h.calls.scope, [[SHOW.slug, "owner"]]);
  assert.deepEqual(h.calls.reads, [[SHOW.id, SET]]);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].slice(1).every((statement) => statement.sql.includes("( id, show_id")), true);
});

test("new UI drafts and legacy omitted IDs get database identities without inheriting deleted IDs", async () => {
  const h = routeFixture();
  const response = await h.POST(request([
    { id: "draft-r0-1", showId: SHOW.id, setSlug: SET, title: "New original", isOriginal: true },
    { id: 22, title: "Retained song" },
    { title: "Legacy client new song" },
  ]));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.songs.map((song) => song.id), [91, 22, 92]);
  assert.equal(h.rows.some((row) => row.id === 11), false);
  const inserts = h.calls.batches[0].slice(1);
  assert.equal(inserts[0].sql.includes("( id,"), false);
  assert.equal(inserts[1].sql.includes("( id,"), true);
  assert.equal(inserts[2].sql.includes("( id,"), false);
  const saved = await h.POST(request(result.songs));
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).songs.map((song) => song.id), [91, 22, 92]);
});

test("foreign-set, foreign-show, and unknown numeric IDs return the same rejection with zero writes", async () => {
  const messages = [];
  for (const id of [33, 44, 999]) {
    const h = routeFixture();
    const before = h.rows;
    const response = await h.POST(request([{ id, title: "Do not move or resurrect this row" }]));
    assert.equal(response.status, 400);
    messages.push((await response.json()).error);
    assert.deepEqual(h.rows, before);
    assert.deepEqual(h.calls.batches, []);
    assert.equal(h.calls.savedReads, 0);
  }
  assert.equal(new Set(messages).size, 1);
});

test("mixed valid and invalid identities reject the entire request before the delete batch", async () => {
  for (const bad of [{ id: null }, { id: "11" }, { id: 0 }, { id: 11 }, { id: "other-row" }, { id: "draft-r0-1\n" }, { id: 22, showId: "another-show" }, { id: 22, setSlug: "stalemate" }, { id: "draft-r0-1", showId: "another-show" }]) {
    const h = routeFixture();
    const before = h.rows;
    const response = await h.POST(request([{ id: 11, title: "Known song" }, { title: "Invalid row", ...bad }]));
    assert.equal(response.status, 400, JSON.stringify(bad));
    assert.deepEqual(h.calls.batches, []);
    assert.deepEqual(h.rows, before);
  }
});

test("duplicate new draft tokens and non-object song rows cannot become different saved songs", async () => {
  for (const songs of [[{ id: "draft-r0-1", title: "One" }, { id: "draft-r0-1", title: "Two" }], [null], [[]], ["text"]]) {
    const h = routeFixture();
    const response = await h.POST(request(songs));
    assert.equal(response.status, 400);
    assert.deepEqual(h.calls.batches, []);
  }
});

test("anonymous requests cannot read identities, seed the database, or write a batch", async () => {
  const h = routeFixture({ anonymous: true });
  const response = await h.POST(request([{ id: 11, title: "Unauthorized" }]));
  assert.equal(response.status, 401);
  assert.equal(h.calls.seeded, 0);
  assert.deepEqual(h.calls.scope, []);
  assert.deepEqual(h.calls.reads, []);
  assert.deepEqual(h.calls.batches, []);
});

test("unknown shows and invalid set/size remain rejected before any destructive batch", async () => {
  for (const [extra, songs, status] of [
    [{ showSlug: "other-night" }, [{ id: 11, title: "Unknown show" }], 404],
    [{ setSlug: "unknown" }, [], 400],
    [{}, Array.from({ length: 61 }, () => ({ title: "Too many songs" })), 400],
  ]) {
    const h = routeFixture();
    assert.equal((await h.POST(request(songs, extra))).status, status);
    assert.deepEqual(h.calls.batches, []);
  }
});

test("unavailable or malformed identity reads never become permission to recreate songs", async () => {
  for (const options of [{ readFailure: true }, { readResult: { success: false, results: [] } }, { readResult: { success: true } }, { readResult: { success: true, results: [{ id: "11", created_at: "2026-09-05" }] } }, { readResult: { success: true, results: [{ id: 11, created_at: null }] } }]) {
    const h = routeFixture(options);
    const before = h.rows;
    assert.equal((await h.POST(request([{ id: 11, title: "Known song" }]))).status, 500);
    assert.deepEqual(h.calls.batches, []);
    assert.deepEqual(h.rows, before);
  }
});

test("an explicit empty set removes only that show's selected set", async () => {
  const h = routeFixture();
  const untouched = h.rows.filter((row) => row.id === 33 || row.id === 44);
  const response = await h.POST(request([]));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).songs, []);
  assert.deepEqual(h.rows, untouched);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.batches[0].length, 1);
});

test("a failed insert does not commit the fake's partial delete or earlier retained rows", async () => {
  const h = routeFixture({ failInsertAt: 2 });
  const before = h.rows;
  const response = await h.POST(request([{ id: 22, title: "Retained" }, { title: "New row" }]));
  assert.equal(response.status, 500);
  assert.equal(h.calls.batches.length, 1);
  assert.equal(h.calls.savedReads, 0);
  assert.deepEqual(h.rows, before);
});

test("normalization, original flags, and owner attribution are preserved alongside stable identity", async () => {
  const h = routeFixture();
  const response = await h.POST(request([{
    id: 11, title: "  Original fixture  ", artist: "  Fixture artist  ", isOriginal: true,
    youtubeUrl: "https://www.youtube.com/results?search_query=fixture",
    lyricsUrl: "javascript:alert(1)", chordsUrl: "https://www.ultimate-guitar.com/search.php?value=fixture",
    durationSeconds: 9999, rehearsalNotes: "  Private fixture note  ",
  }]));
  assert.equal(response.status, 200);
  const song = (await response.json()).songs[0];
  assert.equal(song.id, 11);
  assert.equal(song.title, "Original fixture");
  assert.equal(song.artist, "Fixture artist");
  assert.equal(song.isOriginal, true);
  assert.equal(song.durationSeconds, 1200);
  assert.equal(song.youtubeUrl, "");
  assert.equal(song.lyricsUrl, "");
  assert.equal(song.chordsUrl, "");
  assert.equal(song.rehearsalNotes, "Private fixture note");
  assert.equal(h.rows.find((row) => row.id === 11).updated_by, "owner-fixture@test.invalid");
});
