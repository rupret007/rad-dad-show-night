import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as suggestions from "../lib/public-suggestion.ts";
import * as board from "../lib/suggestion-board.ts";

const HEADER = '"Timestamp","Song title","Artist","Your name","Notes"';
const ROW = '"9/4/2026 23:00:00","Test Song","Test Band","Guest","Some notes"';
const FIELDS = { title: "Test Song", artist: "Test Band", addedBy: "Guest", notes: "Some notes", isOriginal: false };
const CSV = `${HEADER}\r\n${ROW}\r\n`;

// Exercise the actual route handlers offline. Only the two suggestion modules
// may be imported, and their real injected-fetch seams use fixture responses.
const routeSource = await readFile(new URL("../app/api/suggestions/route.ts", import.meta.url), "utf8");
const routeJs = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function route(fetchImpl) {
  const compiledModule = { exports: {} };
  vm.runInNewContext(routeJs, {
    module: compiledModule, exports: compiledModule.exports, Response,
    require(id) {
      if (id === "../../../lib/suggestion-board") return board;
      if (id === "../../../lib/public-suggestion") return {
        ...suggestions,
        loadPublicSuggestions: () => suggestions.loadPublicSuggestions(fetchImpl, 30),
        writeSanitizedSuggestionToForm: (fields) => suggestions.writeSanitizedSuggestionToForm(fields, fetchImpl, 30),
      };
      throw new Error(`Unexpected route dependency: ${id}`);
    },
  });
  return compiledModule.exports;
}

function fixtureFetch({ csv = HEADER, readStatus = 200, writeStatus = 200, readFailure = false, writeFailure = false, stallWrite = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    if (url === suggestions.PUBLIC_SUGGESTION_SHEET_CSV_URL) {
      assert.equal(init.method ?? "GET", "GET");
      if (readFailure) throw new Error("provider-secret-read-error");
      return new Response(csv, { status: readStatus });
    }
    assert.equal(url, suggestions.PUBLIC_SUGGESTION_FORM_URL);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    if (stallWrite) return new Promise(() => {});
    if (writeFailure) throw new Error("provider-secret-write-error");
    return new Response(writeStatus === 204 ? null : "provider body", { status: writeStatus });
  };
  return { calls, fetchImpl };
}

function request(payload = FIELDS) {
  return new Request("https://fixture.invalid/api/suggestions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

test("valid header-only CSV is verified empty without depending on question wording", () => {
  assert.deepEqual(suggestions.parsePublicSuggestionCsv(HEADER), []);
  assert.deepEqual(suggestions.parsePublicSuggestionCsv('\uFEFFTimestamp,Question A,Question B,Question C,Question D\n'), []);
});

test("quoted CSV keeps commas, newlines, escaped quotes and original markers", () => {
  const csv = `${HEADER}\n"9/4/2026","Song, ""quoted""","Band","Guest","[ORIGINAL] line one\nline two"`;
  const rows = suggestions.parsePublicSuggestionCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Song, "quoted"');
  assert.equal(rows[0].notes, "line one\nline two");
  assert.equal(rows[0].isOriginal, true);
  assert.equal(board.isPublicSuggestion(rows[0]), true);
});

test("failed, HTML, blank, malformed, wrong-shaped or oversized CSV never becomes empty", () => {
  const invalid = [
    "", "  \n", "<!doctype html><html>Login required</html>",
    "Not Timestamp,one,two,three,four", "Timestamp,one,,three,four",
    `${HEADER}\n"open quote`, `${HEADER}\n${ROW},extra`,
    `${HEADER}\n9/4/2026,Only two`, `${HEADER}\n9/4/2026,un"quoted,Band,Guest,notes`,
    `${HEADER}\n"9/4/2026"junk,Song,Band,Guest,notes`,
    `${HEADER}\n9/4/2026,,Band,Guest,notes`,
    `${HEADER}\n${"x".repeat(512 * 1024)}`,
    `${HEADER}\n${Array.from({ length: 1001 }, () => ROW).join("\n")}`,
  ];
  for (const value of invalid) assert.throws(() => suggestions.parsePublicSuggestionCsv(value), /could not be verified/);
});

test("feed payload validator refuses false-empty error envelopes, malformed rows and duplicate IDs", () => {
  const rows = suggestions.parsePublicSuggestionCsv(CSV);
  assert.deepEqual(board.parseSuggestionFeedPayload({ suggestions: rows }), rows);
  for (const payload of [null, [], {}, { error: "unavailable" }, { suggestions: null },
    { error: "unavailable", suggestions: [] }, { error: "unavailable", suggestions: rows },
    { delivery: "not-sent", suggestions: [] }, { delivery: "awaiting-board", suggestions: rows },
    { suggestions: [{}] }, { suggestions: [rows[0], rows[0]] },
    { suggestions: [{ ...rows[0], isOriginal: "false" }] },
    { suggestions: [{ ...rows[0], id: "" }] }]) {
    assert.throws(() => board.parseSuggestionFeedPayload(payload), /could not be verified/);
  }
});

test("song duplicate normalization is broader than exact pending receipt confirmation", () => {
  const near = { ...FIELDS, title: "  TEST   SONG ", artist: " test BAND " };
  assert.equal(board.sameSuggestionSong(FIELDS, near), true);
  assert.equal(board.sameSuggestionSubmission(FIELDS, near), false);
  assert.equal(board.sameSuggestionSubmission(FIELDS, { ...FIELDS }), true);
  for (const change of [{ addedBy: "Other guest" }, { notes: "Changed" }, { isOriginal: true }]) {
    assert.equal(board.sameSuggestionSubmission(FIELDS, { ...FIELDS, ...change }), false);
  }
});

test("read seam bounds stalled response bodies and aborts without retry", async () => {
  let calls = 0;
  let signal;
  await assert.rejects(() => suggestions.loadPublicSuggestions(async (_url, init) => {
    calls += 1; signal = init.signal;
    return new Response(new ReadableStream({ start() { /* Body deliberately never arrives. */ } }));
  }, 5), /timed out/);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test("read seam refuses oversized Content-Length before reading the body", async () => {
  let read = false;
  await assert.rejects(() => suggestions.loadPublicSuggestions(async () => ({
    ok: true, headers: new Headers({ "content-length": String(512 * 1024 + 1) }),
    text: async () => { read = true; return HEADER; },
  })), /could not be verified/);
  assert.equal(read, false);
});

test("chunked feed without Content-Length is cancelled at512KiB, before later chunks are read", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(64 * 1024).fill(65));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(() => suggestions.loadPublicSuggestions(async () => new Response(body)), /could not be verified/);
  assert.equal(pulls, 9);
  assert.equal(cancelled, true);
});

test("GET returns only verified rows and no-store", async () => {
  const fake = fixtureFetch({ csv: CSV });
  const response = await route(fake.fetchImpl).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(board.parseSuggestionFeedPayload(await response.json()), suggestions.parsePublicSuggestionCsv(CSV));
  assert.equal(fake.calls.length, 1);
});

test("GET provider failure, rejection, redirect and malformed body return503, never fictional empty", async () => {
  for (const options of [{ readFailure: true }, { readStatus: 503 }, { readStatus: 302 }, { csv: "<html>login</html>" }]) {
    const fake = fixtureFetch(options);
    const response = await route(fake.fetchImpl).GET();
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(Object.hasOwn(result, "suggestions"), false);
    assert.equal(result.delivery, "not-sent");
    assert.doesNotMatch(result.error, /provider-secret/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("POST invalid bodies and missing required fields are not-sent400 with zero network calls", async () => {
  const fake = fixtureFetch();
  const handlers = route(fake.fetchImpl);
  for (const payload of [null, [], "text", {}, { ...FIELDS, title: " " }, { ...FIELDS, addedBy: "" }]) {
    const response = await handlers.POST(request(payload));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).delivery, "not-sent");
  }
  const malformed = await handlers.POST(new Request("https://fixture.invalid", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  assert.equal(fake.calls.length, 0);
});

test("honeypot remains a no-op without a board receipt or network calls", async () => {
  const fake = fixtureFetch();
  const response = await route(fake.fetchImpl).POST(request({ ...FIELDS, website: "filled" }));
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(fake.calls.length, 0);
});

test("a cover cannot smuggle the reserved original marker into its receipt", async () => {
  const fake = fixtureFetch();
  const response = await route(fake.fetchImpl).POST(request({ ...FIELDS, notes: " [original] A note " }));
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.delivery, "not-sent");
  assert.match(result.error, /checkbox|remove/);
  assert.equal(fake.calls.length, 0);
});

test("checked original notes with a literal marker roundtrip all five receipt fields", async () => {
  const fake = fixtureFetch();
  const submission = { ...FIELDS, isOriginal: true, notes: "[ORIGINAL] A literal note" };
  const response = await route(fake.fetchImpl).POST(request(submission));
  assert.equal(response.status, 202);
  assert.deepEqual((await response.json()).submission, submission);
  const storedNotes = new URLSearchParams(fake.calls[1].body).get("entry.286610891");
  assert.equal(storedNotes, "[ORIGINAL] [ORIGINAL] A literal note");
  const csv = `${HEADER}\n9/4/2026,${submission.title},${submission.artist},${submission.addedBy},${storedNotes}`;
  const verified = suggestions.parsePublicSuggestionCsv(csv)[0];
  assert.equal(board.sameSuggestionSubmission(verified, submission), true);
});

test("POST unavailable or malformed preflight prevents every form write", async () => {
  for (const options of [{ readFailure: true }, { readStatus: 503 }, { csv: "invalid feed" }]) {
    const fake = fixtureFetch(options);
    const response = await route(fake.fetchImpl).POST(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).delivery, "not-sent");
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].url, suggestions.PUBLIC_SUGGESTION_SHEET_CSV_URL);
  }
});

test("POST duplicate409 returns the actual verified row and sends no duplicate", async () => {
  const fake = fixtureFetch({ csv: CSV });
  const response = await route(fake.fetchImpl).POST(request({ ...FIELDS, title: " test   SONG ", artist: "TEST BAND" }));
  assert.equal(response.status, 409);
  const result = await response.json();
  assert.equal(result.delivery, "already-present");
  assert.deepEqual(result.existing, suggestions.parsePublicSuggestionCsv(CSV)[0]);
  assert.equal(fake.calls.length, 1);
});

test("POST returns202 exact sanitized pending receipt, never a fabricated board row", async () => {
  const fake = fixtureFetch();
  const response = await route(fake.fetchImpl).POST(request({
    ...FIELDS, title: "  Test Song  ", isOriginal: "true", notes: "  My original  ",
    songs: [{ title: "Spoofed official song" }], position: 1, setSlug: "rad-dad",
  }));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    delivery: "awaiting-board", submission: { ...FIELDS, notes: "My original", isOriginal: true },
  });
  assert.equal(fake.calls.length, 2);
  const body = String(fake.calls[1].body);
  assert.match(body, /%5BORIGINAL%5D/);
  assert.doesNotMatch(body, /Spoofed|position|setSlug/);
});

test("every attempted-write error, redirect and timeout is uncertain502 without retry or provider text", async () => {
  for (const options of [{ writeFailure: true }, { writeStatus: 302 }, { writeStatus: 400 }, { writeStatus: 500 }, { stallWrite: true }]) {
    const fake = fixtureFetch(options);
    const response = await route(fake.fetchImpl).POST(request());
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.equal(result.delivery, "unknown");
    assert.doesNotMatch(result.error, /provider-secret|provider body/);
    assert.equal(fake.calls.length, 2);
    assert.equal(fake.calls[1].signal.aborted, true);
  }
});

test("form transport allows2xx only and leaves persistence unclaimed", async () => {
  for (const status of [200, 202, 204]) {
    const fake = fixtureFetch({ writeStatus: status });
    assert.equal(await suggestions.writeSanitizedSuggestionToForm(FIELDS, fake.fetchImpl), undefined);
    assert.equal(fake.calls.length, 1);
  }
  let calls = 0;
  await assert.rejects(() => suggestions.writeSanitizedSuggestionToForm(FIELDS, async () => {
    calls += 1; return { status: 0 };
  }), /could not be confirmed/);
  assert.equal(calls, 1);
});

test("a Request object's method cannot bypass the two-target network boundary", async () => {
  let calls = 0;
  const guarded = suggestions.createPublicSuggestionFetch(async () => { calls += 1; return new Response(); });
  await assert.rejects(() => guarded(new Request(suggestions.PUBLIC_SUGGESTION_SHEET_CSV_URL, { method: "POST" })), /cannot reach official set storage/);
  assert.equal(calls, 0);
});
