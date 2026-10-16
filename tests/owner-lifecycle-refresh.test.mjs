import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const source = await readFile(new URL("../app/show-control/show-control.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const libraries = Object.fromEntries(await Promise.all([
  "show-data", "show-read-integrity", "song-resources", "show-lifecycle", "show-control-posture",
  "show-public", "owner-set-save", "owner-set-review", "suggestion-board", "acoustic-set-helper",
].map(async (name) => [`../../lib/${name}`, await import(`../lib/${name}.ts`)])));
const A = { id: "fixture-a", slug: "fixture-a", title: "Fixture A", venue: "Venue A", showDate: "2026-10-01",
  date: "Fixture date", hours: "", startTime: "", endTime: "", expectedWrap: "", status: "draft", isDefault: false };
const B = { ...A, id: "fixture-b", slug: "fixture-b", title: "Fixture B" };
const headers = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };
function payload(show) {
  return { show, sets: libraries["../../lib/show-data"].SET_DEFINITIONS,
    setWriteVersions: { "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "initial:0" },
    songs: [{ id: 11, showId: show.id, setSlug: "rad-dad", position: 1, title: `Song ${show.slug}`,
      artist: "Fixture artist", transition: false, isOriginal: false, durationSeconds: 180,
      performanceNote: "Count in", songKey: "G", tuning: "", youtubeUrl: "", youtubeVideoId: "",
      chordsUrl: "", lyricsUrl: "", rehearsalNotes: "", updatedAt: "2026-10-01T00:00:00Z" }] };
}
const reply = (show) => Response.json(payload(show), { headers });
const text = (node) => Array.isArray(node) ? node.map(text).join("")
  : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "";
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node?.props ? [node, ...nodes(node.props.children)] : [];
}

// Run the entire shipped component with deterministic hooks and synthetic fetch.
// Child tools are opaque: these cases exercise the owner's actual effects,
// event handlers, state updates, and rendered props, without DOM/network access.
async function owner(shows, read, { failSave = false } = {}) {
  const slots = [], effects = [], calls = [];
  let cursor = 0, dirty = true, tree;
  const window = { location: { search: `?show=${A.slug}` }, confirm: () => true,
    history: { replaceState(_state, _title, url) { window.location.search = url; } },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame(fn) { fn(); }, setTimeout, clearTimeout };
  const effect = (fn, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) {
      slots[index] = deps; effects.push(fn);
    }
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId() { cursor++; return "fixture-id"; }, useMemo(fn) { cursor++; return fn(); },
    useEffect: effect, useLayoutEffect: effect,
  };
  const fixtureModule = { exports: {} };
  vm.runInNewContext(compiled, { module: fixtureModule, exports: fixtureModule.exports, window, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async (path, init = {}) => {
      calls.push({ path, method: init.method ?? "GET" });
      if (init.method === "POST") {
        if (failSave) return Response.json({ error: "Fixture conflict" }, { status: 409 });
        const { songs } = JSON.parse(init.body);
        return Response.json({ songs, reviewedBase: libraries["../../lib/owner-set-save"].officialSetRevision(songs),
          reviewedVersion: "11111111-1111-4111-8111-111111111111" });
      }
      if (path === "/api/shows") return Response.json({ shows });
      if (path === "/api/suggestions") return Response.json({ suggestions: [] });
      const url = new URL(path, "http://fixture.invalid");
      assert.equal(url.pathname, "/api/show"); assert.equal(url.searchParams.get("scope"), "owner");
      return read(url.searchParams.get("show"));
    },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return jsx;
      if (libraries[id]) return libraries[id];
      if (["next/link", "./set-coach", "./acoustic-slot-helper"].includes(id)) return { default: id };
      if (id === "./show-control.module.css") return { default: {} };
      throw new Error(`Unmocked dependency: ${id}`);
    },
  });
  async function flush() {
    for (let turn = 0; turn < 12; turn++) {
      if (dirty) { dirty = false; cursor = 0; tree = fixtureModule.exports.default({ userName: "Fixture", userEmail: "fixture@example.invalid", signOutHref: "/sign-out" }); }
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(dirty, false, "component settled");
  }
  await flush();
  return {
    calls, window, flush,
    all: () => nodes(tree), text: () => text(tree),
    find(predicate) { const result = nodes(tree).find(predicate); assert.ok(result, "rendered control exists"); return result; },
    async switch(slug) { this.find(n => n.props.id === "show-picker").props.onChange({ target: { value: slug } }); await flush(); },
    async edit() { this.find(n => n.type === "input" && n.props.value === `Song ${A.slug}`).props.onChange({ target: { value: "Unsaved fixture title" } }); await flush(); },
    async click(label) { const button = nodes(tree).filter(n => n.type === "button" && text(n) === label).at(-1); assert.ok(button); assert.equal(Boolean(button.props.disabled), false); await button.props.onClick(); await flush(); },
  };
}
function assertShow(ui, show) {
  const picker = ui.find(n => n.props.id === "show-picker");
  assert.equal(picker.props.value, show.slug);
  const options = ui.all().filter(n => n.type === "option");
  assert.equal(options.filter(n => n.props.value === show.slug).length, 1);
  assert.match(text(options.find(n => n.props.value === show.slug)), new RegExp(show.venue));
  const badge = ui.find(n => n.type === "span" && n.props["data-status"] === show.status);
  assert.equal(text(badge), libraries["../../lib/show-lifecycle"].showStatusBadge(show.status, show.isDefault));
  const link = ui.find(n => n.type === "a" && n.props["data-share-open"] !== undefined);
  assert.equal(link.props.href, `/?show=${show.slug}`);
  assert.equal(link.props["data-share-open"], String(show.status === "published"));
  assert.equal(text(link), libraries["../../lib/show-lifecycle"].showShareLinkLabel(show.status));
  assert.ok(ui.text().includes(`${show.title} · ${show.showDate}`));
  assert.ok(text(ui.find(n => n.props["data-show-hours"] !== undefined)).includes(show.hours || "Hours not set"));
}
for (const listed of ["stale", "missing"]) {
  test(`actual initial load upserts ${listed} list record and default guard`, async () => {
    const verified = { ...A, status: "published", isDefault: true, title: "Fresh title", venue: "Fresh venue", hours: "8-11 PM" };
    const ui = await owner(listed === "stale" ? [A, B] : [B], () => reply(verified));
    assertShow(ui, verified);
    assert.equal(ui.all().filter(n => n.type === "option").length, 2);
    assert.equal(ui.find(n => n.type === "button" && text(n) === "Archive show").props.disabled, true);
    assert.ok(ui.text().includes("Ready. This published set matches the public share link."));
    assert.equal(ui.calls.filter(c => c.method !== "GET").length, 0);
  });
}
for (const status of ["published", "archived"]) {
  test(`actual switch adopts ${status} record and Save behavior without extra writes`, async () => {
    const verified = { ...B, status, title: "Fresh B", venue: "Fresh venue B", hours: "9-11 PM" };
    const ui = await owner([A, { ...B, status: status === "published" ? "draft" : "published" }], slug => reply(slug === A.slug ? A : verified));
    await ui.switch(B.slug); assertShow(ui, verified);
    assert.equal(ui.all().filter(n => n.type === "option").length, 2);
    const input = ui.find(n => n.type === "input" && n.props.value === `Song ${B.slug}`);
    input.props.onChange({ target: { value: "Unsaved B title" } }); await ui.flush();
    assert.ok(ui.text().includes(libraries["../../lib/show-lifecycle"].showOwnerDirtyNotice(status)));
    assert.equal(ui.calls.filter(c => c.method !== "GET").length, 0);
    await ui.click("Save Rad Dad");
    assert.ok(ui.text().includes(libraries["../../lib/show-lifecycle"].showOwnerSavedNotice("Rad Dad", status)));
    assert.deepEqual(ui.calls.filter(c => c.method !== "GET"), [{ path: "/api/show", method: "POST" }]);
  });
}
test("actual saved-list check refreshes metadata and preserves the draft without another write", async () => {
  let reads = 0;
  const verified = { ...A, status: "published", hours: "8-10 PM" };
  const ui = await owner([A, B], () => reply(++reads === 1 ? A : verified), { failSave: true });
  await ui.edit(); await ui.click("Save Rad Dad"); await ui.click("Check saved Rad Dad");
  assertShow(ui, verified);
  assert.ok(ui.all().some(n => n.type === "input" && n.props.value === "Unsaved fixture title"));
  assert.ok(ui.text().includes("Nothing has been overwritten."));
  assert.equal(ui.calls.filter(c => c.method !== "GET").length, 1);
});
for (const failure of ["http", "offline", "wrong-show", "invalid-songs", "invalid-versions", "malformed-json"]) {
  test(`actual ${failure} switch keeps previous record, draft, URL, and write authority`, async () => {
    const ui = await owner([A, B], (slug) => {
      if (slug === A.slug) return reply(A);
      const json = payload({ ...B, status: "published" });
      if (failure === "http") return new Response(null, { status: 503 });
      if (failure === "offline") return Response.json(json, { headers: { ...headers, "X-Rad-Dad-Offline": "1" } });
      if (failure === "wrong-show") return reply(A);
      if (failure === "invalid-songs") json.songs[0].showId = "foreign";
      if (failure === "invalid-versions") json.setWriteVersions = {};
      if (failure === "malformed-json") return new Response("{", { headers });
      return Response.json(json, { headers });
    });
    await ui.edit(); const priorUrl = ui.window.location.search;
    await ui.switch(B.slug); assertShow(ui, A);
    assert.equal(ui.window.location.search, priorUrl);
    assert.ok(ui.all().some(n => n.type === "input" && n.props.value === "Unsaved fixture title"));
    assert.equal(ui.calls.filter(c => c.method !== "GET").length, 0);
    await ui.click("Save Rad Dad");
    assert.ok(ui.text().includes("Rad Dad is saved on this private draft."));
  });
}
