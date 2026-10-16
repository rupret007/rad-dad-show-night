import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as integrity from "../lib/show-read-integrity.ts";
import * as resources from "../lib/song-resources.ts";
import * as night from "../lib/show-night-use.ts";
import * as position from "../lib/run-position.ts";
import * as publicShow from "../lib/show-public.ts";
import { DEFAULT_SONGS, SET_DEFINITIONS, SHOW_DETAILS } from "../lib/show-data.ts";

// Execute the actual component and effects with deterministic hook/storage/
// network seams. No source extraction, server, browser, database, or network.
const source = await readFile(new URL("../app/live-set-lists.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const old = "2026-09-01T12:00:00.000Z";
const middle = "2026-09-02T12:00:00.000Z";
const newest = "2026-09-03T12:00:00.000Z";
const song = (title, updatedAt, id = 204) => ({ ...DEFAULT_SONGS[0], id, title, updatedAt });
const payload = (title, updatedAt) => ({
  show: SHOW_DETAILS, songs: [song(title, updatedAt)], sets: SET_DEFINITIONS,
  updatedAt, dataSource: "database",
});
function harness({ local, online = false, initialDataSource = "database" } = {}) {
  const hooks = [], effects = [], timers = new Map(), listeners = new Map();
  const storage = new Map([[night.practicePositionKey(SHOW_DETAILS.slug), "204"]]);
  if (local) storage.set(integrity.showSnapshotKey(SHOW_DETAILS.slug), JSON.stringify(local));
  let cursor = 0, dirty = false, tree, timerId = 0;
  let reply = null, offline = true;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
      return [hooks[index], (value) => {
        const next = typeof value === "function" ? value(hooks[index]) : value;
        if (!Object.is(next, hooks[index])) { hooks[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index][i]))) {
        hooks[index] = deps; effects.push(fn);
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "../lib/show-read-integrity": integrity, "../lib/song-resources": resources,
    "../lib/show-night-use": night, "../lib/run-position": position,
    "../lib/show-public": publicShow, "./show-page.module.css": { default: {} },
  };
  const setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
  const events = {
    addEventListener(name, fn) { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
    removeEventListener() {},
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require(name) { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; },
    AbortController, URL, Date, setTimeout, clearTimeout: (id) => timers.delete(id),
    navigator: { onLine: online, userAgent: "fixture" },
    window: { ...events, setTimeout, clearTimeout: (id) => timers.delete(id), setInterval() {}, clearInterval() {}, matchMedia: () => ({ matches: false }) },
    document: { ...events, visibilityState: "visible" },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async () => {
      if (!reply) throw new Error("Fixture offline");
      return { ok: true, json: async () => reply, headers: { get: () => offline ? "1" : null } };
    },
  });
  const element = exports.default({ initialSongs: [song("Stale HTML", old, 101)],
    initialSets: SET_DEFINITIONS, initialDataSource, showSlug: SHOW_DETAILS.slug,
    showId: SHOW_DETAILS.id, practiceMode: true });
  function render() {
    do { dirty = false; cursor = 0; tree = element.type(element.props); } while (dirty);
    for (const effect of effects.splice(0)) effect();
  }
  async function flush() {
    for (let pass = 0; pass < 8; pass++) {
      for (const [id, timer] of timers) if (timer.ms === 0) { timers.delete(id); timer.fn(); }
      await new Promise((resolve) => setImmediate(resolve));
      if (dirty) render();
    }
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  render();
  return {
    storage,
    async open(data = null, cached = true, apiFirst = false) {
      reply = data; offline = cached;
      if (apiFirst) {
        const [id, timer] = [...timers].find(([, timer]) => timer.ms === 0);
        timers.delete(id); timer.fn();
        await new Promise((resolve) => setImmediate(resolve));
        if (dirty) render();
      }
      await flush();
    },
    async refresh(data, cached = true) {
      reply = data; offline = cached;
      for (const fn of listeners.get("online") ?? []) fn();
      await flush();
    },
    titles: () => nodes().filter((node) => node.props?.["aria-label"]?.startsWith("Mark ")).map((node) => node.props["aria-label"]),
    selected: () => nodes().filter((node) => node.props?.["aria-pressed"] === true).map((node) => node.props["aria-label"]),
    status: () => nodes().find((node) => node.props?.["data-testid"] === "run-position-status")?.props["data-run-position"],
    async choose(title) {
      nodes().find((node) => node.props?.["aria-label"] === label(title)).props.onClick();
      await flush();
    },
  };
}
const snapshot = (title, time, showId = SHOW_DETAILS.id) => integrity.createStoredShowSnapshot(
  SHOW_DETAILS.slug, [{ ...song(title, time), showId }], time, newest, showId,
);
const label = (title) => `Mark ${title} as current song`;

test("offline API replaces stale database HTML with a newer verified same-show set", async () => {
  const h = harness();
  await h.open(payload("Newer API", middle));
  assert.deepEqual(h.titles(), [label("Newer API")]);
});

test("offline local snapshot restores an exact saved position absent from stale HTML", async () => {
  const h = harness({ local: snapshot("Newest local", newest) });
  await h.open();
  assert.deepEqual(h.selected(), [label("Newest local")]);
  assert.equal(h.status(), "selected");
});

for (const localNewer of [true, false]) test(`newest offline snapshot wins with localNewer=${localNewer}`, async () => {
  const h = harness({ local: snapshot("Local", localNewer ? newest : middle) });
  await h.open(payload("Cached API", localNewer ? middle : newest));
  const expected = localNewer ? "Local" : "Cached API";
  assert.deepEqual(h.titles(), [label(expected)]);
  await h.refresh(payload("Older replay", old));
  assert.deepEqual(h.titles(), [label(expected)]);
});

test("a verified live read prevents every subsequent cached response from replacing it", async () => {
  const h = harness();
  await h.open(payload("Live", middle), false);
  await h.refresh(payload("Cache replay", newest));
  assert.deepEqual(h.titles(), [label("Live")]);
});

test("newer wrong-show snapshots still fail closed", async () => {
  const h = harness({ local: snapshot("Foreign local", newest, "foreign-id") });
  const foreign = payload("Foreign API", newest);
  foreign.show = { ...foreign.show, id: "foreign-id" };
  await h.open(foreign);
  assert.deepEqual(h.titles(), [label("Stale HTML")]);
});

test("live removal still requires manual recovery when the old ID reappears", async () => {
  const h = harness();
  await h.open(payload("Live anchor", middle), false);
  assert.deepEqual(h.selected(), [label("Live anchor")]);
  await h.refresh({ ...payload("Removed", newest), songs: [] }, false);
  assert.equal(h.status(), "missing");
  await h.refresh(payload("Reappeared", newest), false);
  assert.equal(h.status(), "missing");
  assert.deepEqual(h.selected(), []);
  await h.choose("Reappeared");
  assert.deepEqual(h.selected(), [label("Reappeared")]);
});

test("a cached API read restores the saved ID even when navigator reports online", async () => {
  const h = harness({ online: true });
  await h.open(payload("Cached anchor", newest));
  assert.deepEqual(h.selected(), [label("Cached anchor")]);
});

test("online initialization does not overwrite a newer local snapshot with stale HTML", async () => {
  const local = snapshot("Newer local", newest);
  const h = harness({ local, online: true });
  await h.open();
  assert.deepEqual(h.titles(), [label("Newer local")]);
  assert.equal(JSON.parse(h.storage.get(integrity.showSnapshotKey(SHOW_DETAILS.slug))).songs[0].title, "Newer local");
});

for (const time of [old, "invalid-time", ""]) test(`cache without a newer content timestamp keeps verified HTML (${time || "empty"})`, async () => {
  const h = harness({ local: snapshot("Older local", time) });
  await h.open(payload("Older API", time));
  assert.deepEqual(h.titles(), [label("Stale HTML")]);
});

test("an empty foreign-show snapshot cannot borrow this show's identity", async () => {
  const local = { ...snapshot("Foreign", newest, "foreign-id"), songs: [] };
  const h = harness({ local });
  await h.open();
  assert.deepEqual(h.titles(), [label("Stale HTML")]);
});

test("verified offline data can replace a confirmed fallback without a timestamp", async () => {
  const h = harness({ initialDataSource: "confirmed-fallback" });
  await h.open(payload("Verified cache", ""));
  assert.deepEqual(h.titles(), [label("Verified cache")]);
});

for (const localNewer of [true, false]) test(`API completing before storage initialization still keeps newest data (localNewer=${localNewer})`, async () => {
  const h = harness({ local: snapshot("Local", localNewer ? newest : middle) });
  await h.open(payload("Cached API", localNewer ? middle : newest), true, true);
  assert.deepEqual(h.selected(), [label(localNewer ? "Local" : "Cached API")]);
});

test("a live read completing before storage initialization cannot be replaced by local cache", async () => {
  const h = harness({ local: snapshot("Local cache", newest), online: true });
  await h.open(payload("Live anchor", middle), false, true);
  assert.deepEqual(h.selected(), [label("Live anchor")]);
});

test("a newer song timestamp counts even if the API timestamp describes an older set", async () => {
  const h = harness({ local: snapshot("Local", middle) });
  await h.open({ ...payload("Newest song", newest), updatedAt: old });
  assert.deepEqual(h.selected(), [label("Newest song")]);
});

test("a newer verified empty snapshot clears stale songs without borrowing a selection", async () => {
  const h = harness({ local: { ...snapshot("Empty", newest), songs: [] } });
  await h.open(payload("Older API", middle));
  assert.deepEqual(h.titles(), []);
  assert.equal(h.status(), "missing");
});
