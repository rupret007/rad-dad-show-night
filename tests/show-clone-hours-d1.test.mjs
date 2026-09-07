import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { Miniflare } from "miniflare";
import { cloneShowNightHours } from "../lib/show-public.ts";

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

async function insertClone(id, hours) {
  await db.prepare(
    `INSERT INTO shows (
      id, slug, title, venue, show_date, start_time, end_time, status,
      expected_wrap, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?)`,
  ).bind(id, `${id}-slug`, "Synthetic empty clone", "Other venue", "2026-10-31", hours.startTime, hours.endTime, hours.expectedWrap, "2026-09-06T00:00:00.000Z", "2026-09-06T00:00:00.000Z").run();
  return db.prepare("SELECT start_time, end_time, expected_wrap FROM shows WHERE id = ?").bind(id).first();
}

test("disposable D1 keeps an empty clone from inheriting source hours", async () => {
  const hours = cloneShowNightHours({
    copySongs: false,
    sourceStartTime: SOURCE.start,
    sourceEndTime: SOURCE.end,
    sourceExpectedWrap: SOURCE.wrap,
  });
  const row = await insertClone("hours-empty-clone", hours);
  assert.deepEqual(row, { start_time: "", end_time: "", expected_wrap: "" });
});

test("disposable D1 copies source hours only when the official plan is copied", async () => {
  const copied = await insertClone("hours-copied-clone", cloneShowNightHours({
    copySongs: true,
    sourceStartTime: SOURCE.start,
    sourceEndTime: SOURCE.end,
    sourceExpectedWrap: SOURCE.wrap,
  }));
  assert.deepEqual(copied, {
    start_time: SOURCE.start,
    end_time: SOURCE.end,
    expected_wrap: SOURCE.wrap,
  });

  const overridden = await insertClone("hours-override-clone", cloneShowNightHours({
    copySongs: false,
    sourceStartTime: SOURCE.start,
    sourceEndTime: SOURCE.end,
    sourceExpectedWrap: SOURCE.wrap,
    startTime: "8:00 PM",
    endTime: "11:00 PM",
  }));
  assert.deepEqual(overridden, {
    start_time: "8:00 PM",
    end_time: "11:00 PM",
    expected_wrap: "Expected wrap near 11:00 PM",
  });
});
