import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS, SHOW_DETAILS } from "../lib/show-data.ts";
import { RUN_OF_SHOW } from "../lib/show-data.ts";
import { buildShowSets } from "../lib/show-read-integrity.ts";
import {
  buildShowNightUse,
  firstOpenAction,
  leftoverPublicActions,
  openingSetStageCues,
  practicePositionKey,
  publicProductionNotes,
  resumeSongFromSavedPosition,
  showHasRunOfShow,
} from "../lib/show-night-use.ts";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const resumeUrl = new URL("../app/practice-resume.tsx", import.meta.url);
const nextStepUrl = new URL("../lib/show-night-use.ts", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const showRouteUrl = new URL("../app/api/show/route.ts", import.meta.url);
const showPageStylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("first open names one next action from this show's verified list", () => {
  const sets = buildShowSets(RUN_OF_SHOW);
  const ready = buildShowNightUse(DEFAULT_SONGS, sets);
  assert.equal(ready.hasVerifiedList, true);
  assert.equal(ready.songCount, DEFAULT_SONGS.length);
  assert.equal(ready.firstSet?.slug, "jeff-story-friends");
  assert.equal(ready.firstSet?.time, "7:00-7:35 PM");
  assert.equal(ready.sets[0].songCount, 6);
  assert.equal(ready.sets[1].songCount, 6);
  assert.equal(ready.sets[2].songCount, 19);

  const next = firstOpenAction(ready);
  assert.equal(next.kind, "start-set");
  assert.match(next.title, /Jeff Story & Friends/);
  assert.match(next.title, /7:00-7:35 PM/);
  assert.match(next.copy, /31 verified songs/);
  assert.equal(next.label, "See the official sets");
  assert.equal(next.href, "#set-jeff-story-friends");
  assert.doesNotMatch(next.copy, /suggest a song|practice/i);

  const leftovers = leftoverPublicActions(ready, next);
  assert.deepEqual(
    leftovers.map((action) => action.kind),
    ["suggest-song", "practice-show"],
  );
  assert.equal(leftovers.filter((action) => action.kind === "suggest-song").length, 1);
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

  const next = firstOpenAction(empty);
  assert.equal(next.kind, "suggest-song");
  assert.match(next.title, /no official set yet/);
  assert.doesNotMatch(next.title, /7:00-7:35|Jeff Story|Heart-Shaped Box|Basket Case/);
  assert.doesNotMatch(next.copy, /Heart-Shaped Box|Basket Case|7:00-7:35/);
  assert.match(next.copy, /will not show another night/);
  assert.equal(next.label, "Suggest a song");
  assert.equal(next.href, "#suggestions");
  assert.deepEqual(leftoverPublicActions(empty, next), []);
  assert.equal(showHasRunOfShow([]), false);
  assert.equal(showHasRunOfShow(RUN_OF_SHOW), true);

  const emptyNotes = publicProductionNotes({
    canonicalShow: false,
    featuredGuestTitle: "",
    expectedWrap: "8:00-11:00 PM",
  });
  assert.doesNotMatch(emptyNotes.join(" "), /Mason|Fault Lines|7:00-7:35|Heart-Shaped Box/);
  assert.equal(emptyNotes.includes("Share the backline where practical."), true);
});

test("an empty clone without hours does not invent another night's wrap", () => {
  const notes = publicProductionNotes({
    canonicalShow: false,
    featuredGuestTitle: "",
    expectedWrap: "",
  });
  assert.equal(notes.includes("Share the backline where practical."), true);
  assert.doesNotMatch(notes.join(" "), /expected wrap|10:00 PM|7:00 PM|The planned wrap/);
});

test("canonical production notes stay on this night and empty clones drop guest windows", () => {
  const canonical = publicProductionNotes({
    canonicalShow: true,
    featuredGuestTitle: "Mason / The Fault Lines",
    expectedWrap: "10:00 PM",
  });
  assert.equal(
    canonical.includes("Protect the Mason / Fault Lines setup window."),
    true,
  );
  assert.equal(
    canonical.includes("10:00 PM is the expected wrap, not a venue curfew."),
    true,
  );
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
    resumeSongFromSavedPosition("1003", thisShowSongs),
    { id: 1003, title: "The Drinking Song" },
  );
  assert.equal(
    resumeSongFromSavedPosition("9999", thisShowSongs),
    null,
  );
  assert.equal(resumeSongFromSavedPosition("", thisShowSongs), null);
  assert.equal(resumeSongFromSavedPosition(null, thisShowSongs), null);
});

test("the live page uses one first-open next step and honest empty sets", async () => {
  const [page, liveList, resume, nextStep, showData, showRoute, styles, readme] =
    await Promise.all([
      readFile(pageUrl, "utf8"),
      readFile(liveListUrl, "utf8"),
      readFile(resumeUrl, "utf8"),
      readFile(nextStepUrl, "utf8"),
      readFile(showDataUrl, "utf8"),
      readFile(showRouteUrl, "utf8"),
      readFile(showPageStylesUrl, "utf8"),
      readFile(readmeUrl, "utf8"),
    ]);

  assert.match(page, /buildShowNightUse/);
  assert.match(page, /firstOpenAction/);
  assert.match(page, /leftoverPublicActions/);
  assert.match(page, /publicProductionNotes/);
  assert.match(page, /One next step/);
  assert.doesNotMatch(page, /Fan next step/);
  assert.doesNotMatch(page, /Band next step/);
  assert.doesNotMatch(page, /nextSetJumps/);
  assert.match(page, /data-next-action-count="1"/);
  assert.match(page, /data-first-open-action/);
  assert.match(page, /styles\.firstOpenLead/);
  assert.match(page, /styles\.heroRest/);
  assert.match(styles, /\.nextActions \{ order: 2;/);
  assert.match(styles, /\.heroPosterWrap \{ order: 3;/);
  assert.match(nextStep, /See the official sets/);
  assert.match(page, /openAction\.label/);
  assert.match(page, /Suggest a song/);
  assert.match(nextStep, /Practice this show/);
  assert.match(page, /PracticeResume/);
  assert.match(page, /data-has-verified-list/);
  assert.match(page, /publishedPublicShareCopy/);
  assert.match(page, /data-public-share="open"/);
  assert.match(page, /hasRunOfShow/);
  assert.equal(page.match(/styles\.mobilePrimaryLink/g)?.length, 3);
  assert.match(page, /styles\.practiceLink} \$\{styles\.mobileOptionalLink/);
  assert.match(page, /className=\{styles\.controlLink\}/);
  assert.doesNotMatch(page, /SET_DEFINITIONS\.map/);
  assert.match(nextStep, /This show has no official set yet/);
  assert.match(nextStep, /See the official sets/);
  assert.match(nextStep, /will not show another night/);

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
  assert.match(styles, /\.topLinks a \{ display: none; \}/);
  assert.match(
    styles,
    /\.topLinks \.mobilePrimaryLink, \.topLinks \.practiceLink \{[^}]*display: inline-flex;/,
  );
  assert.match(styles, /\.topLinks \.mobileOptionalLink \{ display: none; \}/);
  assert.doesNotMatch(
    styles,
    /\.topLinks \.controlLink \{[^}]*display: inline-flex;/,
  );
  assert.match(styles, /\.nextActions \{[^}]*grid-template-columns: 1fr;/);
  assert.match(page, /className=\{styles\.footerControl\}/);
  assert.match(readme, /one next action on first open|one next step/i);
});

test("opening set stage cues detect Jeff solo, Candace duets, and guest phases", () => {
  const flow = openingSetStageCues(DEFAULT_SONGS);
  assert.equal(flow.hasStageCues, true);
  assert.equal(flow.stageCues.length, 2);
  assert.equal(flow.stageCues[0].label, "Candace joins Jeff");
  assert.equal(flow.stageCues[0].accent, "duet");
  assert.equal(flow.stageCues[0].afterPosition, 2);
  assert.equal(flow.stageCues[1].label, "Guest performers");
  assert.equal(flow.stageCues[1].accent, "guests");
  assert.equal(flow.stageCues[1].afterPosition, 4);
  assert.equal(flow.hasTbdSlot, true);
  assert.equal(flow.tbdSlotPosition, 2);
});

test("opening set stage cues are empty for non-opening sets or too few songs", () => {
  const radDadOnly = DEFAULT_SONGS.filter((s) => s.setSlug === "rad-dad");
  const flow = openingSetStageCues(radDadOnly);
  assert.equal(flow.hasStageCues, false);
  assert.deepEqual(flow.stageCues, []);
  assert.equal(flow.hasTbdSlot, false);

  const noSongs = openingSetStageCues([]);
  assert.equal(noSongs.hasStageCues, false);

  const twoSongs = DEFAULT_SONGS.filter((s) => s.setSlug === "jeff-story-friends").slice(0, 2);
  const twoFlow = openingSetStageCues(twoSongs);
  assert.equal(twoFlow.hasStageCues, false);
});

test("production notes include Candace join cue and TBD slot when opening flow present", () => {
  const flow = openingSetStageCues(DEFAULT_SONGS);
  const notes = publicProductionNotes({
    canonicalShow: true,
    featuredGuestTitle: "Mason / The Fault Lines",
    expectedWrap: "10:00 PM",
    openingFlow: flow,
  });
  assert.equal(notes.some((n) => /Candace joins Jeff/.test(n)), true);
  assert.equal(notes.some((n) => /Slot 2 is TBD/.test(n)), true);
  assert.equal(notes.some((n) => /Jeff picks the second acoustic/.test(n)), true);
  assert.equal(notes.includes("Share the backline where practical."), true);
  assert.equal(notes.includes("Confirm guest keys and endings before show day."), true);
});

test("production notes omit Candace cue when no opening flow is provided", () => {
  const notes = publicProductionNotes({
    canonicalShow: true,
    featuredGuestTitle: "Mason / The Fault Lines",
    expectedWrap: "10:00 PM",
  });
  assert.equal(notes.some((n) => /Candace/.test(n)), false);
  assert.equal(notes.some((n) => /TBD/.test(n)), false);
  assert.equal(notes.includes("Share the backline where practical."), true);
});

test("stage cue styles and data attributes exist in the live set list and stylesheet", async () => {
  const [liveList, styles] = await Promise.all([
    readFile(liveListUrl, "utf8"),
    readFile(showPageStylesUrl, "utf8"),
  ]);
  assert.match(liveList, /stageCueDivider/);
  assert.match(liveList, /stageCueLabel/);
  assert.match(liveList, /data-cue-accent/);
  assert.match(liveList, /tbdFlag/);
  assert.match(liveList, /data-tbd/);
  assert.match(styles, /\.stageCueDivider/);
  assert.match(styles, /\.stageCueLabel/);
  assert.match(styles, /\.tbdSong/);
  assert.match(styles, /\.tbdFlag/);
  assert.match(liveList, /openingSetStageCues|openingFlow/);
});
