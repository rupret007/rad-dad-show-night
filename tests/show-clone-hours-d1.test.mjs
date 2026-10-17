import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { Miniflare } from "miniflare";
import { cloneRequest, loadShowsRoute } from "./fixtures/shows-route.mjs";
import { loadOfficialShowStore } from "./fixtures/official-set-route.mjs";

const SOURCE = {
  id: "hours-source-show",
  slug: "hours-source-night",
  start: "7:00 PM",
  end: "10:00 PM",
  wrap: "Expected wrap near 10:00 PM",
};
let runtime;
let db;

before(async () => {
  runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("Offline clone-hours fixture only"); } };',
    compatibilityDate: "2026-05-15",
    host: "127.0.0.1",
    port: 0,
    d1Databases: ["DB"],
    d1Persist: false,
  });
  db = await runtime.getD1Database("DB");
  for (const filename of ["0000_show_control.sql", "0001_original_song_resources.sql", "0002_multi_show_manager.sql", "0003_official_set_revisions.sql"]) {
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
    db.prepare("DELETE FROM official_set_revisions"),
    db.prepare("DELETE FROM songs"),
    db.prepare("DELETE FROM show_blocks"),
    db.prepare("DELETE FROM shows"),
    db.prepare("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('show-control-seed-v1', 'synthetic fixture skips official seed')"),
    db.prepare(
      "INSERT INTO shows (id, slug, title, venue, show_date, start_time, end_time, expected_wrap, status, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', 0)",
    ).bind(SOURCE.id, SOURCE.slug, "Synthetic source night", "Synthetic venue", "2026-09-19", SOURCE.start, SOURCE.end, SOURCE.wrap),
  ]);
});

function fixtureRoute() {
  const calls = { batches: 0 };
  const storage = {
    prepare(sql) { return db.prepare(sql); },
    batch(statements) { calls.batches += 1; return db.batch(statements); },
  };
  return {
    ...loadShowsRoute({
      db: storage,
      getAdminUser: async () => ({ email: "owner@fixture.invalid" }),
      store: loadOfficialShowStore(storage),
    }),
    calls,
  };
}

async function insertClone(overrides) {
  const route = fixtureRoute();
  const response = await route.POST(cloneRequest(overrides));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const { show } = await response.json();
  assert.ok(show.id);
  assert.equal(show.status, "draft");
  assert.equal(show.showDate, overrides?.showDate ?? "2026-10-31");
  assert.equal(route.calls.batches, 1);
  return db.prepare("SELECT start_time, end_time, expected_wrap FROM shows WHERE id = ?").bind(show.id).first();
}

test("disposable D1 keeps an empty clone from inheriting source hours", async () => {
  const row = await insertClone({ copySongs: false });
  assert.deepEqual(row, { start_time: "", end_time: "", expected_wrap: "" });
});

test("disposable D1 copies source hours only when the official plan is copied", async () => {
  const copied = await insertClone({ copySongs: true });
  assert.deepEqual(copied, {
    start_time: SOURCE.start,
    end_time: SOURCE.end,
    expected_wrap: SOURCE.wrap,
  });

  for (const copySongs of [false, true]) {
    const overridden = await insertClone({ copySongs, startTime: " 8:00 PM ", endTime: " 11:00 PM " });
    assert.deepEqual(overridden, {
      start_time: "8:00 PM",
      end_time: "11:00 PM",
      expected_wrap: "Expected wrap near 11:00 PM",
    });
  }
});

test("disposable D1 rejects invalid clone inputs without changing any rows", async () => {
  async function snapshot() {
    return Promise.all(["shows", "songs", "show_blocks", "site_settings"].map(async (table) =>
      (await db.prepare(`SELECT * FROM ${table}`).all()).results));
  }
  // An invalid request must not trigger even the first-use seed write.
  await db.prepare("DELETE FROM site_settings").run();
  const beforeRows = await snapshot();
  for (const payload of [{ showDate: "2026-02-31" }, { showDate: "2100-02-29" }, { startTime: "8 PM" }, { endTime: "11 PM", copySongs: true }]) {
    const route = fixtureRoute();
    assert.equal((await route.POST(cloneRequest(payload))).status, 400);
    assert.equal(route.calls.batches, 0);
    assert.deepEqual(await snapshot(), beforeRows);
  }
});

test("disposable D1 preserves full-copy and empty-copy songs and blocks", async () => {
  await db.batch([
    db.prepare("INSERT INTO songs (show_id, set_slug, position, title, rehearsal_notes) VALUES (?, 'rad-dad', 1, 'Fixture song', 'Fixture note')").bind(SOURCE.id),
    db.prepare("INSERT INTO show_blocks (show_id, position, start_time, end_time, duration, title, type, set_slug) VALUES (?, 1, '7:00', '10:00', '180 min', 'Fixture block', 'performance', 'rad-dad')").bind(SOURCE.id),
  ]);
  for (const copySongs of [false, true]) {
    const response = await fixtureRoute().POST(cloneRequest({ copySongs, showDate: "2028-02-29", startTime: " ", endTime: "\t" }));
    assert.equal(response.status, 201);
    const { show } = await response.json();
    assert.equal(show.showDate, "2028-02-29");
    assert.equal(show.status, "draft");
    assert.equal(show.isDefault, false);
    const songs = (await db.prepare("SELECT title, rehearsal_notes FROM songs WHERE show_id = ?").bind(show.id).all()).results;
    const blocks = (await db.prepare("SELECT title FROM show_blocks WHERE show_id = ?").bind(show.id).all()).results;
    assert.deepEqual(songs, copySongs ? [{ title: "Fixture song", rehearsal_notes: "Fixture note" }] : []);
    assert.deepEqual(blocks, copySongs ? [{ title: "Fixture block" }] : []);
  }
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM songs WHERE show_id = ?").bind(SOURCE.id).first()).count, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM show_blocks WHERE show_id = ?").bind(SOURCE.id).first()).count, 1);
});
