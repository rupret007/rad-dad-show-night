import assert from "node:assert/strict";
import { test } from "node:test";
import { RUN_OF_SHOW } from "../lib/show-data.ts";
import { buildShowSets, featuredGuestSet } from "../lib/show-read-integrity.ts";
import { ShowNotFoundError } from "../lib/show-visibility.ts";
import { loadOfficialSetRoute, loadOfficialShowStore } from "./fixtures/official-set-route.mjs";

test("general readonly timelines keep custom set times and leave frozen inputs intact", () => {
  const block = Object.freeze({ time: "6:15-6:50", duration: "35 min", title: "Another night", note: "Fixture", type: "performance", accent: "pink", setSlug: "rad-dad" });
  const timeline = Object.freeze([block]);
  assert.equal(buildShowSets(timeline).find((set) => set.slug === "rad-dad").time, "6:15-6:50 PM");
  assert.equal(featuredGuestSet(timeline), null);
  assert.equal(buildShowSets(RUN_OF_SHOW)[0].time, "7:00-7:35 PM");
  assert.deepEqual(timeline, [block]);
});

test("the typed store preserves not-found through the public route when no default is configured", async () => {
  // Synthetic read-only D1 boundary: the real Drizzle queries run against these
  // rows, and unexpected SQL fails. No runtime listener, real DB, or seed writes.
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          assert.match(sql, /SELECT value FROM site_settings/);
          return { value: "fixture-already-seeded" };
        },
        async raw() {
          assert.match(sql, /^select .* from "shows"/);
          return sql.includes('"is_default" = ?') ? [] : [["synthetic-other-show"]];
        },
      };
    },
  };
  const store = loadOfficialShowStore(db);
  await assert.rejects(store.getShowRecord(), ShowNotFoundError);
  await assert.rejects(store.getShowPayload(), ShowNotFoundError);
  const { GET } = loadOfficialSetRoute({ db, getAdminUser: async () => null });
  const response = await GET(new Request("https://fixture.invalid/api/show"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Show not found." });
});
