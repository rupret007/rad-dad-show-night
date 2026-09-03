import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS, SHOW_DETAILS } from "../lib/show-data.ts";
import { RUN_OF_SHOW } from "../lib/show-data.ts";
import { buildShowSets } from "../lib/show-read-integrity.ts";
import {
  bandNextStepCopy,
  buildShowNightUse,
  fanNextStepCopy,
  practicePositionKey,
  resumeSongFromSavedPosition,
} from "../lib/show-night-use.ts";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const resumeUrl = new URL("../app/practice-resume.tsx", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const showRouteUrl = new URL("../app/api/show/route.ts", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("next steps and practice follow this show's verified list", () => {
  const sets = buildShowSets(RUN_OF_SHOW);
  const ready = buildShowNightUse(DEFAULT_SONGS, sets);
  assert.equal(ready.hasVerifiedList, true);
  assert.equal(ready.songCount, DEFAULT_SONGS.length);
  assert.equal(ready.firstSet?.slug, "jeff-story-friends");
  assert.equal(ready.firstSet?.time, "7:00-7:35 PM");
  assert.equal(ready.sets[0].songCount, 7);
  assert.equal(ready.sets[1].songCount, 6);
  assert.equal(ready.sets[2].songCount, 19);

  const fan = fanNextStepCopy(ready);
  assert.match(fan.title, /Jeff Story & Friends/);
  assert.match(fan.title, /7:00-7:35 PM/);
  assert.match(fan.copy, /32 verified songs/);

  const band = bandNextStepCopy(ready);
  assert.match(band.title, /Practice this show/);
  assert.match(band.copy, /32 songs on this event/);
});

test("an empty clone stays empty instead of inheriting another show's set", () => {
  const empty = buildShowNightUse([], buildShowSets([]));
  assert.equal(empty.hasVerifiedList, false);
  assert.equal(empty.songCount, 0);
  assert.equal(empty.firstSet, null);
  assert.deepEqual(
    empty.sets.map((set) => set.time),
    ["", "", ""],
  );
  assert.deepEqual(
    empty.sets.map((set) => set.songCount),
    [0, 0, 0],
  );

  const fan = fanNextStepCopy(empty);
  assert.match(fan.title, /no official set yet/);
  assert.doesNotMatch(fan.title, /7:00-7:35/);
  assert.doesNotMatch(fan.copy, /Heart-Shaped Box|Basket Case/);
  assert.match(fan.copy, /will not show another night/);

  const band = bandNextStepCopy(empty);
  assert.match(band.title, /no verified list yet/);
  assert.match(band.copy, /rather than borrowing another show/);
  assert.doesNotMatch(band.copy, /32 songs/);
});

test("practice resume only accepts a song that belongs to this show", () => {
  assert.equal(
    practicePositionKey(SHOW_DETAILS.slug),
    `rad-dad-practice-position:${SHOW_DETAILS.slug}`,
  );
  assert.notEqual(
    practicePositionKey("richardson-2026-10-31"),
    practicePositionKey(SHOW_DETAILS.slug),
  );

  const thisShowSongs = DEFAULT_SONGS.slice(0, 2).map((song) => ({
    id: song.id,
    title: song.title,
  }));
  assert.deepEqual(
    resumeSongFromSavedPosition("1002", thisShowSongs),
    { id: 1002, title: "Nutshell" },
  );
  assert.equal(
    resumeSongFromSavedPosition("9999", thisShowSongs),
    null,
  );
  assert.equal(resumeSongFromSavedPosition("", thisShowSongs), null);
  assert.equal(resumeSongFromSavedPosition(null, thisShowSongs), null);
});

test("the live page uses this show's next-step helper and honest empty sets", async () => {
  const [page, liveList, resume, showData, showRoute, readme] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(liveListUrl, "utf8"),
    readFile(resumeUrl, "utf8"),
    readFile(showDataUrl, "utf8"),
    readFile(showRouteUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(page, /buildShowNightUse/);
  assert.match(page, /fanNextStepCopy/);
  assert.match(page, /bandNextStepCopy/);
  assert.match(page, /Fan next step/);
  assert.match(page, /Band next step/);
  assert.match(page, /See the official sets/);
  assert.match(page, /Suggest a song/);
  assert.match(page, /Practice this show/);
  assert.match(page, /This show has no official set yet/);
  assert.match(page, /This show has no verified list yet/);
  assert.match(page, /PracticeResume/);
  assert.match(page, /data-has-verified-list/);
  assert.doesNotMatch(page, /SET_DEFINITIONS\.map/);

  assert.match(liveList, /practicePositionKey/);
  assert.match(liveList, /No verified songs on this set yet/);
  assert.match(liveList, /This show does not have a verified list yet/);
  assert.match(liveList, /Next \//);
  assert.match(liveList, /Song \$\{/);

  assert.match(resume, /practicePositionKey\(showSlug\)/);
  assert.match(resume, /resumeSongFromSavedPosition/);
  assert.match(resume, /Continue from/);

  assert.match(showData, /Heart-Shaped Box/);
  assert.match(showData, /Travis Story - guitar/);
  assert.match(showRoute, /export async function POST/);
  assert.match(readme, /this show's verified list/);
});
