import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { SET_DEFINITIONS } from "../lib/show-data.ts";
import { parseShowSets, showPayloadBelongsToShow } from "../lib/show-read-integrity.ts";
import { readOwnerShowSongs } from "../lib/owner-set-review.ts";
import { OWNER_SAVE_DEADLINE_MS, readSetWriteVersions, revisionsFromOfficialSets } from "../lib/owner-set-save.ts";

// Execute the actual entry-read code with synthetic state, clock and transport.
// AST extraction avoids duplicating the implementation and needs no HTTP server.
// Browser specs separately exercise rendering, controls and React cleanup.
const source = await readFile(new URL("../app/show-control/show-control.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("show-control.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const extracted = {};
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ["withinOwnerDeadline", "verifiedOwnerResponse", "switchShow"].includes(node.name?.text)) {
    extracted[node.name.text] = node.getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") {
    const effect = node.arguments[0].getText(ast);
    if (effect.includes("const requestedShow")) extracted.initial = `const initial = ${effect};`;
    if (effect.includes("mounted.current = true")) extracted.lifecycle = `const lifecycle = ${effect};`;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(Object.keys(extracted).length, 5);
const compiled = ts.transpileModule(`${Object.values(extracted).join("\n")}\nglobalThis.entry = { initial, lifecycle, switchShow };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const SHOW_A = { id: "read-a", slug: "read-a", status: "draft" };
const SHOW_B = { id: "read-b", slug: "read-b", status: "draft" };
const headers = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };
function payload(show = SHOW_A) {
  return { show, songs: [], sets: SET_DEFINITIONS, setWriteVersions: {
    "rad-dad": "initial:0", stalemate: "initial:0", "jeff-story-friends": "initial:0",
  } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(transport) {
  const state = { loading: true, showVerified: false, notice: "", dirtySets: new Set(), activeShowSlug: SHOW_A.slug };
  const refs = { ownerRead: { current: null }, mounted: { current: true }, ownerOperation: { current: null }, retiredVersions: { current: {} } };
  const timers = new Map();
  const requests = [];
  const writes = [];
  const history = [];
  const context = { ...refs, ...state, SHOW_DETAILS: SHOW_A, SET_DEFINITIONS,
    AbortController, URLSearchParams, Error, OWNER_SAVE_DEADLINE_MS,
    parseShowSets, showPayloadBelongsToShow, readOwnerShowSongs, readSetWriteVersions, revisionsFromOfficialSets,
    fetch(url, options) { requests.push({ url, options }); return transport(url, options, requests.length); },
    window: { location: { search: `?show=${SHOW_A.slug}` }, confirm: () => true,
      setTimeout(fn, ms) { assert.equal(ms, 10_000); timers.set(fn, ms); return fn; },
      clearTimeout(fn) { timers.delete(fn); },
      history: { replaceState(_state, _title, url) { history.push(url); } },
    },
  };
  for (const name of ["Loading", "ShowVerified", "Notice", "SongsBySet", "ReviewedBases", "ReviewedVersions", "SetReviews", "ReviewReadFailed", "SaveHolds", "Deleted", "Shows", "ActiveShowSlug", "ShowSets", "CoachSets", "DirtySets"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    context[`set${name}`] = (value) => { state[key] = value; context[key] = value; writes.push(key); };
  }
  vm.runInNewContext(compiled, context);
  return { state, ...refs, timers, requests, writes, history, ...context.entry,
    expire() { for (const fn of [...timers.keys()]) { timers.delete(fn); fn(); } },
  };
}
function successful(url) {
  return Promise.resolve(Response.json(url === "/api/shows" ? { shows: [SHOW_A, SHOW_B] }
    : payload(url.includes(SHOW_B.slug) ? SHOW_B : SHOW_A), { headers }));
}

for (const endpoint of ["/api/show", "/api/shows"]) {
  for (const phase of ["headers", "body"]) {
    test(`initial ${endpoint} ${phase}: finite deadline, no late authority, abort both requests`, async () => {
      const held = deferred();
      const f = fixture((url) => {
        if (new URL(url, "http://fixture.invalid").pathname !== endpoint) return successful(url);
        return phase === "headers" ? held.promise : Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise });
      });
      const cleanup = f.initial();
      await settle();
      assert.equal(f.state.loading, true);
      f.expire(); await settle();
      assert.equal(f.state.loading, false);
      assert.equal(f.state.showVerified, false);
      assert.match(f.state.notice, /timed out/i);
      assert.ok(f.requests.every((request) => request.options.signal.aborted));
      const writes = f.writes.length;
      held.resolve(phase === "headers" ? Response.json(payload(), { headers }) : endpoint === "/api/shows" ? { shows: [SHOW_A] } : payload());
      await settle();
      assert.equal(f.writes.length, writes, "Late completion cannot update state");
      assert.equal(f.timers.size, 0);
      cleanup();
    });
  }
}

for (const phase of ["headers", "body"]) {
  test(`switch ${phase}: timeout preserves draft, authority and URL; retry succeeds`, async () => {
    const held = deferred();
    let hold = true;
    const f = fixture((url) => {
      if (!url.includes(SHOW_B.slug) || !hold) return successful(url);
      return phase === "headers" ? held.promise : Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise });
    });
    f.initial(); await settle();
    f.state.songsBySet["rad-dad"].push({ title: "Unsaved draft" });
    f.state.dirtySets.add("rad-dad");
    const draft = f.state.songsBySet;
    const versions = f.state.reviewedVersions;
    const switching = f.switchShow(SHOW_B.slug);
    await settle(); f.expire(); await switching;
    assert.equal(f.state.loading, false);
    assert.equal(f.state.activeShowSlug, SHOW_A.slug);
    assert.equal(f.state.songsBySet, draft);
    assert.equal(f.state.reviewedVersions, versions);
    assert.equal(f.state.showVerified, true);
    assert.ok(f.state.dirtySets.has("rad-dad"));
    assert.match(f.state.notice, /current show and draft are kept/);
    const writes = f.writes.length;
    held.resolve(phase === "headers" ? Response.json(payload(SHOW_B), { headers }) : payload(SHOW_B));
    await settle();
    assert.equal(f.writes.length, writes);
    assert.deepEqual(f.history, []);
    hold = false;
    await f.switchShow(SHOW_B.slug);
    assert.equal(f.state.activeShowSlug, SHOW_B.slug);
    assert.equal(f.state.dirtySets.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.ownerRead.current, null);
  });
}

for (const kind of ["initial", "switch"]) {
  test(`${kind}: unmount aborts pending body and ignores completion`, async () => {
    const held = deferred();
    const f = fixture((url) => url === "/api/shows" ? successful(url)
      : Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise }));
    const unmount = f.lifecycle();
    const cleanup = kind === "initial" ? f.initial() : null;
    if (kind === "switch") void f.switchShow(SHOW_B.slug);
    await settle();
    unmount(); cleanup?.(); await settle();
    assert.ok(f.requests.every((request) => request.options.signal.aborted));
    const writes = f.writes.length;
    held.resolve(payload(SHOW_B)); await settle();
    assert.equal(f.writes.length, writes);
    assert.deepEqual(f.history, []);
    assert.equal(f.timers.size, 0);
  });
}

test("superseded switch cannot clear loading or adopt the older result", async () => {
  const held = deferred();
  const f = fixture((url) => url.includes(SHOW_B.slug)
    ? Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise }) : successful(url));
  f.initial(); await settle();
  const first = f.switchShow(SHOW_B.slug); await settle();
  const oldSignal = f.requests.at(-1).options.signal;
  await f.switchShow(SHOW_A.slug); await first;
  assert.equal(oldSignal.aborted, true);
  const writes = f.writes.length;
  held.resolve(payload(SHOW_B)); await settle();
  assert.equal(f.writes.length, writes);
  assert.equal(f.state.activeShowSlug, SHOW_A.slug);
  assert.equal(f.state.loading, false);
  assert.equal(f.history.length, 1);
});

test("retired initial effect cannot overwrite a fresh verified load", async () => {
  const held = deferred();
  let hold = true;
  const f = fixture((url) => hold && url !== "/api/shows"
    ? Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise }) : successful(url));
  const cleanup = f.initial(); await settle(); cleanup();
  const oldSignal = f.requests[0].options.signal;
  hold = false;
  f.initial(); await settle();
  assert.equal(oldSignal.aborted, true);
  assert.equal(f.state.showVerified, true);
  const writes = f.writes.length;
  held.resolve(payload(SHOW_B)); await settle();
  assert.equal(f.writes.length, writes);
  assert.equal(f.state.activeShowSlug, SHOW_A.slug);
});

test("offline, public, wrong-show and malformed owner reads grant no authority", async () => {
  for (const response of [
    Response.json(payload(), { headers: { ...headers, "X-Rad-Dad-Offline": "1" } }),
    Response.json(payload(), { headers: { ...headers, "X-Rad-Dad-Read-Scope": "public" } }),
    Response.json(payload(SHOW_B), { headers }),
    Response.json({ ...payload(), setWriteVersions: null }, { headers }),
  ]) {
    const f = fixture((url) => url === "/api/shows" ? successful(url) : Promise.resolve(response));
    f.initial(); await settle();
    assert.equal(f.state.showVerified, false);
    assert.equal(f.state.loading, false);
    assert.equal(f.timers.size, 0);
  }
  assert.match(source, /if \(!showVerified\)[\s\S]*?Retry verified load/);
});

test("initial rejected show list retires a pending owner read without granting authority", async () => {
  const held = deferred();
  const f = fixture((url) => url === "/api/shows"
    ? Promise.resolve(Response.json({ shows: [SHOW_A] }, { status: 503 }))
    : Promise.resolve({ ok: true, headers: new Headers(headers), json: () => held.promise }));
  f.initial(); await settle();
  assert.equal(f.state.loading, false);
  assert.equal(f.state.showVerified, false);
  assert.match(f.state.notice, /Could not load the owner show list/);
  assert.ok(f.requests.every((request) => request.options.signal.aborted));
  assert.equal(f.timers.size, 0);
  const writes = f.writes.length;
  held.resolve(payload()); await settle();
  assert.equal(f.writes.length, writes);
});
