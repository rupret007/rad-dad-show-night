import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { Miniflare } from "miniflare";
import { loadOfficialSetRoute } from "./fixtures/official-set-route.mjs";

const SHOW = { id: "identity-fixture-show", slug: "identity-fixture-night", status: "draft" };
const SET = "rad-dad";
const CREATED = "2026-01-01 00:00:00";
let runtime;
let db;

before(async () => {
  runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("Offline identity fixture only"); } };',
    compatibilityDate: "2026-05-15",
    host: "127.0.0.1",
    port: 0,
    d1Databases: ["DB"],
    d1Persist: false,
  });
  db = await runtime.getD1Database("DB");
  // Use the repository's exact DDL, but never insert the migration's real show
  // plan or invoke ensureShowSeeded. Every row below is synthetic and ephemeral.
  for (const filename of ["0000_show_control.sql", "0001_original_song_resources.sql", "0002_multi_show_manager.sql"]) {
    const migration = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      if (/^(?:CREATE|ALTER|DROP)\s/.test(statement)) await db.prepare(statement).run();
      else assert.match(statement, /^(?:INSERT|UPDATE)\s/, "Review an unexpected migration statement before including it in this fixture");
    }
  }
});

after(async () => {
  await runtime?.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DROP TRIGGER IF EXISTS reject_fixture_song"),
    db.prepare("DELETE FROM songs"),
    db.prepare("DELETE FROM shows"),
    db.prepare("INSERT INTO shows (id, slug, title, venue, show_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(SHOW.id, SHOW.slug, "Synthetic fixture night", "Synthetic venue", "2026-10-01", "7 PM", "9 PM"),
    db.prepare("INSERT INTO shows (id, slug, title, venue, show_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("identity-foreign-show", "identity-foreign-night", "Another synthetic night", "Another synthetic venue", "2026-10-02", "7 PM", "9 PM"),
    ...[
      [11, SHOW.id, SET, 1, "Fixture opening song"],
      [22, SHOW.id, SET, 2, "Fixture closing song"],
      [33, SHOW.id, "stalemate", 1, "Fixture other set"],
      [44, "identity-foreign-show", SET, 1, "Fixture other night"],
      [90, SHOW.id, SET, 3, "Fixture previously removed song"],
    ].map((values) => db.prepare("INSERT INTO songs (id, show_id, set_slug, position, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(...values, CREATED, CREATED)),
    db.prepare("DELETE FROM songs WHERE id = 90"),
  ]);
});

async function allRows() {
  return (await db.prepare("SELECT * FROM songs ORDER BY id").all()).results;
}

function fixtureRoute({ owner = true } = {}) {
  const calls = { prepares: 0, batches: 0, scope: [] };
  const observedDb = {
    prepare(sql) { calls.prepares += 1; return db.prepare(sql); },
    batch(statements) { calls.batches += 1; return db.batch(statements); },
  };
  const route = loadOfficialSetRoute({
    db: observedDb,
    getAdminUser: async () => owner ? { email: "synthetic-owner@test.invalid" } : null,
    store: {
      ensureShowSeeded: async () => { /* No real official seed is loaded. */ },
      getShowRecord: async (slug, scope) => {
        calls.scope.push([slug, scope]);
        assert.equal(scope, "owner");
        const row = await db.prepare("SELECT id, slug, status FROM shows WHERE slug = ?").bind(slug).first();
        if (!row) throw Object.assign(new Error("Show not found."), { name: "ShowNotFoundError" });
        return row;
      },
      getOfficialSongs: async (showId) => (await db.prepare(`SELECT
        id, show_id AS showId, set_slug AS setSlug, position, title, artist,
        transition, is_original AS isOriginal, duration_seconds AS durationSeconds,
        performance_note AS performanceNote, song_key AS songKey, tuning,
        youtube_url AS youtubeUrl, youtube_video_id AS youtubeVideoId,
        chords_url AS chordsUrl, lyrics_url AS lyricsUrl,
        rehearsal_notes AS rehearsalNotes, updated_at AS updatedAt
        FROM songs WHERE show_id = ? ORDER BY set_slug, position, id`).bind(showId).all()).results,
    },
  });
  return { ...route, calls };
}

function request(songs, extra = {}) {
  return new Request("https://fixture.invalid/api/show", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ showSlug: SHOW.slug, setSlug: SET, songs, ...extra }),
  });
}

test("local D1: actual owner handler retains song IDs and creation times through reorder and cue edits", async () => {
  const beforeRows = await allRows();
  const route = fixtureRoute();
  const response = await route.POST(request([
    { id: 22, title: "Fixture closing song", songKey: "G", performanceNote: "Count in together" },
    { id: 11, title: "Fixture opening song", transition: true },
  ]));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).songs.map((song) => [song.id, song.position]), [[22, 1], [11, 2]]);
  const rows = await allRows();
  assert.deepEqual(rows.filter((row) => row.id === 33 || row.id === 44), beforeRows.filter((row) => row.id === 33 || row.id === 44));
  assert.equal(rows.find((row) => row.id === 22).song_key, "G");
  assert.equal(rows.find((row) => row.id === 22).created_at, CREATED);
  assert.equal(rows.find((row) => row.id === 11).created_at, CREATED);
  assert.equal(rows.find((row) => row.id === 22).updated_by, "synthetic-owner@test.invalid");
  assert.equal(route.calls.batches, 1);
});

test("local D1: new and legacy additions use AUTOINCREMENT, then keep their assigned IDs on the next save", async () => {
  const route = fixtureRoute();
  const response = await route.POST(request([
    { id: "draft-r0-1", title: "New fixture song", showId: SHOW.id, setSlug: SET },
    { id: 22, title: "Retained fixture song" },
    { title: "Legacy new fixture song" },
  ]));
  assert.equal(response.status, 200);
  const songs = (await response.json()).songs;
  assert.equal(songs[1].id, 22);
  assert.ok(Number.isSafeInteger(songs[0].id) && songs[0].id > 90);
  assert.ok(Number.isSafeInteger(songs[2].id) && songs[2].id > songs[0].id);
  const rows = await allRows();
  assert.equal(rows.some((row) => row.id === 11 || row.id === 90), false);
  assert.notEqual(rows.find((row) => row.id === songs[0].id).created_at, CREATED);
  const savedAgain = await route.POST(request(songs));
  assert.equal(savedAgain.status, 200);
  assert.deepEqual((await savedAgain.json()).songs.map((song) => song.id), songs.map((song) => song.id));
});

test("local D1: rejected foreign, missing, malformed, and duplicate IDs perform no replacement batch", async () => {
  const beforeRows = await allRows();
  for (const songs of [
    [{ id: 33, title: "Other set" }], [{ id: 44, title: "Other night" }], [{ id: 9999, title: "Unknown row" }],
    [{ id: 11, title: "One" }, { id: 11, title: "Duplicate" }],
    [{ id: "draft-r0-1", title: "One" }, { id: "draft-r0-1", title: "Duplicate draft" }],
    [{ id: "11", title: "Numeric string" }], [{ id: null, title: "Missing receipt is not null" }],
    [{ id: 11, showId: "identity-foreign-show", title: "Mismatched show" }],
  ]) {
    const route = fixtureRoute();
    assert.equal((await route.POST(request(songs))).status, 400);
    assert.equal(route.calls.batches, 0);
    assert.deepEqual(await allRows(), beforeRows);
  }
});

test("local D1: actual batch rollback preserves all rows if a later insertion fails", async () => {
  const beforeRows = await allRows();
  await db.prepare(`CREATE TRIGGER reject_fixture_song BEFORE INSERT ON songs
    WHEN NEW.title = 'Reject this fixture insertion'
    BEGIN SELECT RAISE(ABORT, 'Deliberate isolated batch failure'); END`).run();
  const route = fixtureRoute();
  const response = await route.POST(request([
    { id: 22, title: "Earlier insertion must roll back" },
    { title: "Reject this fixture insertion" },
  ]));
  assert.equal(response.status, 500);
  assert.equal(route.calls.batches, 1);
  assert.deepEqual(await allRows(), beforeRows);
});

test("local D1: owner-only empty saves affect only the selected set and unknown shows never fall back", async () => {
  const beforeRows = await allRows();
  const anonymous = fixtureRoute({ owner: false });
  assert.equal((await anonymous.POST(request([]))).status, 401);
  assert.equal(anonymous.calls.prepares, 0);
  assert.equal(anonymous.calls.batches, 0);
  const missing = fixtureRoute();
  assert.equal((await missing.POST(request([], { showSlug: "unknown-fixture-night" }))).status, 404);
  assert.equal(missing.calls.batches, 0);
  const route = fixtureRoute();
  const response = await route.POST(request([]));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).songs, []);
  assert.deepEqual(await allRows(), beforeRows.filter((row) => row.id === 33 || row.id === 44));
});
