import assert from "node:assert/strict";
import test from "node:test";
import { SHOW_TIME_ZONE } from "../lib/show-read-integrity.ts";
import {
  isCalendarDateUtcMidnight,
  isShowCalendarDate,
  showCalendarYmdFromInstant,
  SHOW_CALENDAR_TIME_ZONE,
} from "../lib/show-clone-validation.ts";
import { cloneRequest, loadShowsRoute } from "./fixtures/shows-route.mjs";

function fixture({ owner = true, sourceExists = true } = {}) {
  const calls = { seeds: 0, prepares: 0, batches: [] };
  const db = {
    prepare(sql) {
      calls.prepares += 1;
      return {
        sql,
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.startsWith("SELECT * FROM shows")) return sourceExists ? {
            id: "source", title: "Fixture night", venue: "Fixture venue",
            start_time: "7:00 PM", end_time: "10:00 PM", expected_wrap: "Expected wrap near 10:00 PM",
          } : null;
          assert.match(sql, /^SELECT id FROM shows/);
          return null;
        },
      };
    },
    async batch(statements) { calls.batches.push(statements); },
  };
  const route = loadShowsRoute({
    db,
    getAdminUser: async () => owner ? { email: "owner@fixture.invalid" } : null,
    store: {
      ensureShowSeeded: async () => { calls.seeds += 1; },
      getManagedShows: async () => [],
    },
  });
  return { ...route, calls };
}

for (const showDate of ["2026-02-31", "2026-02-29", "2100-02-29", "2026-04-31", "2026-00-10", "2026-13-10", "2026-01-00", "2026-01-32", "0000-01-01", "2026-2-01", "2026-10-31T12:00:00Z", "", null, 20261031]) {
  test(`clone POST rejects invalid calendar date ${JSON.stringify(showDate)} before any storage access`, async () => {
    const route = fixture();
    const response = await route.POST(cloneRequest({ showDate }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /show date/i);
    assert.deepEqual(route.calls, { seeds: 0, prepares: 0, batches: [] });
  });
}

for (const copySongs of [false, true]) {
  for (const hours of [{ startTime: "8 PM" }, { endTime: "11 PM" }, { startTime: "8 PM", endTime: " \t " }, { startTime: "\n ", endTime: "11 PM" }]) {
    test(`clone POST rejects one-sided hours ${JSON.stringify(hours)}, copySongs=${copySongs}, before storage`, async () => {
      const route = fixture();
      const response = await route.POST(cloneRequest({ copySongs, ...hours }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /both start and end times/i);
      assert.deepEqual(route.calls, { seeds: 0, prepares: 0, batches: [] });
    });
  }
  for (const hours of [{}, { startTime: "", endTime: "" }, { startTime: " \t", endTime: "\n " }, { startTime: " 8 PM ", endTime: " 11 PM " }]) {
    test(`clone POST accepts blank hours or a pair ${JSON.stringify(hours)}, copySongs=${copySongs}`, async () => {
      const route = fixture();
      assert.equal((await route.POST(cloneRequest({ copySongs, ...hours }))).status, 201);
      assert.equal(route.calls.seeds, 1);
      assert.equal(route.calls.batches.length, 1);
      assert.equal(route.calls.batches[0].length, copySongs ? 3 : 1);
      const expectedHours = hours.startTime?.trim()
        ? ["8 PM", "11 PM", "Expected wrap near 11 PM"]
        : copySongs ? ["7:00 PM", "10:00 PM", "Expected wrap near 10:00 PM"] : ["", "", ""];
      assert.deepEqual(route.calls.batches[0][0].values.slice(4, 8), ["2026-10-31", ...expectedHours]);
    });
  }
}

for (const showDate of ["2026-02-28", "2028-02-29", "2000-02-29", "2026-04-30", "2026-12-31", "0001-01-01", "0096-02-29"]) {
  test(`clone POST accepts real calendar date ${showDate}`, async () => {
    const route = fixture();
    assert.equal((await route.POST(cloneRequest({ showDate }))).status, 201);
    assert.equal(route.calls.batches.length, 1);
    assert.equal(route.calls.batches[0][0].values[4], showDate);
  });
}

test("clone POST accepts paired hours when end is after start on the same night", async () => {
  const route = fixture();
  const response = await route.POST(cloneRequest({ startTime: "7:00 PM", endTime: "10:30 PM" }));
  assert.equal(response.status, 201);
  assert.deepEqual(route.calls.batches[0][0].values.slice(5, 7), ["7:00 PM", "10:30 PM"]);
});

test("clone POST rejects paired hours when end is before start without a valid overnight span", async () => {
  const route = fixture();
  const response = await route.POST(cloneRequest({ startTime: "3:00 PM", endTime: "1:00 PM" }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /after start|overnight/i);
  assert.deepEqual(route.calls, { seeds: 0, prepares: 0, batches: [] });
});

test("clone POST accepts paired hours across midnight as an overnight span", async () => {
  const route = fixture();
  const response = await route.POST(cloneRequest({ startTime: "9:00 PM", endTime: "1:00 AM" }));
  assert.equal(response.status, 201);
  assert.deepEqual(route.calls.batches[0][0].values.slice(5, 7), ["9:00 PM", "1:00 AM"]);
});

test("show calendar dates use America/Chicago wall days, not UTC midnight parsing", () => {
  assert.equal(SHOW_CALENDAR_TIME_ZONE, SHOW_TIME_ZONE);
  assert.equal(SHOW_CALENDAR_TIME_ZONE, "America/Chicago");
  assert.equal(isShowCalendarDate("2026-04-31"), false);
  assert.equal(isShowCalendarDate("0001-01-01"), true);
  assert.equal(isCalendarDateUtcMidnight("0001-01-01"), true);
  const utcJuneFifteenMidnight = Date.UTC(2026, 5, 15, 0, 0, 0);
  assert.equal(showCalendarYmdFromInstant(utcJuneFifteenMidnight), "2026-06-14");
  assert.equal(isShowCalendarDate("2026-06-15"), true);
});

test("clone POST retains owner and missing-source guards", async () => {
  const anonymous = fixture({ owner: false });
  assert.equal((await anonymous.POST(cloneRequest())).status, 401);
  assert.deepEqual(anonymous.calls, { seeds: 0, prepares: 0, batches: [] });
  const missing = fixture({ sourceExists: false });
  assert.equal((await missing.POST(cloneRequest())).status, 404);
  assert.equal(missing.calls.batches.length, 0);
});
