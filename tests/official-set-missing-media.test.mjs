import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  COVERS_WALL_IS_NOT_THE_SET,
  LIVE_SET_SLUGS,
  MISSING_MEDIA_FAILS_CLOSED,
  OFFICIAL_SET_MEDIA_IS_SAVED_ONLY,
  SHOW_NIGHT_DOES_NOT_EXPAND_VAULT,
} = await import("../lib/surface-roles.ts");
const { DEFAULT_SONGS, SET_DEFINITIONS } = await import("../lib/show-data.ts");
const {
  getCuratedSongResources,
  hydrateOfficialSongMedia,
  publicSongResourceActions,
  savedOfficialMediaUrl,
} = await import("../lib/song-resources.ts");

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveSetListsUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const songResourcesUrl = new URL("../lib/song-resources.ts", import.meta.url);
const showRouteUrl = new URL("../app/api/show/route.ts", import.meta.url);
const showControlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);

const siteCoversWallIsNotTheSet = [
  "Song 2",
  "Saw Her Standing There",
  "Tutti Frutti",
  "In the Jungle",
  "In Bloom",
  "Santeria",
  "Bowling for Soup",
  "Harbor Lights",
  "Sidewalk Radio",
];

test("surface roles admit official-set media is saved only and a covers wall is not the set", () => {
  assert.equal(MISSING_MEDIA_FAILS_CLOSED, true);
  assert.equal(OFFICIAL_SET_MEDIA_IS_SAVED_ONLY, true);
  assert.equal(COVERS_WALL_IS_NOT_THE_SET, true);
  assert.equal(SHOW_NIGHT_DOES_NOT_EXPAND_VAULT, true);
  assert.deepEqual(SET_DEFINITIONS.map((set) => set.slug), [...LIVE_SET_SLUGS]);
});

test("public official-set actions ignore the local covers table when media is missing", () => {
  const officialCovers = DEFAULT_SONGS.filter((song) => !song.isOriginal);
  assert.ok(officialCovers.length > 0, "official covers must stay present");

  for (const song of officialCovers) {
    const actions = publicSongResourceActions(song);
    assert.equal(
      actions.youtubeUrl,
      "",
      `${song.title} has no saved official YouTube and must fail closed`,
    );
    assert.equal(
      actions.lyricsUrl,
      "",
      `${song.title} has no saved official lyrics and must fail closed`,
    );
  }

  assert.ok(
    getCuratedSongResources("Badfish", "Sublime"),
    "owner enrich may still know a cover; that table is not official-set media",
  );
  assert.equal(
    publicSongResourceActions({
      title: "Badfish",
      artist: "Sublime",
      isOriginal: false,
    }).youtubeUrl,
    "",
  );
});

test("saved official-set media still renders on covers and stays hidden on originals", () => {
  const savedCover = publicSongResourceActions({
    title: "Basket Case",
    artist: "Green Day",
    isOriginal: false,
    youtubeUrl: "https://www.youtube.com/watch?v=NUTGr5t3MoY",
    lyricsUrl: "https://genius.com/Green-day-basket-case-lyrics",
  });
  assert.equal(savedCover.youtubeUrl, "https://www.youtube.com/watch?v=NUTGr5t3MoY");
  assert.equal(savedCover.lyricsUrl, "https://genius.com/Green-day-basket-case-lyrics");

  const originalWithSavedMedia = publicSongResourceActions({
    title: "The Drinking Song",
    artist: "",
    isOriginal: true,
    youtubeUrl: "https://www.youtube.com/watch?v=rmadSGJCzo8",
    lyricsUrl: "https://genius.com/search?q=The%20Drinking%20Song",
  });
  assert.equal(originalWithSavedMedia.youtubeUrl, "");
  assert.equal(originalWithSavedMedia.lyricsUrl, "");
});

test("official writes fail closed so search URLs are not stored as media", () => {
  assert.equal(savedOfficialMediaUrl(""), "");
  assert.equal(
    savedOfficialMediaUrl("https://www.youtube.com/results?search_query=santeria"),
    "",
  );
  assert.equal(
    savedOfficialMediaUrl("https://genius.com/search?q=harbor+lights"),
    "",
  );
  assert.equal(
    savedOfficialMediaUrl(
      "https://www.ultimate-guitar.com/search.php?search_type=title&value=Song%202",
    ),
    "",
  );
  assert.equal(
    savedOfficialMediaUrl("https://www.youtube.com/watch?v=NUTGr5t3MoY"),
    "https://www.youtube.com/watch?v=NUTGr5t3MoY",
  );

  const hydrated = hydrateOfficialSongMedia({
    youtubeUrl: "https://www.youtube.com/results?search_query=badfish",
    youtubeVideoId: "",
    lyricsUrl: "https://genius.com/search?q=badfish",
    chordsUrl:
      "https://www.ultimate-guitar.com/search.php?search_type=title&value=badfish",
  });
  assert.equal(hydrated.youtubeUrl, "");
  assert.equal(hydrated.lyricsUrl, "");
  assert.equal(hydrated.chordsUrl, "");
  assert.equal(hydrated.youtubeVideoId, "");
});

test("public and owner paths do not treat the covers table or search links as official-set media", async () => {
  const [page, liveList, resources, showRoute, showControl] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(liveSetListsUrl, "utf8"),
    readFile(songResourcesUrl, "utf8"),
    readFile(showRouteUrl, "utf8"),
    readFile(showControlUrl, "utf8"),
  ]);

  assert.match(page, /Covers can show YouTube and lyrics when saved; originals hide both/);
  assert.match(liveList, /publicSongResourceActions/);
  assert.doesNotMatch(liveList, /getCuratedSongResources/);
  assert.doesNotMatch(liveList, /resolveSongResourceLinks/);
  assert.match(showRoute, /hydrateOfficialSongMedia/);
  assert.match(showControl, /savedOfficialMediaUrl/);
  assert.doesNotMatch(showControl, /chordsUrl: resources\.chordsSearchUrl/);
  assert.doesNotMatch(showControl, /lyricsUrl: resources\.lyricsSearchUrl/);

  const publicActions = resources.slice(
    resources.indexOf("export function publicSongResourceActions"),
    resources.indexOf("export function resolveSongResourceLinks"),
  );
  assert.match(publicActions, /savedOfficialMediaUrl/);
  assert.doesNotMatch(publicActions, /getCuratedSongResources/);
  assert.doesNotMatch(publicActions, /resolveSongResourceLinks/);

  for (const title of siteCoversWallIsNotTheSet) {
    const token = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.doesNotMatch(page, token, `${title} is a covers-wall or Vault row, not the official set`);
    assert.doesNotMatch(liveList, token);
  }
});

test("this leftover does not rewrite Jeff's official set or add a fourth live band", async () => {
  const source = await readFile(showDataUrl, "utf8");
  assert.match(source, /Heart-Shaped Box/);
  assert.match(source, /Travis Story - guitar/);
  assert.match(source, /First Date/);
  assert.match(source, /The Way I Love You/);
  assert.match(source, /The Story Of Us/);
  const definitions = source.slice(source.indexOf("export const SET_DEFINITIONS"));
  const slugs = [...definitions.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(slugs, [...LIVE_SET_SLUGS]);
  assert.doesNotMatch(definitions, /fault-lines/i);
});
