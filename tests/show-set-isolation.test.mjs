import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  CLONES_CANNOT_INHERIT_ANOTHER_SHOW_SET,
  FAN_AND_BAND_KNOW_NEXT_ACTION,
  NEVER_AUTO_POST,
  TRAVIS_BOOKS,
} = await import("../lib/surface-roles.ts");
const { RUN_OF_SHOW, SET_DEFINITIONS, SHOW_DETAILS } = await import(
  "../lib/show-data.ts"
);
const {
  buildShowSets,
  canAcceptVerifiedShowPayload,
  canUseConfirmedShowFallback,
} = await import("../lib/show-read-integrity.ts");

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const showStoreUrl = new URL("../lib/show-store.ts", import.meta.url);
const showsRouteUrl = new URL("../app/api/shows/route.ts", import.meta.url);
const showControlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const serviceWorkerUrl = new URL("../public/sw.js", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const technicalGuideUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);

test("surface roles keep clone isolation and named next actions", () => {
  assert.equal(CLONES_CANNOT_INHERIT_ANOTHER_SHOW_SET, true);
  assert.equal(FAN_AND_BAND_KNOW_NEXT_ACTION, true);
  assert.equal(NEVER_AUTO_POST, true);
  assert.equal(TRAVIS_BOOKS, true);
});

test("a clone cannot inherit the canonical set times or verified songs", () => {
  const cloneSlug = "richardson-2026-10-31";
  assert.equal(canUseConfirmedShowFallback(cloneSlug), false);
  assert.equal(
    canAcceptVerifiedShowPayload(
      {
        dataSource: "database",
        show: { slug: SHOW_DETAILS.slug, id: SHOW_DETAILS.id },
        songs: [],
      },
      cloneSlug,
    ),
    false,
  );

  const cloneSets = buildShowSets([
    {
      time: "8:00-8:25",
      title: "Jeff Story & Friends",
      type: "performance",
      setSlug: "jeff-story-friends",
    },
    {
      time: "8:40-9:00",
      title: "Stalemate",
      type: "performance",
      setSlug: "stalemate",
    },
    {
      time: "9:10-10:10",
      title: "Rad Dad",
      type: "performance",
      setSlug: "rad-dad",
    },
  ]);
  assert.notDeepEqual(
    cloneSets.map((set) => set.time),
    SET_DEFINITIONS.map((set) => set.time),
  );
  assert.deepEqual(
    buildShowSets([]).map((set) => set.time),
    ["", "", ""],
  );
  assert.notEqual(RUN_OF_SHOW[0].time, cloneSets[0].time);
});

test("the live page names fan and band next steps for this show", async () => {
  const [page, layout] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
  ]);
  assert.match(page, /aria-label="Next step for this show"/);
  assert.match(page, /Fan next step/);
  assert.match(page, /Band next step/);
  assert.match(page, /See the official sets/);
  assert.match(page, /Suggest a song/);
  assert.match(page, /Practice this show/);
  assert.match(page, /buildShowNightUse/);
  assert.match(page, /This show has no official set yet/);
  assert.match(page, /This show has no verified list yet/);
  assert.match(page, /sets\.map/);
  assert.match(page, /featuredGuestSet\(timeline\)/);
  assert.match(page, /isCanonicalShowSlug\(show\.slug\)/);
  assert.doesNotMatch(page, /SET_DEFINITIONS\.map/);
  assert.match(page, /function canonicalMetadata/);
  assert.doesNotMatch(layout, /September 19, 2026/);
  assert.doesNotMatch(layout, /Guitars & Growlers/);
});

test("live refresh, snapshots, and Show Control reject another show's set", async () => {
  const [liveList, store, showsRoute, showControl, serviceWorker] =
    await Promise.all([
      readFile(liveListUrl, "utf8"),
      readFile(showStoreUrl, "utf8"),
      readFile(showsRouteUrl, "utf8"),
      readFile(showControlUrl, "utf8"),
      readFile(serviceWorkerUrl, "utf8"),
    ]);

  assert.match(liveList, /canAcceptVerifiedShowPayload\(data, showSlug\)/);
  assert.match(liveList, /songsBelongToShow\(snapshot\.songs/);
  assert.match(liveList, /if \(showId && !songsBelongToShow\(songs, \{ id: showId \}\)\) return;/);
  assert.match(store, /sets: buildShowSets\(timeline\)/);
  assert.match(store, /if \(!songsBelongToShow\(officialSongs, show\)\)/);
  assert.doesNotMatch(store, /timeline\.length \? timeline : RUN_OF_SHOW/);
  assert.match(
    showsRoute,
    /INSERT INTO songs \([\s\S]*?SELECT \?, set_slug[\s\S]*?FROM songs WHERE show_id = \?/,
  );
  assert.match(showControl, /showPayloadBelongsToShow\(showData, requestedShow\)/);
  assert.match(showControl, /showPayloadBelongsToShow\(data, slug\)/);
  assert.match(showControl, /The original show is unchanged/);
  assert.match(serviceWorker, /showApiMatchesRequest/);
  assert.match(serviceWorker, /payload\.show\.slug !== requestedSlug/);
});

test("docs keep clone isolation and do not rewrite Jeff's official set", async () => {
  const [readme, guide, showData] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(technicalGuideUrl, "utf8"),
    readFile(showDataUrl, "utf8"),
  ]);

  assert.match(readme, /Fan next step|fan or band member/i);
  assert.match(readme, /cannot inherit another/i);
  assert.match(guide, /cannot inherit another/i);
  assert.match(showData, /Heart-Shaped Box/);
  assert.match(showData, /Travis Story - guitar/);
  assert.match(showData, /First Date/);
  assert.match(showData, /The Way I Love You/);
  const definitions = showData.slice(showData.indexOf("export const SET_DEFINITIONS"));
  assert.match(definitions, /7:00-7:35 PM/);
  assert.match(definitions, /8:35-8:55 PM/);
  assert.match(definitions, /9:00-10:00 PM/);
});
