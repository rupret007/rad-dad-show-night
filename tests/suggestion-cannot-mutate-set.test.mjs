import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  OFFICIAL_SET_MUTATION_KEYS,
  PUBLIC_SUGGESTION_FORM_URL,
  PUBLIC_SUGGESTION_SHEET_CSV_URL,
  assertPublicSuggestionNetworkTarget,
  publicSuggestionHasOfficialSetMutationAttempt,
  sanitizePublicSuggestion,
} = await import("../lib/public-suggestion.ts");

const suggestionRouteUrl = new URL("../app/api/suggestions/route.ts", import.meta.url);
const suggestionSubmitUrl = new URL(
  "../app/api/suggestions/submit/route.ts",
  import.meta.url,
);
const officialSetWriteUrl = new URL("../app/api/show/route.ts", import.meta.url);
const showsWriteUrl = new URL("../app/api/shows/route.ts", import.meta.url);
const songBoardUrl = new URL("../app/song-board.tsx", import.meta.url);
const showControlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const publicSuggestionUrl = new URL("../lib/public-suggestion.ts", import.meta.url);

const officialSetWriteTokens = [
  /cloudflare:workers/,
  /env\.DB/,
  /INSERT INTO songs/,
  /DELETE FROM songs/,
  /getOfficialSongs/,
  /from ["'].*show-store["']/,
  /from ["'].*db\/schema["']/,
];

function extractNamedFunction(source, name) {
  const start = source.indexOf(name);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace > start, `missing body for ${name}`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function spoofedOfficialSetPayload(overrides = {}) {
  return {
    title: "Public Idea Only",
    artist: "Suggestion Board",
    addedBy: "Guest",
    notes: "Keep this on the board.",
    isOriginal: false,
    setSlug: "rad-dad",
    showSlug: "guitars-growlers-2026-09-19",
    showId: "show-guitars-growlers-2026-09-19",
    songs: [
      {
        title: "Hijacked Official Title",
        songKey: "C#",
        position: 1,
        transition: true,
        tuning: "drop d",
      },
    ],
    songKey: "C#",
    position: 1,
    tuning: "drop d",
    transition: true,
    durationSeconds: 30,
    ...overrides,
  };
}

test("sanitizePublicSuggestion keeps only board fields and drops official-set writes", () => {
  const payload = spoofedOfficialSetPayload({ website: "" });
  assert.equal(publicSuggestionHasOfficialSetMutationAttempt(payload), true);

  const isolated = sanitizePublicSuggestion(payload);
  assert.equal(isolated.kind, "suggestion");
  assert.deepEqual(isolated.suggestion, {
    title: "Public Idea Only",
    artist: "Suggestion Board",
    addedBy: "Guest",
    notes: "Keep this on the board.",
    isOriginal: false,
  });

  for (const key of OFFICIAL_SET_MUTATION_KEYS) {
    assert.equal(
      Object.hasOwn(isolated.suggestion, key),
      false,
      `sanitized suggestion must not retain ${key}`,
    );
  }
});

test("sanitizePublicSuggestion treats the honeypot as a no-op", () => {
  const isolated = sanitizePublicSuggestion({
    title: "Public Idea Only",
    addedBy: "Bot",
    website: "https://spam.example",
    setSlug: "rad-dad",
    songs: [{ title: "Hijacked Official Title" }],
  });
  assert.deepEqual(isolated, { kind: "honeypot" });
});

test("public suggestion network guard only allows the Google board", () => {
  assert.doesNotThrow(() =>
    assertPublicSuggestionNetworkTarget(PUBLIC_SUGGESTION_SHEET_CSV_URL, "GET"),
  );
  assert.doesNotThrow(() =>
    assertPublicSuggestionNetworkTarget(PUBLIC_SUGGESTION_FORM_URL, "POST"),
  );
  assert.throws(
    () => assertPublicSuggestionNetworkTarget(PUBLIC_SUGGESTION_SHEET_CSV_URL, "POST"),
    /cannot reach official set storage/,
  );
  assert.throws(
    () => assertPublicSuggestionNetworkTarget(PUBLIC_SUGGESTION_FORM_URL, "GET"),
    /cannot reach official set storage/,
  );
  assert.throws(
    () =>
      assertPublicSuggestionNetworkTarget(
        "https://example.invalid/api/show",
        "POST",
      ),
    /cannot reach official set storage/,
  );
});

test("POST /api/suggestions with spoofed set fields only writes the Google Form", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET").toUpperCase(),
      body: typeof init.body === "string" ? init.body : String(init.body ?? ""),
    });
    if (String(url) === PUBLIC_SUGGESTION_SHEET_CSV_URL) {
      return new Response("unavailable", { status: 503 });
    }
    return new Response("", { status: 200 });
  };

  try {
    const { POST } = await import(`${suggestionRouteUrl.href}?runtime=${Date.now()}`);
    const response = await POST(
      new Request("http://localhost/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spoofedOfficialSetPayload()),
      }),
    );
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.suggestion.title, "Public Idea Only");
    assert.equal(result.suggestion.artist, "Suggestion Board");
    assert.equal(result.suggestion.songKey, undefined);
    assert.equal(result.suggestion.songs, undefined);
    assert.equal(result.suggestion.setSlug, undefined);

    assert.ok(calls.length >= 1);
    for (const call of calls) {
      if (call.method === "GET") {
        assert.equal(call.url, PUBLIC_SUGGESTION_SHEET_CSV_URL);
      } else {
        assert.equal(call.method, "POST");
        assert.equal(call.url, PUBLIC_SUGGESTION_FORM_URL);
        assert.match(call.body, /Public\+Idea\+Only|Public Idea Only/);
        assert.doesNotMatch(call.body, /Hijacked Official Title/);
        assert.doesNotMatch(call.body, /drop d/);
        assert.doesNotMatch(call.body, /setSlug|songKey|rad-dad/);
      }
    }
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("backup POST /api/suggestions/submit also cannot mutate the official set", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? "GET").toUpperCase(),
      body: typeof init.body === "string" ? init.body : String(init.body ?? ""),
    });
    if (String(url) === PUBLIC_SUGGESTION_SHEET_CSV_URL) {
      return new Response("Timestamp,Song title,Artist\n", { status: 200 });
    }
    return new Response("ok", { status: 200 });
  };

  try {
    const { POST } = await import(`${suggestionSubmitUrl.href}?runtime=${Date.now()}`);
    const response = await POST(
      new Request("http://localhost/api/suggestions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          spoofedOfficialSetPayload({
            song: "Public Idea Only",
            title: undefined,
          }),
        ),
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls.filter((call) => call.method === "POST").length, 1);
    assert.ok(
      calls.every(
        (call) =>
          call.url === PUBLIC_SUGGESTION_FORM_URL ||
          call.url === PUBLIC_SUGGESTION_SHEET_CSV_URL,
      ),
    );
    const formPost = calls.find((call) => call.method === "POST");
    assert.doesNotMatch(formPost.body, /Hijacked Official Title/);
    assert.doesNotMatch(formPost.body, /songKey|drop d/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public suggestion routes never import official-set writers", async () => {
  const sources = await Promise.all([
    readFile(suggestionRouteUrl, "utf8"),
    readFile(suggestionSubmitUrl, "utf8"),
    readFile(publicSuggestionUrl, "utf8"),
    readFile(songBoardUrl, "utf8"),
  ]);

  for (const source of sources) {
    for (const token of officialSetWriteTokens) {
      assert.doesNotMatch(source, token);
    }
    assert.doesNotMatch(source, /\/api\/show/);
  }

  const [canonical, backup] = sources;
  assert.match(canonical, /createPublicSuggestionFetch/);
  assert.match(backup, /createPublicSuggestionFetch/);
  assert.match(canonical, /sanitizePublicSuggestion/);
  assert.match(backup, /sanitizePublicSuggestion/);
});

test("official set POST requires the owner before any song write", async () => {
  const source = await readFile(officialSetWriteUrl, "utf8");
  const post = extractNamedFunction(source, "export async function POST");
  const adminCheck = post.indexOf("getAdminUser");
  const unauthorized = post.indexOf("Owner access required.");
  const deleteSongs = post.indexOf("DELETE FROM songs");
  const insertSongs = post.indexOf("INSERT INTO songs");

  assert.ok(adminCheck >= 0, "official set POST must ask for the owner");
  assert.ok(unauthorized > adminCheck, "unauthenticated writes must fail closed");
  assert.match(post, /status:\s*401/);
  assert.ok(deleteSongs > unauthorized, "DELETE FROM songs must follow the owner gate");
  assert.ok(insertSongs > unauthorized, "INSERT INTO songs must follow the owner gate");
});

test("show clone and status writes are owner-only and unused by the public board", async () => {
  const [showsSource, boardSource] = await Promise.all([
    readFile(showsWriteUrl, "utf8"),
    readFile(songBoardUrl, "utf8"),
  ]);
  const post = extractNamedFunction(showsSource, "export async function POST");
  const adminCheck = post.indexOf("getAdminUser");
  const write = post.search(/INSERT INTO songs|UPDATE shows/);
  assert.ok(adminCheck >= 0 && write > adminCheck);
  assert.match(post, /Owner access required/);
  assert.doesNotMatch(boardSource, /\/api\/shows/);
});

test("Show Control adds a suggestion only to a local draft until the owner saves", async () => {
  const source = await readFile(showControlUrl, "utf8");
  const addSuggestion = extractNamedFunction(source, "function addSuggestion");
  const saveActiveSet = extractNamedFunction(source, "async function saveActiveSet");

  assert.doesNotMatch(addSuggestion, /fetch\(/);
  assert.match(addSuggestion, /addSong/);
  assert.match(saveActiveSet, /\/api\/show/);
  assert.match(saveActiveSet, /method:\s*["']POST["']/);
});

test("this leftover does not rewrite Jeff's official set or add a fourth live band", async () => {
  const source = await readFile(showDataUrl, "utf8");
  assert.match(source, /Heart-Shaped Box/);
  assert.match(source, /Travis Story - guitar/);
  assert.match(source, /First Date/);
  assert.match(source, /The Way I Love You/);
  const definitions = source.slice(source.indexOf("export const SET_DEFINITIONS"));
  const slugs = [...definitions.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(slugs, ["jeff-story-friends", "stalemate", "rad-dad"]);
});
