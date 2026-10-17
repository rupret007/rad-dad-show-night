import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS, SHOW_DETAILS } from "../lib/show-data.ts";
import { RUN_OF_SHOW } from "../lib/show-data.ts";
import { buildShowSets } from "../lib/show-read-integrity.ts";
import {
  buildShowNightUse,
  currentShowIdentity,
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

test("current-show identity uses this night's title, date, and venue", () => {
  assert.deepEqual(currentShowIdentity(SHOW_DETAILS), {
    title: SHOW_DETAILS.title,
    date: SHOW_DETAILS.date,
    venue: SHOW_DETAILS.venue,
  });
  assert.equal(currentShowIdentity(SHOW_DETAILS).title, "Rad Dad + Friends");
  assert.equal(currentShowIdentity(SHOW_DETAILS).date, "Saturday, September 19, 2026");
  assert.equal(currentShowIdentity(SHOW_DETAILS).venue, "Guitars & Growlers");
});

test("empty-clone identity never borrows the canonical event facts", () => {
  const clone = currentShowIdentity({
    title: "Richardson Halloween",
    date: "Saturday, October 31, 2026",
    venue: "Local Tap",
  });
  assert.deepEqual(clone, {
    title: "Richardson Halloween",
    date: "Saturday, October 31, 2026",
    venue: "Local Tap",
  });
  assert.doesNotMatch(
    `${clone.title} ${clone.date} ${clone.venue}`,
    /Guitars & Growlers|September 19|Rad Dad \+ Friends/,
  );

  const blankHoursClone = currentShowIdentity({
    title: "Empty clone night",
    date: "Friday, November 6, 2026",
    venue: "",
  });
  assert.equal(blankHoursClone.title, "Empty clone night");
  assert.equal(blankHoursClone.date, "Friday, November 6, 2026");
  assert.equal(blankHoursClone.venue, "");
  assert.notEqual(blankHoursClone.venue, SHOW_DETAILS.venue);
  assert.notEqual(blankHoursClone.date, SHOW_DETAILS.date);
  assert.notEqual(blankHoursClone.title, SHOW_DETAILS.title);

  assert.deepEqual(currentShowIdentity({}), {
    title: "",
    date: "",
    venue: "",
  });
  assert.deepEqual(currentShowIdentity(null), {
    title: "",
    date: "",
    venue: "",
  });
  assert.deepEqual(
    currentShowIdentity({ title: "  Clone night  ", date: " Friday ", venue: " Hall " }),
    { title: "Clone night", date: "Friday", venue: "Hall" },
  );
});

function cssMediaQueryBlock(css, query) {
  const start = css.indexOf(query);
  assert.ok(start >= 0, `missing ${query}`);
  const brace = css.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(brace + 1, i);
    }
  }
  throw new Error(`unclosed ${query}`);
}

function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  const brace = css.indexOf("{", start);
  const end = css.indexOf("}", brace);
  assert.ok(end > brace, `unclosed ${selector}`);
  return css.slice(brace + 1, end);
}

test("phone first open shows this show's identity before the one primary action", async () => {
  const [page, styles, helper] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(showPageStylesUrl, "utf8"),
    readFile(nextStepUrl, "utf8"),
  ]);

  assert.match(page, /currentShowIdentity/);
  assert.match(page, /styles\.eventIdentity/);
  assert.match(page, /data-event-identity="current-show"/);
  assert.match(page, /eventIdentity\.title/);
  assert.match(page, /eventIdentity\.date/);
  assert.match(page, /eventIdentity\.venue/);
  assert.match(helper, /export function currentShowIdentity/);
  assert.doesNotMatch(helper, /SHOW_DETAILS/);

  const identityAt = page.indexOf("styles.eventIdentity");
  const actionAt = page.indexOf("styles.nextActions");
  const restAt = page.indexOf("styles.heroRest");
  assert.ok(identityAt >= 0 && actionAt >= 0 && restAt >= 0);
  assert.ok(
    identityAt < actionAt,
    "current-show identity must precede the primary action in source",
  );
  assert.ok(actionAt < restAt, "the primary action stays before the later hero facts");

  const identityBlock = page.slice(identityAt, actionAt);
  assert.match(identityBlock, /\{eventIdentity\.title\}/);
  assert.match(identityBlock, /\{eventIdentity\.date\}/);
  assert.match(identityBlock, /\{eventIdentity\.venue\}/);
  assert.doesNotMatch(identityBlock, /Guitars & Growlers|September 19/);
  assert.doesNotMatch(identityBlock, /<h1|<h2/);
  assert.doesNotMatch(identityBlock, /Owner: edit set|show-control/);
  assert.doesNotMatch(identityBlock, /ShowFlyer|heroPosterWrap/);
  assert.match(page, /data-next-action-count="1"/);

  const beforePhone = styles.slice(0, styles.indexOf("@media (max-width: 720px)"));
  assert.match(beforePhone, /\.eventIdentity \{\s*display: none;/);

  const phone = cssMediaQueryBlock(styles, "@media (max-width: 720px)");
  const phoneIdentity = cssRule(phone, ".eventIdentity");
  const phoneIdentityText = cssRule(phone, ".eventIdentity strong,\n  .eventIdentity span");
  const phoneIdentityTitle = cssRule(phone, ".eventIdentity strong");
  assert.match(phoneIdentity, /order: 2;/);
  assert.match(phoneIdentity, /display: grid;/);
  assert.match(phoneIdentity, /overflow-wrap: anywhere;/);
  assert.match(phoneIdentity, /min-width: 0;/);
  assert.match(phoneIdentity, /max-width: 100%;/);
  assert.match(phoneIdentityText, /overflow-wrap: anywhere;/);
  assert.match(phoneIdentityText, /white-space: normal;/);
  assert.match(phoneIdentityTitle, /font-size: 1\.12rem;/);
  assert.doesNotMatch(phoneIdentityTitle, /clamp\(/);
  assert.doesNotMatch(phoneIdentity, /white-space:\s*nowrap/);
  assert.doesNotMatch(phoneIdentity, /overflow:\s*hidden/);
  assert.doesNotMatch(phoneIdentityText, /white-space:\s*nowrap/);
  assert.match(phone, /\.firstOpenLead \{ order: 1;/);
  assert.match(phone, /\.nextActions \{ order: 3;/);
  assert.match(phone, /\.heroPosterWrap \{ order: 4;/);
  assert.match(phone, /\.heroRest \{ order: 5;/);

  const desktop = cssMediaQueryBlock(styles, "@media (max-width: 960px)");
  assert.doesNotMatch(desktop, /\.eventIdentity \{[\s\S]*?display: grid;/);
  assert.doesNotMatch(desktop, /\.eventIdentity \{[\s\S]*?order:/);
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
  assert.match(page, /styles\.eventIdentity/);
  assert.match(page, /styles\.heroRest/);
  assert.match(styles, /\.nextActions \{ order: 3;/);
  assert.match(styles, /\.heroPosterWrap \{ order: 4;/);
  assert.match(styles, /\.heroRest \{ order: 5;/);
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
  assert.equal(notes.some((n) => /Cue her before song 3\./.test(n)), true);
  assert.equal(notes.some((n) => /Slot 2 is TBD/.test(n)), true);
  assert.equal(notes.some((n) => /Jeff picks the second acoustic/.test(n)), true);
  assert.equal(notes.includes("Share the backline where practical."), true);
  assert.equal(notes.includes("Confirm guest keys and endings before show day."), true);
});

function productionNotesForSongs(songs) {
  return publicProductionNotes({
    canonicalShow: false,
    expectedWrap: "",
    openingFlow: openingSetStageCues(songs),
  });
}

function openingSongs(notes) {
  return notes.map((performanceNote, index) => ({
    setSlug: "jeff-story-friends",
    position: index + 1,
    title: `Fixture song ${index + 1}`,
    performanceNote,
  }));
}

test("production notes do not invent Candace for solo-to-guest cues", () => {
  const songs = openingSongs(["Jeff solo", "Guest guitar", "Guest vocals"]);
  assert.equal(openingSetStageCues(songs).hasStageCues, true);
  assert.doesNotMatch(productionNotesForSongs(songs).join(" "), /Candace|duet|Cue her/);
});

test("production notes cue a later duet before its current song position", () => {
  const songs = openingSongs(["Jeff solo", "Jeff solo", "Jeff solo", "Candace duet"]);
  const notes = productionNotesForSongs(songs);
  assert.deepEqual(notes.filter((note) => /Candace/.test(note)), [
    "Candace joins Jeff. Cue her before song 4.",
  ]);
});

test("production notes follow reordered opening cues without changing songs or owner order", () => {
  const officialBefore = structuredClone(DEFAULT_SONGS);
  const opening = DEFAULT_SONGS.filter((song) => song.setSlug === "jeff-story-friends");
  // Move the guest songs before the duets, as an owner can do in Show Control.
  const reordered = [opening[0], opening[1], opening[4], opening[5], opening[2], opening[3]]
    .map((song, index) => ({ ...song, position: index + 1 }));
  const before = structuredClone(reordered);
  const notes = productionNotesForSongs(reordered);
  assert.deepEqual(notes.filter((note) => /Candace/.test(note)), [
    "Candace joins Jeff. Cue her before song 5.",
  ]);
  assert.doesNotMatch(notes.join(" "), /after the solo acoustic songs/);
  assert.deepEqual(reordered, before);
  assert.deepEqual(DEFAULT_SONGS, officialBefore);
});

test("production notes follow every duet entry and actual destination positions", () => {
  const songs = openingSongs(["Jeff solo", "Candace duet", "Guest guitar", "Candace duet"])
    .map((song, index) => ({ ...song, position: [1, 3, 5, 8][index] }))
    .reverse();
  const before = structuredClone(songs);
  assert.deepEqual(productionNotesForSongs(songs).filter((note) => /Candace/.test(note)), [
    "Candace joins Jeff. Cue her before song 3.",
    "Candace joins Jeff. Cue her before song 8.",
  ]);
  assert.deepEqual(songs, before);
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
