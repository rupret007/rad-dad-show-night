import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://offline-fixture.invalid";
const CACHE = "rad-dad-show-offline-v4";
const API = `${ORIGIN}/api/show?show=synthetic-night`;
const OWNER = `${API}&scope=owner`;
const resources = [`${ORIGIN}/?show=synthetic-night`, `${ORIGIN}/?show=synthetic-night&practice=1`, API];

function publicPayload(extra = {}) {
  return {
    dataSource: "database",
    show: { id: "synthetic-show", slug: "synthetic-night", status: "published" },
    songs: [{ id: 1, showId: "synthetic-show", setSlug: "rad-dad", title: "Synthetic song", rehearsalNotes: "" }],
    ...extra,
  };
}

function publicResponse(payload = publicPayload(), headers = {}) {
  return Response.json(payload, { headers: {
    "X-Rad-Dad-Data-Source": "database", "X-Rad-Dad-Read-Scope": "public", "Cache-Control": "no-store", ...headers,
  } });
}

function showHtml({ slug = "synthetic-night", source = "database", body = "Verified fixture page" } = {}) {
  return `<!doctype html><html><head></head><body><div class="show" data-show-slug="${slug}" data-show-source="${source}">${body}</div></body></html>`;
}

function htmlResponse(html = showHtml(), headers = {}) {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
}

// Execute the actual shipped service worker. Every fetch is an explicit synthetic
// callback; this harness has no network, service worker registration or real cache.
function worker(fetchResponse = async () => { throw new Error("Synthetic offline"); }) {
  const listeners = new Map();
  const stores = new Map();
  const calls = { fetch: [], open: [], put: [], delete: [], removedCaches: [], claimed: 0 };
  const key = (value) => new URL(typeof value === "string" ? value : value.url, ORIGIN).href;
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const cache = (name) => ({
    async addAll(urls) {
      for (const url of urls) store(name).set(key(url), new Response("Synthetic app shell"));
    },
    async put(request, response) {
      calls.put.push([name, key(request)]);
      store(name).set(key(request), response.clone());
    },
    async match(request) { return store(name).get(key(request))?.clone(); },
    async keys() { return [...store(name).keys()].map((url) => new Request(url)); },
    async delete(request) {
      calls.delete.push([name, key(request)]);
      return store(name).delete(key(request));
    },
  });
  const context = vm.createContext({
    URL, Request, Response, Headers,
    // Network promises are immediate fixture outcomes. Unref bounds timeout
    // lifetime without changing which promise wins or executing real timers.
    setTimeout(callback, ms) { const handle = setTimeout(callback, ms); handle.unref(); return handle; },
    self: {
      location: { origin: ORIGIN },
      addEventListener(type, handler) { listeners.set(type, handler); },
      async skipWaiting() {},
      clients: { async claim() { calls.claimed += 1; } },
    },
    caches: {
      async open(name) { calls.open.push(name); store(name); return cache(name); },
      async keys() { return [...stores.keys()]; },
      async delete(name) { calls.removedCaches.push(name); return stores.delete(name); },
    },
    async fetch(request, options) {
      const url = key(request);
      calls.fetch.push({ url, credentials: options?.credentials ?? request.credentials });
      return fetchResponse(url, options, request);
    },
  });
  vm.runInContext(source, context, { filename: "public/sw.js" });
  return {
    calls,
    seed(name, url, response) { store(name).set(key(url), response.clone()); },
    async cached(url, name = CACHE) { return cache(name).match(url); },
    async dispatch(url, extra = {}) {
      let result;
      const request = new Request(url, { credentials: "include", ...extra });
      listeners.get("fetch")({ request, respondWith(value) { result = value; } });
      return result === undefined ? null : await result;
    },
    async message(urls) {
      let pending;
      let result;
      listeners.get("message")({
        data: { type: "CACHE_SHOW", urls }, ports: [{ postMessage(value) { result = value; } }],
        waitUntil(value) { pending = value; },
      });
      await pending;
      return result;
    },
    async activate() {
      let pending;
      listeners.get("activate")({ waitUntil(value) { pending = value; } });
      await pending;
    },
  };
}

test("actual SW: scoped owner GET never intercepts, reads cache or manufactures offline authority", async () => {
  const fixture = worker();
  fixture.seed(CACHE, OWNER, publicResponse(publicPayload({ setWriteVersions: { "rad-dad": "owner-version" } })));
  for (const url of [OWNER, `${API}&scope=public&scope=owner`, `${API}&scope=`, `${API}&%73cope=owner`]) {
    assert.equal(await fixture.dispatch(url), null, "Native authenticated network must own scoped reads");
  }
  assert.deepEqual(fixture.calls.fetch, []);
  assert.deepEqual(fixture.calls.open, []);
  assert.deepEqual(fixture.calls.put, []);
});

test("actual SW: CACHE_SHOW cannot fetch or cache owner URLs, even alongside valid public copies", async () => {
  const fixture = worker(async (url) => url.includes("/api/show") ? publicResponse() : htmlResponse());
  const refused = await fixture.message([OWNER, `${ORIGIN}/show-control?show=synthetic-night`]);
  assert.equal(refused.ready, false);
  assert.equal(refused.cacheVersion, 4);
  assert.equal(fixture.calls.fetch.length, 0);
  const result = await fixture.message([...resources, OWNER]);
  assert.equal(result.ready, true);
  assert.equal(result.cacheVersion, 4);
  assert.equal(result.cached, 3);
  assert.equal(await fixture.cached(OWNER), undefined);
  assert.ok(fixture.calls.fetch.every((call) => call.credentials === "omit" && call.url !== OWNER));
});

test("actual SW: public network and saved fallback contain no owner data or write receipt", async () => {
  let online = true;
  const fixture = worker(async () => { if (!online) throw new Error("Synthetic offline"); return publicResponse(); });
  const onlineResponse = await fixture.dispatch(API);
  assert.deepEqual(await onlineResponse.json(), publicPayload());
  assert.equal(fixture.calls.fetch[0].credentials, "omit");
  online = false;
  const offlineResponse = await fixture.dispatch(API);
  assert.equal(offlineResponse.headers.get("X-Rad-Dad-Offline"), "1");
  const payload = await offlineResponse.json();
  assert.deepEqual(payload, publicPayload());
  assert.equal(Object.hasOwn(payload, "setWriteVersions"), false);
  assert.ok(payload.songs.every((song) => song.rehearsalNotes === ""));
});

test("actual SW: public network rejects owner headers and receipts before paint or cache", async () => {
  const variants = [
    publicResponse(publicPayload(), { "X-Rad-Dad-Data-Source": "owner-database", "X-Rad-Dad-Read-Scope": "owner" }),
    publicResponse(publicPayload({ setWriteVersions: { "rad-dad": "synthetic-owner-version" } })),
    publicResponse(publicPayload({ reviewedVersion: "synthetic-save-version" })),
    publicResponse(publicPayload({ reviewedBase: "empty:0" })),
    publicResponse(publicPayload({ songs: [{ ...publicPayload().songs[0], rehearsalNotes: "Private fixture instruction" }] })),
    publicResponse(publicPayload({ songs: [{ ...publicPayload().songs[0], rehearsalNotes: " " }] })),
    publicResponse(publicPayload(), { "X-Rad-Dad-Read-Scope": "" }),
    publicResponse(publicPayload(), { "X-Rad-Dad-Offline": "1" }),
  ];
  for (const response of variants) {
    const fixture = worker(async () => response.clone());
    const result = await fixture.dispatch(API);
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /Private fixture|synthetic-owner-version|setWriteVersions/);
    assert.equal(fixture.calls.put.length, 0);
  }
});

test("actual SW: malformed, wrong-show and nonpublic show snapshots cannot enter a public cache", async () => {
  const base = publicPayload();
  for (const payload of [null, {}, { ...base, songs: null }, { ...base, songs: [null] },
    { ...base, show: { ...base.show, slug: "another-night" } },
    { ...base, show: { ...base.show, status: "draft" } },
    { ...base, show: { ...base.show, status: "archived" } },
    { ...base, songs: [{ ...base.songs[0], showId: "another-show" }] },
    { ...base, songs: [{ id: 1, rehearsalNotes: "" }] },
    { ...base, songs: Array.from({ length: 181 }, () => base.songs[0]) },
  ]) {
    const fixture = worker(async () => publicResponse(payload));
    assert.equal((await fixture.dispatch(API)).status, 503);
    assert.equal((await fixture.message(resources)).ready, false);
    assert.equal(fixture.calls.put.length, 0);
  }
});

test("actual SW: poisoned public cache entries are validated, discarded and never served offline", async () => {
  for (const response of [
    publicResponse(publicPayload({ setWriteVersions: {} })),
    publicResponse(publicPayload({ songs: [{ ...publicPayload().songs[0], rehearsalNotes: "Owner-only fixture" }] })),
    publicResponse(publicPayload(), { "X-Rad-Dad-Read-Scope": "owner" }),
    publicResponse(publicPayload({ show: { ...publicPayload().show, slug: "another-night" } })),
    new Response("not JSON", { headers: { "X-Rad-Dad-Read-Scope": "public", "X-Rad-Dad-Data-Source": "database" } }),
  ]) {
    const fixture = worker();
    fixture.seed(CACHE, API, response);
    const result = await fixture.dispatch(API);
    assert.equal(result.status, 503);
    assert.equal(result.headers.get("X-Rad-Dad-Offline"), null);
    assert.doesNotMatch(await result.text(), /Owner-only|setWriteVersions/);
    assert.equal(await fixture.cached(API), undefined);
    assert.deepEqual(fixture.calls.delete, [[CACHE, API]]);
  }
});

test("actual SW: an untrusted network reply may use only an already verified public fallback", async () => {
  const fixture = worker(async () => publicResponse(publicPayload({ setWriteVersions: {} })));
  fixture.seed(CACHE, API, publicResponse());
  const result = await fixture.dispatch(API);
  assert.equal(result.headers.get("X-Rad-Dad-Offline"), "1");
  assert.deepEqual(await result.json(), publicPayload());
  assert.equal(fixture.calls.put.length, 0);
});

test("actual SW: valid confirmed fallback remains readable but does not replace the saved database copy", async () => {
  const payload = publicPayload({ dataSource: "confirmed-fallback" });
  const fixture = worker(async () => publicResponse(payload, { "X-Rad-Dad-Data-Source": "confirmed-fallback" }));
  fixture.seed(CACHE, API, publicResponse());
  const result = await fixture.dispatch(API);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("X-Rad-Dad-Offline"), null);
  assert.deepEqual(await result.json(), payload);
  assert.deepEqual(await (await fixture.cached(API)).json(), publicPayload());
  assert.equal(fixture.calls.put.length, 0);
  assert.equal((await fixture.message(resources)).ready, false);
});

test("actual SW: every additional public API URL in CACHE_SHOW must independently pass the privacy check", async () => {
  const secondary = `${API}&extra=second`;
  const fixture = worker(async (url) => url === secondary
    ? publicResponse(publicPayload({ setWriteVersions: {} }))
    : url.includes("/api/show") ? publicResponse() : htmlResponse());
  assert.equal((await fixture.message([...resources, secondary])).ready, false);
  assert.equal(await fixture.cached(secondary), undefined);
  assert.ok(fixture.calls.fetch.every((call) => call.credentials === "omit"));
});

test("actual SW: activating v4 purges old app caches, including owner-contaminated API and HTML, only", async () => {
  const fixture = worker();
  fixture.seed("rad-dad-show-offline-v1", API, publicResponse());
  fixture.seed("rad-dad-show-offline-v2", API, publicResponse(publicPayload({ setWriteVersions: {} })));
  fixture.seed("rad-dad-show-offline-v2", resources[0], new Response("Previously private fixture HTML"));
  fixture.seed("rad-dad-show-offline-v3", resources[0], htmlResponse(showHtml({ source: "confirmed-fallback" })));
  fixture.seed("unrelated-fixture-cache", API, new Response("Unrelated data stays"));
  fixture.seed(CACHE, API, publicResponse());
  await fixture.activate();
  assert.deepEqual(fixture.calls.removedCaches.sort(), ["rad-dad-show-offline-v1", "rad-dad-show-offline-v2", "rad-dad-show-offline-v3"]);
  assert.equal(fixture.calls.claimed, 1);
  assert.deepEqual(await (await fixture.cached(API)).json(), publicPayload());
  assert.equal(await (await fixture.cached(API, "unrelated-fixture-cache")).text(), "Unrelated data stays");
  assert.equal(await fixture.cached(API, "rad-dad-show-offline-v2"), undefined);
  assert.equal(await fixture.cached(resources[0], "rad-dad-show-offline-v3"), undefined);
});

const rejectedPages = [
  ["confirmed fallback", () => htmlResponse(showHtml({ source: "confirmed-fallback" }))],
  ["unavailable", () => htmlResponse(showHtml({ source: "unavailable" }))],
  ["unavailable without proof", () => htmlResponse("<h1>Show temporarily unavailable</h1>")],
  ["wrong show", () => htmlResponse(showHtml({ slug: "another-night" }))],
  ["unrelated 200", () => htmlResponse("<h1>Sign in</h1>")],
  ["missing source", () => htmlResponse('<div data-show-slug="synthetic-night">No source</div>')],
  ["split proof", () => htmlResponse('<div data-show-slug="synthetic-night"></div><div data-show-source="database"></div>')],
  ["comment proof", () => htmlResponse(`<!-- ${showHtml()} --><h1>Unavailable</h1>`) ],
  ["script proof", () => htmlResponse(`<script>const example = ${JSON.stringify(showHtml())};</script>`) ],
  ["inert template proof", () => htmlResponse(`<template>${showHtml()}</template>`) ],
  ["quoted attribute proof", () => htmlResponse(`<div title='${showHtml()}'>Unavailable</div>`) ],
  ["non-HTML raw-text delimiter", () => htmlResponse('<script></script\u00a0><div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div>')],
  ["non-HTML attribute separator", () => htmlResponse('<div data-show-source="database"\u00a0data-show-slug="synthetic-night">Unavailable</div>')],
  ["lookalike tag name", () => htmlResponse('<div.example data-show-slug="synthetic-night" data-show-source="database">Unavailable</div.example>')],
  ["unclosed quoted attribute proof", () => htmlResponse(`<span title='<div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div>`) ],
  ["frameset-contained proof", () => htmlResponse('<html><head></head><frameset><div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div></frameset></html>')],
  ["after-frameset proof", () => htmlResponse('<html><head></head><frameset></frameset><div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div></html>')],
  ["select-contained proof", () => htmlResponse('<select><div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div></select>')],
  ["double-escaped script proof", () => htmlResponse('<script><!--<script></script><div data-show-slug="synthetic-night" data-show-source="database">Unavailable</div></script>')],
  ["duplicate source", () => htmlResponse(showHtml().replace('data-show-source="database"', 'data-show-source="confirmed-fallback" data-show-source="database"'))],
  ["ambiguous roots", () => htmlResponse(showHtml() + showHtml({ slug: "another-night" }))],
  ["JSON with HTML text", () => new Response(JSON.stringify(showHtml()), { headers: { "Content-Type": "application/json" } })],
  ["missing content type", () => new Response(showHtml(), { headers: {} })],
  ["offline marked", () => htmlResponse(showHtml(), { "X-Rad-Dad-Offline": "1" })],
  ["HTTP error", () => new Response(showHtml(), { status: 503, headers: { "Content-Type": "text/html" } })],
  ["redirect to unrelated page", () => {
    const response = htmlResponse();
    Object.defineProperties(response, { redirected: { value: true }, url: { value: `${ORIGIN}/show-control` } });
    return response;
  }],
  ["unexpected final URL", () => {
    const response = htmlResponse();
    Object.defineProperty(response, "url", { value: `${ORIGIN}/?show=another-night` });
    return response;
  }],
  ["unreadable body", () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("Synthetic body failure")); } }), { headers: { "Content-Type": "text/html" } })],
];

for (const [reason, response] of rejectedPages) {
  for (const rejectedUrl of resources.slice(0, 2)) {
    test(`actual SW: ${reason} cannot replace ${rejectedUrl.includes("practice") ? "practice" : "show"} HTML or announce fresh readiness`, async () => {
      const fixture = worker(async (url) => url === API ? publicResponse() : url === rejectedUrl ? response() : htmlResponse());
      const saved = showHtml({ body: "Previously verified page" });
      for (const url of resources.slice(0, 2)) fixture.seed(CACHE, url, htmlResponse(saved));
      const result = await fixture.message(resources);
      assert.equal(result.ready, false);
      assert.equal(await (await fixture.cached(rejectedUrl)).text(), saved);
      assert.ok(fixture.calls.put.every(([, url]) => url !== rejectedUrl));
      assert.equal(await (await fixture.cached(resources.find((url) => url !== API && url !== rejectedUrl))).text(), showHtml());
    });
  }
}

test("actual SW: both independently verified HTML responses replace old pages and report ready", async () => {
  const fixture = worker(async (url) => url === API ? publicResponse() : htmlResponse(showHtml({ body: url })));
  for (const url of resources.slice(0, 2)) fixture.seed(CACHE, url, htmlResponse(showHtml({ body: "Older verified page" })));
  const result = await fixture.message(resources);
  assert.equal(result.ready, true);
  assert.equal(result.cached, 3);
  for (const url of resources.slice(0, 2)) assert.equal(await (await fixture.cached(url)).text(), showHtml({ body: url }));
});

test("actual SW: refused HTML is not stored on first preparation and a later verified retry recovers", async () => {
  let verified = false;
  const fixture = worker(async (url) => url === API ? publicResponse() : htmlResponse(showHtml({ source: verified ? "database" : "confirmed-fallback" })));
  assert.equal((await fixture.message(resources)).ready, false);
  for (const url of resources.slice(0, 2)) assert.equal(await fixture.cached(url), undefined);
  verified = true;
  assert.equal((await fixture.message(resources)).ready, true);
});

test("actual SW: HTML proof accepts serialized attribute order, quoting and surrounding framework content", async () => {
  const html = `<!doctype html><html><head><script>const text = '<div data-show-slug="wrong-night" data-show-source="database">';</script></head><body>
    <!-- framework boundary --><template><template><div data-show-slug="wrong-night"></div></template></template>
    <div title="A > B" data-show-source = 'database' class="show" data-show-slug = 'synthetic-night'>Verified page</div>
    <script>/* serialized props are not another root */</script></body></html>`;
  const fixture = worker(async (url) => url === API ? publicResponse() : htmlResponse(html));
  assert.equal((await fixture.message(resources)).ready, true);
  for (const url of resources.slice(0, 2)) assert.equal(await (await fixture.cached(url)).text(), html);
});
