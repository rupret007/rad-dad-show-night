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
  assert.equal(ready.sets[0].songCount, 7);
  assert.equal(ready.sets[1].songCount, 6);
  assert.equal(ready.sets[2].songCount, 19);

  const next = firstOpenAction(ready);
  assert.equal(next.kind, "start-set");
  assert.match(next.title, /Jeff Story & Friends/);
  assert.match(next.title, /7:00-7:35 PM/);
  assert.match(next.copy, /32 verified songs/);
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
