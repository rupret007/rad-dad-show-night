import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://offline-fixture.invalid";
const CACHE = "rad-dad-show-offline-v3";
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
  const fixture = worker(async (url) => url.includes("/api/show") ? publicResponse() : new Response("Public fixture page"));
  const refused = await fixture.message([OWNER, `${ORIGIN}/show-control?show=synthetic-night`]);
  assert.equal(refused.ready, false);
  assert.equal(refused.cacheVersion, 3);
  assert.equal(fixture.calls.fetch.length, 0);
  const result = await fixture.message([...resources, OWNER]);
  assert.equal(result.ready, true);
  assert.equal(result.cacheVersion, 3);
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
    : url.includes("/api/show") ? publicResponse() : new Response("Public fixture page"));
  assert.equal((await fixture.message([...resources, secondary])).ready, false);
  assert.equal(await fixture.cached(secondary), undefined);
  assert.ok(fixture.calls.fetch.every((call) => call.credentials === "omit"));
});

test("actual SW: activating v3 purges old app caches, including owner-contaminated API and HTML, only", async () => {
  const fixture = worker();
  fixture.seed("rad-dad-show-offline-v1", API, publicResponse());
  fixture.seed("rad-dad-show-offline-v2", API, publicResponse(publicPayload({ setWriteVersions: {} })));
  fixture.seed("rad-dad-show-offline-v2", resources[0], new Response("Previously private fixture HTML"));
  fixture.seed("unrelated-fixture-cache", API, new Response("Unrelated data stays"));
  fixture.seed(CACHE, API, publicResponse());
  await fixture.activate();
  assert.deepEqual(fixture.calls.removedCaches.sort(), ["rad-dad-show-offline-v1", "rad-dad-show-offline-v2"]);
  assert.equal(fixture.calls.claimed, 1);
  assert.deepEqual(await (await fixture.cached(API)).json(), publicPayload());
  assert.equal(await (await fixture.cached(API, "unrelated-fixture-cache")).text(), "Unrelated data stays");
  assert.equal(await fixture.cached(API, "rad-dad-show-offline-v2"), undefined);
});
