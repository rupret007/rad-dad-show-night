import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { normalizeOfficialSongContent, savedOfficialMediaUrl } from "../lib/song-resources.ts";
import { showOwnerDirtyNotice, showOwnerSavedNotice, showOwnerSavedWithLaterEditsNotice, showOwnerSaveHoldNotice, showOwnerSavingNotice } from "../lib/show-lifecycle.ts";
import { showPayloadBelongsToShow } from "../lib/show-read-integrity.ts";
import { readOwnerSetSongs, readOwnerShowSongs } from "../lib/owner-set-review.ts";
import { applySuccessfulOfficialSave, classifyOwnerSaveResult, OWNER_SAVE_DEADLINE_MS, officialSetRevision, readReviewedVersion, readSetWriteVersions, revisionsFromOfficialSets } from "../lib/owner-set-save.ts";

// Execute the production functions, not a rewritten race guard. This fixture
// needs no HTTP listener, React renderer, DB, credentials, or external provider.
const source = await readFile(new URL("../app/show-control/show-control.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("control.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["findResources", "updateSong", "replaceSet", "markDirty", "retireResourceLookup", "changeActiveSet", "switchShow", "verifiedOwnerResponse", "setSongsBySet", "saveSet", "withinOwnerDeadline", "operationIsCurrent", "operationStillOwned", "adoptSetAuthority", "holdSave", "clearSaveHold"]);
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) declarations.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const compiled = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const row = (id = 1, showId = "night-a") => ({ id, showId, setSlug: "rad-dad", position: id, title: `Fixture ${id}`, artist: "Fixture artist", isOriginal: false, transition: false, durationSeconds: 180, performanceNote: "", songKey: "", tuning: "", youtubeUrl: "", youtubeVideoId: "", lyricsUrl: "", chordsUrl: "", rehearsalNotes: "", updatedAt: "2026-10-01T00:00:00.000Z" });
const result = { youtubeUrl: "https://youtu.be/4ReFoSZHL7o", youtubeVideoId: "4ReFoSZHL7o", lyricsUrl: "https://fixture.invalid/lyrics", chordsUrl: "https://fixture.invalid/chords" };
const empty = () => ({ "rad-dad": [], stalemate: [], "jeff-story-friends": [] });
const show = (slug) => ({ id: slug, slug, title: slug, status: "draft" });
const versions = { "rad-dad": "initial:0", stalemate: "initial:0", "jeff-story-friends": "initial:0" };
const apply = (old, next) => typeof next === "function" ? next(old) : next;
function fixture({ queueSongRenders = false } = {}) {
  const requests = [];
  const pending = [];
  const pendingSaves = [];
  const songUpdates = [];
  const state = { songs: { ...empty(), "rad-dad": [row(), row(2)] }, dirty: new Set(), notice: "", enriching: null };
  function setSongsBySetState(next) {
    if (queueSongRenders) songUpdates.push(next);
    else {
      state.songs = apply(state.songs, next);
      context.songsBySetRef.current = state.songs;
    }
  }
  const context = {
    AbortController, Set, Error, savedOfficialMediaUrl, showOwnerDirtyNotice,
    showPayloadBelongsToShow, readOwnerShowSongs, readSetWriteVersions, revisionsFromOfficialSets,
    normalizeOfficialSongContent, readOwnerSetSongs, applySuccessfulOfficialSave, classifyOwnerSaveResult,
    OWNER_SAVE_DEADLINE_MS, readReviewedVersion, showOwnerSavedNotice, showOwnerSavedWithLaterEditsNotice,
    showOwnerSaveHoldNotice, showOwnerSavingNotice,
    parseShowSets: () => [], SET_DEFINITIONS: [],
    resourceFields: ["youtubeUrl", "youtubeVideoId", "chordsUrl", "lyricsUrl"],
    resourceOperation: { current: null }, ownerOperation: { current: null }, mounted: { current: true },
    currentShow: { current: { id: "night-a", slug: "night-a" } },
    activeShow: show("night-a"), activeShowSlug: "night-a", activeSet: "rad-dad",
    songsBySetRef: { current: state.songs }, dirtySets: state.dirty, retiredVersions: { current: {} },
    get songsBySet() { return state.songs; },
    setSongsBySet: setSongsBySetState, setSongsBySetState,
    saveHolds: {}, setReviews: {}, checkingSet: null, showVerified: true,
    showSets: [{ slug: "rad-dad", title: "Rad Dad" }],
    reviewedBases: revisionsFromOfficialSets(state.songs), reviewedVersions: { ...versions },
    setDirtySets(next) { state.dirty = apply(state.dirty, next); context.dirtySets = state.dirty; },
    setNotice(value) { state.notice = value; }, setEnriching(value) { state.enriching = value; },
    setActiveSet(value) { context.activeSet = value; },
    setActiveShowSlug(value) { context.activeShowSlug = value; context.activeShow = show(value); context.currentShow.current = show(value); },
    setLoading() {}, setSaving() {},
    setReviewedBases(next) { context.reviewedBases = apply(context.reviewedBases, next); },
    setReviewedVersions(next) { context.reviewedVersions = apply(context.reviewedVersions, next); },
    setSetReviews() {}, setReviewReadFailed() {}, setSaveHolds() {}, setDeleted() {}, setShowSets() {}, setCoachSets() {},
    window: { confirm: () => true, history: { replaceState() {} }, setTimeout, clearTimeout },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url === "/api/show" && options.method === "POST") {
        return { ok: true, status: 200, json: () => new Promise((resolve, reject) => pendingSaves.push({ resolve, reject })) };
      }
      if (url.startsWith("/api/show?")) {
        const slug = new URL(url, "https://fixture.invalid").searchParams.get("show");
        return new Response(JSON.stringify({ show: show(slug), songs: [row(1, slug)], setWriteVersions: versions }), { headers: { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" } });
      }
      assert.equal(url, "/api/enrich");
      // Ignore cancellation intentionally; late bodies still resolve/reject.
      return { ok: true, json: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) };
    },
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  return {
    state, context, requests,
    async start(id = 1) {
      const completion = context.findResources(state.songs["rad-dad"].find((song) => song.id === id));
      await new Promise((resolve) => setImmediate(resolve));
      return { completion, ...pending.at(-1) };
    },
    async save() {
      const completion = context.saveSet("rad-dad");
      await new Promise((resolve) => setImmediate(resolve));
      return { completion, ...pendingSaves.at(-1) };
    },
    flushSongRender() {
      for (const next of songUpdates.splice(0)) state.songs = apply(state.songs, next);
      context.songsBySetRef.current = state.songs;
    },
    edit(patch, id = 1) { context.updateSong(id, patch); },
    selectSet(setSlug) { (context.changeActiveSet ?? context.setActiveSet)(setSlug); },
    song: (id = 1) => state.songs["rad-dad"].find((song) => song.id === id),
  };
}

test("manual video and cue edits survive; untouched links enrich only the draft", async () => {
  const f = fixture(); const request = await f.start();
  f.edit({ youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", youtubeVideoId: "dQw4w9WgXcQ", performanceNote: "My ending" });
  request.resolve(result); await request.completion;
  assert.equal(f.song().youtubeUrl, "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(f.song().youtubeVideoId, "dQw4w9WgXcQ");
  assert.equal(f.song().performanceNote, "My ending");
  assert.equal(f.song().lyricsUrl, result.lyricsUrl);
  assert.equal(f.song().chordsUrl, result.chordsUrl);
  assert.equal(f.state.dirty.has("rad-dad"), true);
  assert.deepEqual(f.requests.map((r) => r.url), ["/api/enrich"], "no publication request");
});

for (const field of ["lyricsUrl", "chordsUrl", "youtubeUrl"]) {
  test(`${field} edited then cleared stays empty`, async () => {
    const f = fixture(); const request = await f.start();
    f.edit({ [field]: "https://fixture.invalid/manual" }); f.edit({ [field]: "" });
    request.resolve(result); await request.completion;
    assert.equal(f.song()[field], "");
    if (field === "youtubeUrl") assert.equal(f.song().youtubeVideoId, "");
  });
}
for (const field of ["title", "artist", "isOriginal"]) {
  test(`${field} changed and restored retires the lookup and its notice`, async () => {
    const f = fixture(); const request = await f.start(); const original = f.song()[field];
    f.edit({ [field]: field === "isOriginal" ? true : "New identity" }); f.edit({ [field]: original });
    const notice = f.state.notice;
    request.resolve(result); await request.completion;
    assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.notice, notice);
    assert.equal(f.requests[0].options.signal.aborted, true);
  });
}
for (const returnToSameShow of [false, true]) {
  for (const fail of [false, true]) {
    test(`show switch${returnToSameShow ? " and return" : ""} ignores late ${fail ? "failure" : "success"}`, async () => {
      const f = fixture(); const request = await f.start();
      await f.context.switchShow("night-b");
      if (returnToSameShow) await f.context.switchShow("night-a");
      const notice = f.state.notice;
      if (fail) request.reject(new Error("Late fixture failure")); else request.resolve(result);
      await request.completion;
      assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.dirty.size, 0); assert.equal(f.state.notice, notice);
    });
  }
}
test("switching sets away/back does not dirty the restored set", async () => {
  const f = fixture(); const request = await f.start();
  f.selectSet("stalemate"); f.selectSet("rad-dad");
  request.resolve(result); await request.completion;
  assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.dirty.size, 0);
});
test("remove and undo cannot revive a lookup", async () => {
  const f = fixture(); const request = await f.start(); const songs = f.state.songs["rad-dad"];
  f.context.replaceSet("rad-dad", songs.slice(1)); f.context.replaceSet("rad-dad", songs);
  const notice = f.state.notice;
  request.resolve(result); await request.completion;
  assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.notice, notice);
});
test("reordering keeps the same song eligible", async () => {
  const f = fixture(); const request = await f.start();
  f.context.replaceSet("rad-dad", [...f.state.songs["rad-dad"]].reverse());
  request.resolve(result); await request.completion;
  assert.equal(f.song().youtubeUrl, result.youtubeUrl); assert.equal(f.song().position, 2);
});
test("superseded completion cannot clear the newer busy state or change notices", async () => {
  const f = fixture(); const first = await f.start(); const second = await f.start(2); const notice = f.state.notice;
  first.resolve(result); await first.completion;
  assert.equal(f.state.enriching, "2"); assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.notice, notice);
  second.resolve(result); await second.completion;
  assert.equal(f.song(2).youtubeUrl, result.youtubeUrl); assert.equal(f.state.enriching, null);
});
test("no usable fields means no dirty draft", async () => {
  const f = fixture(); const request = await f.start(); request.resolve({}); await request.completion;
  assert.equal(f.state.dirty.size, 0);
});
test("unmounted editor ignores the late body", async () => {
  const f = fixture(); const request = await f.start(); f.context.mounted.current = false;
  request.resolve(result); await request.completion;
  assert.equal(f.song().youtubeUrl, ""); assert.equal(f.state.dirty.size, 0);
});

test("a lookup settling with a Save receipt preserves every persisted row identity", async () => {
  const f = fixture({ queueSongRenders: true });
  f.state.songs["rad-dad"][1] = { ...row(2), id: "draft-fixture-1" };
  f.context.reviewedBases["rad-dad"] = officialSetRevision([row()]);
  const save = await f.save();
  const lookup = await f.start();
  const savedRows = f.state.songs["rad-dad"].map((song, index) => ({
    ...song, id: index === 0 ? 1 : 42, updatedAt: "2026-10-02T00:00:00.000Z",
  }));
  // Both async completions can run before React commits the batched render.
  // Execute the real save receipt path, then the real lookup path in that gap.
  save.resolve({ songs: savedRows, reviewedBase: officialSetRevision(savedRows), reviewedVersion: "d2f7c5b2-1c2a-41b2-8ca5-8143b590b05b" });
  await save.completion;
  lookup.resolve(result);
  await lookup.completion;
  f.flushSongRender();
  assert.deepEqual(Array.from(f.state.songs["rad-dad"], (song) => song.id), [1, 42]);
  assert.equal(f.song().updatedAt, savedRows[0].updatedAt);
  assert.equal(f.song().youtubeUrl, result.youtubeUrl);
  assert.equal(f.state.dirty.has("rad-dad"), true, "lookup changes after the saved snapshot still need Save");
  assert.equal(f.context.reviewedBases["rad-dad"], officialSetRevision(savedRows));
});
