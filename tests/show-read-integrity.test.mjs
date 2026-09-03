import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS, SHOW_DETAILS } from "../lib/show-data.ts";
import { RUN_OF_SHOW, SET_DEFINITIONS } from "../lib/show-data.ts";
import {
  MAX_SNAPSHOT_SONGS,
  OFFLINE_CACHE_VERSION,
  SHOW_SNAPSHOT_VERSION,
  CONFIRMED_FALLBACK_SHOW_SLUG,
  buildShowSets,
  canAcceptVerifiedShowPayload,
  canUseConfirmedShowFallback,
  createStoredShowSnapshot,
  featuredGuestSet,
  formatShowTimestamp,
  offlineReadyKey,
  isShowDataUnavailableError,
  parseShowSets,
  parseStoredShowSnapshot,
  shouldReplaceDisplayedSongs,
  showPayloadBelongsToShow,
  showSnapshotKey,
  songsBelongToShow,
  ShowDataUnavailableError,
} from "../lib/show-read-integrity.ts";

const showStoreUrl = new URL("../lib/show-store.ts", import.meta.url);
const showRouteUrl = new URL("../app/api/show/route.ts", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const offlineSupportUrl = new URL("../app/offline-support.tsx", import.meta.url);
const serviceWorkerUrl = new URL("../public/sw.js", import.meta.url);

test("confirmed fallback belongs only to the reviewed canonical event", () => {
  assert.equal(CONFIRMED_FALLBACK_SHOW_SLUG, SHOW_DETAILS.slug);
  assert.equal(canUseConfirmedShowFallback(), true);
  assert.equal(canUseConfirmedShowFallback(null), true);
  assert.equal(canUseConfirmedShowFallback(SHOW_DETAILS.slug), true);
  assert.equal(canUseConfirmedShowFallback("another-show-2026-10-10"), false);
  assert.equal(
    canUseConfirmedShowFallback(undefined, "future-default-2027-01-01"),
    false,
  );
  assert.equal(
    canUseConfirmedShowFallback(undefined, SHOW_DETAILS.slug),
    true,
  );

  const unavailable = new ShowDataUnavailableError();
  assert.equal(isShowDataUnavailableError(unavailable), true);
  assert.equal(isShowDataUnavailableError(new Error("network")), false);
});

test("only a verified database response can replace the displayed set", () => {
  assert.equal(shouldReplaceDisplayedSongs("database"), true);
  assert.equal(shouldReplaceDisplayedSongs("confirmed-fallback"), false);
});

test("show timestamps are stable across server and browser time zones", () => {
  assert.equal(
    formatShowTimestamp("2026-08-09T00:00:00.000Z"),
    "Aug 8, 7:00 PM",
  );
  assert.equal(formatShowTimestamp("not-a-time"), "not-a-time");
});

test("a verified device snapshot round-trips only for its exact show", () => {
  const savedAt = "2026-09-03T07:30:00.000Z";
  const updatedAt = "2026-09-03T07:29:00.000Z";
  const stored = createStoredShowSnapshot(
    SHOW_DETAILS.slug,
    DEFAULT_SONGS.slice(0, 2),
    updatedAt,
    savedAt,
  );
  const parsed = parseStoredShowSnapshot(
    JSON.stringify(stored),
    SHOW_DETAILS.slug,
  );

  assert.equal(stored.version, SHOW_SNAPSHOT_VERSION);
  assert.equal(showSnapshotKey(SHOW_DETAILS.slug), `rad-dad-show-snapshot:${SHOW_DETAILS.slug}`);
  assert.equal(OFFLINE_CACHE_VERSION, 2);
  assert.equal(
    offlineReadyKey(SHOW_DETAILS.slug),
    `rad-dad-offline-ready-v2:${SHOW_DETAILS.slug}`,
  );
  assert.equal(parsed?.showSlug, SHOW_DETAILS.slug);
  assert.equal(parsed?.savedAt, savedAt);
  assert.equal(parsed?.updatedAt, updatedAt);
  assert.deepEqual(
    parsed?.songs.map((song) => song.title),
    DEFAULT_SONGS.slice(0, 2).map((song) => song.title),
  );
  assert.equal(
    parseStoredShowSnapshot(JSON.stringify(stored), "a-different-show"),
    null,
  );
});

test("a verified payload cannot replace this show with another show's set", () => {
  const show = { slug: SHOW_DETAILS.slug, id: SHOW_DETAILS.id };
  const songs = DEFAULT_SONGS.slice(0, 2);

  assert.equal(songsBelongToShow(songs, show), true);
  assert.equal(
    songsBelongToShow([{ ...songs[0], showId: "show-somebody-else" }], show),
    false,
  );
  assert.equal(
    songsBelongToShow(
      [songs[0], { ...songs[1], showId: "show-somebody-else" }],
      show,
    ),
    false,
  );
  assert.equal(showPayloadBelongsToShow({ show, songs }, SHOW_DETAILS.slug), true);
  assert.equal(
    showPayloadBelongsToShow({ show, songs }, "another-show-2026-10-10"),
    false,
  );
  assert.equal(
    canAcceptVerifiedShowPayload(
      { dataSource: "database", show, songs },
      SHOW_DETAILS.slug,
    ),
    true,
  );
  assert.equal(
    canAcceptVerifiedShowPayload(
      { dataSource: "confirmed-fallback", show, songs },
      SHOW_DETAILS.slug,
    ),
    false,
  );
  assert.equal(
    canAcceptVerifiedShowPayload(
      {
        dataSource: "database",
        show: { slug: "another-show-2026-10-10", id: "show-somebody-else" },
        songs,
      },
      SHOW_DETAILS.slug,
    ),
    false,
  );
});

test("set times come from this show's timeline, not another event's defaults", () => {
  const cloneTimeline = [
    {
      time: "6:00-6:30",
      title: "Jeff Story & Friends",
      type: "performance",
      setSlug: "jeff-story-friends",
    },
    {
      time: "6:30-6:50",
      title: "Stalemate",
      type: "performance",
      setSlug: "stalemate",
    },
    {
      time: "7:00-8:00",
      title: "Rad Dad",
      type: "performance",
      setSlug: "rad-dad",
    },
  ];
  const cloneSets = buildShowSets(cloneTimeline);
  const canonicalSets = buildShowSets(RUN_OF_SHOW);
  const emptySets = buildShowSets([]);
  const featured = featuredGuestSet([
    {
      time: "6:40-7:20",
      duration: "40 min",
      title: "Mason / The Fault Lines",
      note: "Featured set",
      type: "performance",
      accent: "lime",
    },
  ]);

  assert.deepEqual(
    canonicalSets.map((set) => ({
      slug: set.slug,
      title: set.title,
      time: set.time,
      kicker: set.kicker,
      accent: set.accent,
    })),
    SET_DEFINITIONS.map((set) => ({
      slug: set.slug,
      title: set.title,
      time: set.time,
      kicker: set.kicker,
      accent: set.accent,
    })),
  );
  assert.deepEqual(
    cloneSets.map((set) => set.time),
    ["6:00-6:30 PM", "6:30-6:50 PM", "7:00-8:00 PM"],
  );
  assert.deepEqual(
    emptySets.map((set) => set.time),
    ["", "", ""],
  );
  assert.notDeepEqual(
    cloneSets.map((set) => set.time),
    SET_DEFINITIONS.map((set) => set.time),
  );
  assert.equal(featured?.performance.time, "6:40-7:20");
  assert.equal(featuredGuestSet(cloneTimeline), null);
  assert.deepEqual(parseShowSets(cloneSets)?.map((set) => set.slug), [
    "jeff-story-friends",
    "stalemate",
    "rad-dad",
  ]);
  assert.equal(parseShowSets([{ slug: "somebody-elses-set" }]), null);
});

test("corrupt, stale-schema, oversized, and structurally invalid snapshots fail closed", () => {
  const valid = createStoredShowSnapshot(
    SHOW_DETAILS.slug,
    DEFAULT_SONGS.slice(0, 1),
    "2026-09-03T07:29:00.000Z",
    "2026-09-03T07:30:00.000Z",
  );
  const wrongVersion = { ...valid, version: SHOW_SNAPSHOT_VERSION + 1 };
  const invalidSet = {
    ...valid,
    songs: [{ ...valid.songs[0], setSlug: "somebody-elses-set" }],
  };
  const oversized = {
    ...valid,
    songs: Array.from({ length: MAX_SNAPSHOT_SONGS + 1 }, () => valid.songs[0]),
  };

  assert.equal(parseStoredShowSnapshot("not-json", SHOW_DETAILS.slug), null);
  assert.equal(parseStoredShowSnapshot(JSON.stringify(wrongVersion), SHOW_DETAILS.slug), null);
  const mixedShow = {
    ...valid,
    songs: [
      valid.songs[0],
      { ...valid.songs[0], id: "other-row", showId: "show-somebody-else" },
    ],
  };
  assert.equal(parseStoredShowSnapshot(JSON.stringify(invalidSet), SHOW_DETAILS.slug), null);
  assert.equal(parseStoredShowSnapshot(JSON.stringify(oversized), SHOW_DETAILS.slug), null);
  assert.equal(parseStoredShowSnapshot(JSON.stringify(mixedShow), SHOW_DETAILS.slug), null);
});

test("snapshot resources cannot revive non-http links", () => {
  const stored = createStoredShowSnapshot(
    SHOW_DETAILS.slug,
    [
      {
        ...DEFAULT_SONGS[0],
        youtubeUrl: "javascript:alert(1)",
        youtubeVideoId: "../../escape",
        chordsUrl: "data:text/html,not-a-chart",
        lyricsUrl: "https://example.com/song lyrics",
      },
    ],
    "2026-09-03T07:29:00.000Z",
    "2026-09-03T07:30:00.000Z",
  );
  const [song] = parseStoredShowSnapshot(
    JSON.stringify(stored),
    SHOW_DETAILS.slug,
  ).songs;

  assert.equal(song.youtubeUrl, "");
  assert.equal(song.youtubeVideoId, "");
  assert.equal(song.chordsUrl, "");
  assert.equal(song.lyricsUrl, "https://example.com/song%20lyrics");
});

test("server, client, and offline cache preserve the same verification boundary", async () => {
  const [store, route, page, liveList, offlineSupport, serviceWorker] =
    await Promise.all([
      readFile(showStoreUrl, "utf8"),
      readFile(showRouteUrl, "utf8"),
      readFile(pageUrl, "utf8"),
      readFile(liveListUrl, "utf8"),
      readFile(offlineSupportUrl, "utf8"),
      readFile(serviceWorkerUrl, "utf8"),
    ]);

  const officialRead = store.slice(
    store.indexOf("export async function getOfficialSongs"),
    store.indexOf("export async function getShowPayload"),
  );
  assert.doesNotMatch(officialRead, /catch/);
  assert.match(store, /canUseConfirmedShowFallback\(slug, resolvedShowSlug\)/);
  assert.match(store, /throw new ShowDataUnavailableError/);
  assert.match(store, /if \(!songsBelongToShow\(officialSongs, show\)\)/);
  assert.match(store, /sets: buildShowSets\(timeline\)/);
  assert.match(store, /dataSource: "database"/);
  assert.match(store, /dataSource: "confirmed-fallback"/);
  assert.match(store, /isShowDataUnavailableError\(error\)\) throw error/);
  assert.doesNotMatch(
    store.slice(store.indexOf("const timeline = mappedTimeline.length")),
    /timeline\.length \? timeline : RUN_OF_SHOW/,
  );

  assert.match(route, /"X-Rad-Dad-Data-Source": payload\.dataSource/);
  assert.match(route, /isShowDataUnavailableError/);
  assert.match(route, /status: 503/);
  assert.match(page, /data-show-source=\{dataSource\}/);
  assert.match(page, /initialDataSource=\{dataSource\}/);
  assert.match(page, /did not\s+substitute another event/);

  assert.match(liveList, /canAcceptVerifiedShowPayload\(data, showSlug\)/);
  assert.match(liveList, /parseStoredShowSnapshot/);
  assert.match(liveList, /songsBelongToShow\(snapshot\.songs/);
  assert.match(liveList, /last verified official set stays visible/i);
  assert.match(offlineSupport, /dataset\.showSource !== "database"/);
  assert.match(serviceWorker, /rad-dad-show-offline-v2/);
  assert.match(serviceWorker, /X-Rad-Dad-Data-Source/);
  assert.match(serviceWorker, /showApiMatchesRequest/);
  assert.match(serviceWorker, /payload\.show\.slug !== requestedSlug/);
  assert.match(serviceWorker, /!navigation && verifiedShowApi/);
  assert.match(serviceWorker, /requiredUrls\.every\(\(url\) => cachedUrls\.has\(url\)\)/);
});
