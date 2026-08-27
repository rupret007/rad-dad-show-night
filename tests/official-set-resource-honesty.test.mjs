import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  LIVE_SET_SLUGS,
  MISSING_MEDIA_FAILS_CLOSED,
  ORIGINALS_HIDE_PUBLIC_RESOURCES,
  SHOW_NIGHT_DOES_NOT_EXPAND_VAULT,
} = await import("../lib/surface-roles.ts");
const { DEFAULT_SONGS } = await import("../lib/show-data.ts");
const {
  getCuratedSongResources,
  hydrateOfficialSongMedia,
  publicSongResourceActions,
} = await import("../lib/song-resources.ts");

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveSetListsUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const songResourcesUrl = new URL("../lib/song-resources.ts", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const technicalGuideUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);
const showPlanUrl = new URL("../docs/SHOW_PLAN.md", import.meta.url);

const officialOriginals = DEFAULT_SONGS.filter((song) => song.isOriginal);
const officialRadDadSongs = DEFAULT_SONGS.filter(
  (song) => song.setSlug === "rad-dad",
);

const siteHonestyOfficialTitles = [
  "Basket Case",
  "The Rock Show",
  "Ruby Soho",
  "The Story Of Us",
];

const notInConfirmedRadDadSet = [
  "Song 2",
  "Saw Her Standing There",
  "Tutti Frutti",
  "In the Jungle",
  "In Bloom",
  "Santeria",
];

const everySongHasYouTubeLies = [
  /every song has a direct YouTube path/i,
  /every song has .*youtube/i,
];

test("surface roles admit originals hide public resources on the live set", () => {
  assert.equal(ORIGINALS_HIDE_PUBLIC_RESOURCES, true);
  assert.equal(MISSING_MEDIA_FAILS_CLOSED, true);
  assert.equal(SHOW_NIGHT_DOES_NOT_EXPAND_VAULT, true);
  assert.deepEqual([...LIVE_SET_SLUGS], [
    "jeff-story-friends",
    "stalemate",
    "rad-dad",
  ]);
});

test("official-set copy does not claim every song has a YouTube path", async () => {
  const [page, readme, guide, plan, liveList] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(technicalGuideUrl, "utf8"),
    readFile(showPlanUrl, "utf8"),
    readFile(liveSetListsUrl, "utf8"),
  ]);

  for (const source of [page, readme, guide, plan, liveList]) {
    for (const token of everySongHasYouTubeLies) {
      assert.doesNotMatch(source, token);
    }
  }
  assert.match(
    page,
    /Covers can show YouTube and lyrics when saved; originals hide both/,
  );
  assert.match(page, /These lists update from Show Control/);
  assert.match(plan, /The Way I Love You is the only Rad Dad original/);
  assert.match(guide, /Original songs display neither resource/);
});

test("the live list hides YouTube and lyrics for official originals", async () => {
  const source = await readFile(liveSetListsUrl, "utf8");
  assert.match(source, /publicSongResourceActions/);
  assert.match(source, /\{!song\.isOriginal &&/);
  assert.match(source, /styles\.resourceBar/);
  assert.match(source, /song\.isOriginal \? \(/);
  assert.match(source, /Original/);
  assert.doesNotMatch(source, /YouTube search/);
  assert.doesNotMatch(source, /Lyrics search/);
});

test("missing official-set media fails closed instead of inventing a search", () => {
  const original = publicSongResourceActions({
    title: "The Drinking Song",
    artist: "",
    isOriginal: true,
  });
  assert.equal(original.youtubeUrl, "");
  assert.equal(original.lyricsUrl, "");

  const excludedSiteRow = publicSongResourceActions({
    title: "Song 2",
    artist: "Blur",
    isOriginal: false,
  });
  assert.equal(excludedSiteRow.youtubeUrl, "");
  assert.equal(excludedSiteRow.lyricsUrl, "");

  const officialCover = publicSongResourceActions({
    title: "Badfish",
    artist: "Sublime",
    isOriginal: false,
  });
  assert.match(officialCover.youtubeUrl, /youtube\.com\/watch\?v=/);
  assert.equal(officialCover.youtubeIsDirect, true);

  const hydratedSearch = hydrateOfficialSongMedia({
    youtubeUrl: "https://www.youtube.com/results?search_query=santeria",
    youtubeVideoId: "",
    lyricsUrl: "https://genius.com/search?q=santeria",
    chordsUrl: "https://www.ultimate-guitar.com/search.php?search_type=title&value=santeria",
  });
  assert.equal(hydratedSearch.youtubeUrl, "");
  assert.equal(hydratedSearch.lyricsUrl, "");
  assert.equal(hydratedSearch.chordsUrl, "");
  assert.equal(hydratedSearch.youtubeVideoId, "");
});

test("curated resources do not invent YouTube for official originals", async () => {
  assert.ok(officialOriginals.length > 0, "official originals must stay present");
  assert.ok(
    officialOriginals.some((song) => song.title === "The Way I Love You"),
    "Rad Dad original stays on the official set",
  );

  const resources = await readFile(songResourcesUrl, "utf8");
  for (const song of officialOriginals) {
    assert.equal(
      getCuratedSongResources(song.title, song.artist),
      null,
      `${song.title} is an official original and must not get a curated YouTube dump`,
    );
    assert.doesNotMatch(
      resources,
      new RegExp(`resource\\("${escapeRegExp(song.title)}"`),
      `${song.title} must not appear in the curated resource table`,
    );
  }
});

test("official Rad Dad titles stay on the live set, not a homepage dump", () => {
  const radDadTitles = officialRadDadSongs.map((song) => song.title);
  for (const title of siteHonestyOfficialTitles) {
    assert.ok(
      radDadTitles.includes(title),
      `${title} belongs on the official Rad Dad set`,
    );
  }
  for (const title of notInConfirmedRadDadSet) {
    assert.equal(
      radDadTitles.includes(title),
      false,
      `${title} is not in the confirmed Rad Dad set`,
    );
  }
});

test("this leftover does not rewrite Jeff's official set or add a fourth live band", async () => {
  const [showData, resources] = await Promise.all([
    readFile(showDataUrl, "utf8"),
    readFile(songResourcesUrl, "utf8"),
  ]);
  assert.match(showData, /Heart-Shaped Box/);
  assert.match(showData, /Travis Story - guitar/);
  assert.match(showData, /First Date/);
  assert.match(showData, /The Way I Love You/);
  assert.match(showData, /Tomorrow's Another Day/);
  assert.match(resources, /Tomorrow's Another Day/);
  const definitions = showData.slice(showData.indexOf("export const SET_DEFINITIONS"));
  const slugs = [...definitions.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(slugs, [...LIVE_SET_SLUGS]);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
