import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as coach from "../lib/set-coach.ts";

const { parseScheduledMinutes, parseCoachInput, buildCoachCheck, parseCoachResult } = coach;
function song(id = 1, patch = {}) {
  return {
    id, showId: "fixture-show", setSlug: "rad-dad", position: id,
    title: `Fixture song ${id}`, artist: "Fixture artist", transition: false,
    isOriginal: false, durationSeconds: 180, performanceNote: "Fixture cue",
    songKey: "D", tuning: "Standard", youtubeUrl: "", youtubeVideoId: "",
    chordsUrl: "", lyricsUrl: "", rehearsalNotes: "Owner-only fixture notes",
    updatedAt: "2026-09-05T00:00:00.000Z", ...patch,
  };
}
function input(patch = {}) {
  return {
    requestId: "fixture-request-1", showId: "fixture-show", showSlug: "fixture-night",
    showTitle: "Fixture show at Fixture room", setSlug: "rad-dad", setTime: "9:00-10:00 PM",
    songs: [song()], ...patch,
  };
}

test("Coach reads canonical and explicit same-day ranges without a set-slug duration table", () => {
  for (const [value, minutes] of [["7:00-7:35 PM", 35], ["8:35-8:55 PM", 20], ["9:00-10:00 PM", 60],
    ["6:00 PM–6:45 PM", 45], ["11:30 AM-12:15 PM", 45], ["12:00-12:30 PM", 30],
    [" 9:00 am — 10:00 am ", 60]]) assert.equal(parseScheduledMinutes(value), minutes, value);
});

test("Coach refuses incomplete, malformed, ambiguous, overnight, and oversized windows", () => {
  for (const value of [null, undefined, false, 60, "", "9:00 PM", "9:00-10:00", "19:00-20:00", "9-10 PM",
    "9:60-10:00 PM", "0:00-1:00 PM", "13:00-14:00 PM", "9:00-9:00 PM", "10:00-9:00 PM",
    "11:30-12:15 PM", "11:30 PM-12:15 AM", "7:00 AM-7:35 PM", "6:00-11:00 PM", "9:00-10:00 PM maybe", "x".repeat(41)]) {
    assert.equal(parseScheduledMinutes(value), null, String(value));
  }
});

test("a different show's real window replaces the canonical assumption", () => {
  const result = buildCoachCheck(input({ setTime: "6:00-6:45 PM" }));
  assert.equal(result.scheduledMinutes, 45);
  assert.equal(result.estimatedMinutes, 3);
  assert.match(result.findings[0].detail, /42 minutes.*45-minute/);
});

test("an untimed set has no timing score or inherited scheduled minutes", () => {
  for (const setSlug of ["jeff-story-friends", "stalemate", "rad-dad"]) {
    const result = buildCoachCheck(input({ setSlug, setTime: "", songs: [song(1, { setSlug })] }));
    assert.equal(result.score, null);
    assert.equal(result.scheduledMinutes, null);
    assert.equal(result.estimatedMinutes, 3);
    assert.equal(result.findings[0].title, "No verified set window");
    assert.match(result.findings[0].detail, /timing has not been scored/);
    assert.ok(parseCoachResult(result, "fixture-request-1"));
  }
});

test("pure review preserves the draft and reports cues and cover gaps", () => {
  const value = input({ songs: [song(1, { transition: true }), song(2, { durationSeconds: 0 })] });
  const before = structuredClone(value);
  const result = buildCoachCheck(value);
  assert.deepEqual(value, before);
  assert.equal(result.estimatedMinutes, 6);
  assert.equal(result.requestId, value.requestId);
  assert.equal(result.findings.length, 4);
  assert.match(result.findings[1].title, /1 planned transition/);
  assert.match(result.findings[2].title, /2 songs carry performance cues/);
  assert.match(result.findings[3].title, /2 covers have no saved/);
});

test("input accepts one complete unsaved draft and keeps blank schedule explicit", () => {
  const value = input({ setTime: "", songs: [song("draft-fixture-1", { position: 1 })] });
  assert.equal(parseCoachInput(value), value);
});

test("input refuses incomplete identities, mixed shows/sets, duplicates, and truncation", () => {
  const cases = [null, [], input({ requestId: "" }), input({ requestId: "../other" }), input({ showId: "" }),
    input({ showSlug: "fixture/night" }), input({ setSlug: "unknown" }), input({ setTime: null }), input({ songs: [] }),
    input({ songs: [song(1, { showId: "foreign-show" })] }), input({ songs: [song(1, { setSlug: "stalemate" })] }),
    input({ songs: [song(1), song("1", { position: 2 })] }), input({ songs: [song(1, { position: 2 })] }),
    input({ songs: Array.from({ length: 61 }, (_, n) => song(n + 1)) })];
  for (const value of cases) assert.equal(parseCoachInput(value), null);
});

test("input refuses malformed song values before scoring or optional provider work", () => {
  for (const patch of [{ id: false }, { id: Number.MAX_SAFE_INTEGER + 1 }, { title: " " }, { artist: null },
    { durationSeconds: -1 }, { durationSeconds: 1.5 }, { durationSeconds: Infinity }, { durationSeconds: 7201 },
    { transition: 1 }, { isOriginal: "false" }, { performanceNote: null }, { youtubeUrl: null }]) {
    assert.equal(parseCoachInput(input({ songs: [song(1, patch)] })), null);
  }
});

test("result requires the exact request echo and a complete finite review", () => {
  const result = buildCoachCheck(input());
  assert.equal(parseCoachResult(result, result.requestId), result);
  for (const patch of [{ requestId: "old-request" }, { error: "unavailable" }, { error: null }, { source: "cache" },
    { score: NaN }, { score: true }, { score: 101 }, { estimatedMinutes: Infinity }, { estimatedMinutes: -1 },
    { scheduledMinutes: 0 }, { scheduledMinutes: 241 }, { scheduledMinutes: null }, { score: null },
    { findings: [] }, { findings: [{ tone: "good", title: "Partial" }] },
    { findings: [{ tone: ["good"], title: "Fixture", detail: "Fixture" }] },
    { findings: [{ tone: "invalid", title: "Fixture", detail: "Fixture" }] }, { aiNotes: "x".repeat(6001) }]) {
    assert.equal(parseCoachResult({ ...result, ...patch }, result.requestId), null);
  }
  assert.equal(parseCoachResult(result, ""), null);
});

const source = await readFile(new URL("../app/api/coach/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(options = {}) {
  const fixtureModule = { exports: {} }, calls = [], timers = new Map();
  vm.runInNewContext(compiled, {
    module: fixtureModule, exports: fixtureModule.exports, Response, AbortController,
    process: { env: { OPENAI_API_KEY: options.ai ? "synthetic-key-never-sent" : "" } },
    setTimeout(fn, ms) { assert.equal(ms, 8000); const key = {}; timers.set(key, fn); return key; },
    clearTimeout(key) { timers.delete(key); },
    require(id) {
      if (id === "../../../lib/admin-access") return { getAdminUser: async () => options.denied ? null : { email: "fixture@example.invalid" } };
      if (id === "../../../lib/set-coach") return coach;
      throw new Error(`Unapproved Coach dependency: ${id}`);
    },
    fetch: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      calls.push({ url, init });
      if (!options.fetch) throw new Error("Provider calls are disabled in this fixture");
      return options.fetch(url, init);
    },
  });
  return { ...fixtureModule.exports, calls, timers, expire() { for (const callback of [...timers.values()]) callback(); } };
}
function request(value = input(), signal) {
  return new Request("http://fixture.invalid/api/coach", { method: "POST", body: JSON.stringify(value), signal });
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test("actual route authenticates before parsing a draft or touching the provider", async () => {
  const route = fixture({ denied: true, ai: true });
  const response = await route.POST({ json() { throw new Error("Unauthorized body was read"); } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(route.calls.length, 0);
});

test("actual route rejects malformed and mixed-context drafts without provider requests", async () => {
  const route = fixture({ ai: true });
  const malformed = new Request("http://fixture.invalid/api/coach", { method: "POST", body: "{" });
  const rejected = await route.POST(malformed);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await route.POST(request(input({ songs: [song(1, { showId: "foreign-show" })] })))).status, 400);
  assert.equal(route.calls.length, 0);
});

test("actual route works without a key and never supplies a clone's missing schedule", async () => {
  const route = fixture();
  const response = await route.POST(request(input({ setTime: "" })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), buildCoachCheck(input({ setTime: "" })));
  assert.equal(route.calls.length, 0);
});

test("optional provider input stays on this draft and excludes owner rehearsal notes and authority", async () => {
  const route = fixture({ ai: true, fetch: async () => Response.json({ output_text: "Fixture pacing note." }) });
  const result = await (await route.POST(request(input({ setTime: "" })))).json();
  assert.equal(result.source, "openai");
  assert.equal(result.requestId, "fixture-request-1");
  assert.equal(result.score, null);
  const body = JSON.parse(route.calls[0].init.body), reviewed = JSON.parse(body.input);
  assert.equal(body.store, false);
  assert.equal(reviewed.scheduledMinutes, null);
  assert.equal(reviewed.show, input().showTitle);
  assert.equal(reviewed.songs[0].title, song().title);
  assert.equal("rehearsalNotes" in reviewed.songs[0], false);
  assert.equal("showId" in reviewed, false);
  assert.match(body.instructions, /do not invent a window/);
  assert.equal(route.timers.size, 0);
});

test("empty, invalid, and failed optional provider replies retain the valid local check", async () => {
  for (const reply of [() => Response.json({ output_text: "" }), () => Response.json({ output_text: "x".repeat(6001) }),
    () => Response.json({ output_text: 4 }), () => new Response("bad JSON"), () => new Response("unavailable", { status: 503 }),
    () => { throw new Error("Fixture provider offline"); }]) {
    const route = fixture({ ai: true, fetch: async () => reply() });
    assert.deepEqual(await (await route.POST(request())).json(), buildCoachCheck(input()));
    assert.equal(route.timers.size, 0);
  }
});

test("eight-second provider deadline covers headers even when abort is ignored", async () => {
  let finish;
  const route = fixture({ ai: true, fetch: () => new Promise(resolve => { finish = resolve; }) });
  const pending = route.POST(request());
  await turn();
  route.expire();
  assert.deepEqual(await (await pending).json(), buildCoachCheck(input()));
  assert.equal(route.calls[0].init.signal.aborted, true);
  finish(Response.json({ output_text: "Too late" }));
  await turn();
  assert.equal(route.timers.size, 0);
});

test("eight-second provider deadline also covers a body that never finishes", async () => {
  const route = fixture({ ai: true, fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  const pending = route.POST(request());
  await turn();
  route.expire();
  assert.deepEqual(await (await pending).json(), buildCoachCheck(input()));
  assert.equal(route.calls[0].init.signal.aborted, true);
});

test("caller abort retires the provider and cannot return a late review", async () => {
  const controller = new AbortController();
  const route = fixture({ ai: true, fetch: () => new Promise(() => {}) });
  const pending = route.POST(request(input(), controller.signal));
  await turn();
  controller.abort();
  assert.deepEqual(await (await pending).json(), buildCoachCheck(input()));
  assert.equal(route.calls[0].init.signal.aborted, true);
  assert.equal(route.timers.size, 0);
});

test("an already aborted caller starts no optional provider request", async () => {
  const controller = new AbortController(); controller.abort();
  const route = fixture({ ai: true });
  assert.deepEqual(await (await route.POST(request(input(), controller.signal))).json(), buildCoachCheck(input()));
  assert.equal(route.calls.length, 0);
});
