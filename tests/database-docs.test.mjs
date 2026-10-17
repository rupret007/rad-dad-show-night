import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [guide, store, schema, migration] = await Promise.all([
  read("docs/TECHNICAL_GUIDE.md"),
  read("lib/show-store.ts"),
  read("db/schema.ts"),
  read("drizzle/0002_multi_show_manager.sql"),
]);

function section(heading) {
  const start = guide.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `Missing guide section: ${heading}`);
  return guide.slice(start + heading.length).split(/\n#{1,3} /)[0].replace(/\s+/g, " ");
}

test("GET documentation discloses the seed write before ordinary read-only operation", () => {
  const api = section("### `GET /api/show`");
  assert.match(api, /no-store/);
  assert.match(api, /getShowPayload.*ensureShowSeeded/);
  assert.match(api, /one-time.*seed.*side effect/i);
  assert.match(api, /marker.*absent/i);
  assert.match(api, /read-only after.*seed marker/i);
  assert.doesNotMatch(api, /^\s*Read-only and uncached/i);

  // Verify the documented call path against source without opening a database.
  const payload = store.slice(store.indexOf("export async function getShowPayload"));
  assert.match(payload, /await ensureShowSeeded\(\)[\s\S]*?await getShowRecord\(/);
});

test("seed documentation states insert-ignore and marker semantics without claiming live validation", () => {
  const seed = section("### `site_settings`");
  const seedKey = store.match(/const SEED_KEY = "([^"]+)"/)[1];
  assert.ok(seed.includes(seedKey));
  assert.match(seed, /GET.*one-time.*seed.*side effect/i);
  assert.match(seed, /INSERT OR IGNORE/);
  assert.match(seed, /same.*batch/i);
  assert.match(seed, /marker.*present.*do not reseed deleted or changed songs/i);
  assert.match(seed, /live database validation.*NOT RUN/i);
});

test("documented song index matches the current schema and migration columns", () => {
  const database = guide.split("## Database\n")[1].split("\n## ")[0].replace(/\s+/g, " ");
  const name = schema.match(/index\("(idx_songs_[^"]+)"\)/)[1];
  const index = migration.match(/CREATE INDEX `([^`]+)` ON `songs` \(([^)]+)\)/);
  assert.equal(index[1], name);
  assert.ok(database.includes(`\`${name}\``));
  const columns = index[2].replaceAll("`", "").split(",").join(", ");
  assert.ok(database.includes(`\`(${columns})\``));
  assert.match(database, /ordered.*within.*show/i);
  assert.doesNotMatch(database, /The index `idx_songs_set_position` supports/);
});
