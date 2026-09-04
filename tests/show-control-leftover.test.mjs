import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildLeftoverOwnerActions,
  buildShowControlPosture,
} from "../lib/show-control-posture.ts";
import { NEVER_AUTO_POST, TRAVIS_BOOKS } from "../lib/surface-roles.ts";

const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const notFoundUrl = new URL("../app/not-found.tsx", import.meta.url);
const leftoverHostedUrl = new URL("../scripts/hosted-leftover-honesty.mjs", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);

const inheritedNight = /Heart-Shaped Box|Basket Case|7:00-7:35|Chick Magnet|First Date|The Way I Love You/;
const inventedOutreach = /pitch|auto-post|send outreach|book a venue|book the/i;

const sets = [
  {
    slug: "jeff-story-friends",
    title: "Jeff Story & Friends",
    time: "7:00-7:35 PM",
    songCount: 7,
  },
  {
    slug: "stalemate",
    title: "Stalemate",
    time: "8:35-8:55 PM",
    songCount: 6,
  },
  {
    slug: "rad-dad",
    title: "Rad Dad",
    time: "9:00-10:00 PM",
    songCount: 19,
  },
];

function leftoverKinds(posture) {
  return posture.leftoverActions.map((action) => [
    action.kind,
    action.setSlug ?? action.label,
  ]);
}

test("holds stay in force for leftover owner work", () => {
  assert.equal(TRAVIS_BOOKS, true);
  assert.equal(NEVER_AUTO_POST, true);
});

test("leftover empty clones stay empty and never inherit another night", () => {
  const emptySets = sets.map((set) => ({ ...set, time: "", songCount: 0 }));
  const posture = buildShowControlPosture({
    status: "draft",
    sets: emptySets,
    dirtySetSlugs: [],
  });

  assert.equal(posture.nextAction.kind, "add-song");
  assert.equal(posture.nextAction.setSlug, "jeff-story-friends");
  assert.deepEqual(leftoverKinds(posture), [
    ["add-song", "stalemate"],
    ["add-song", "rad-dad"],
    ["see-share-link", "See closed public link"],
  ]);
  assert.match(posture.leftoverActions[0].detail, /no verified songs/);
  assert.match(posture.leftoverActions[0].detail, /instead of borrowing another night/);
  assert.doesNotMatch(posture.leftoverActions[0].detail, /window/);
  assert.match(posture.leftoverActions[2].detail, /stays closed until you publish/);
  assert.match(posture.leftoverActions[2].detail, /Another night's set will not open/);

  for (const leftover of posture.leftoverActions) {
    assert.doesNotMatch(JSON.stringify(leftover), inheritedNight);
    assert.doesNotMatch(leftover.label, inventedOutreach);
    assert.doesNotMatch(leftover.title, inventedOutreach);
    assert.doesNotMatch(leftover.detail, inventedOutreach);
    assert.notEqual(leftover.kind, "publish-show");
  }
});

test("leftover unsaved sets stay private until saved and do not invent a write path", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: ["rad-dad", "stalemate"],
  });

  assert.equal(posture.nextAction.kind, "save-set");
  assert.equal(posture.nextAction.setSlug, "stalemate");
  assert.ok(!posture.leftoverActions.some((action) => action.setSlug === "stalemate"));
  assert.deepEqual(leftoverKinds(posture), [
    ["save-set", "rad-dad"],
    ["see-share-link", "See last saved public list"],
  ]);
  assert.match(posture.leftoverActions[0].detail, /still private in this browser/);
  assert.match(posture.leftoverActions[1].detail, /last saved list/);
  assert.equal(
    posture.leftoverActions.every((action) =>
      ["save-set", "add-song", "see-share-link"].includes(action.kind),
    ),
    true,
  );
});

test("published leftover empty nights stay empty on their own public link", () => {
  const emptySets = sets.map((set) => ({ ...set, time: "", songCount: 0 }));
  const posture = buildShowControlPosture({
    status: "published",
    sets: emptySets,
    dirtySetSlugs: [],
  });

  assert.equal(posture.nextAction.kind, "add-song");
  assert.deepEqual(leftoverKinds(posture), [
    ["add-song", "stalemate"],
    ["add-song", "rad-dad"],
    ["see-share-link", "See live empty public list"],
  ]);
  assert.match(posture.leftoverActions[2].detail, /empty night/);
  assert.match(posture.leftoverActions[2].detail, /will not open there/);
  for (const leftover of posture.leftoverActions) {
    assert.doesNotMatch(JSON.stringify(leftover), inheritedNight);
  }
});

test("leftover empty sets remain after a saved leftover song and never block isolation", () => {
  const mixed = [
    { ...sets[0], songCount: 1 },
    { ...sets[1], time: "", songCount: 0 },
    { ...sets[2], time: "", songCount: 0 },
  ];
  const posture = buildShowControlPosture({
    status: "draft",
    sets: mixed,
    dirtySetSlugs: [],
  });

  assert.equal(posture.nextAction.kind, "publish-show");
  assert.deepEqual(leftoverKinds(posture), [
    ["add-song", "stalemate"],
    ["add-song", "rad-dad"],
    ["see-share-link", "See closed public link"],
  ]);
  assert.doesNotMatch(posture.leftoverActions[0].detail, inheritedNight);
  assert.doesNotMatch(posture.leftoverActions[1].detail, /7:00-7:35|9:00-10:00/);
});

test("a leftover dirty empty set is a leftover save, not a borrowed add", () => {
  const mixed = [
    { ...sets[0], songCount: 2 },
    { ...sets[1], time: "", songCount: 0 },
    { ...sets[2], songCount: 4 },
  ];
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: ["stalemate"],
  });

  assert.equal(posture.nextAction.kind, "save-set");
  assert.equal(posture.nextAction.setSlug, "stalemate");
  assert.deepEqual(leftoverKinds(posture), [
    ["see-share-link", "See last saved public list"],
  ]);
});

test("unverified leftover work fails closed with no leftover actions", () => {
  const leftover = buildLeftoverOwnerActions({
    status: "draft",
    sets: [],
    dirtySetSlugs: ["rad-dad"],
    nextAction: {
      kind: "none",
      title: "Verify this show's set plan.",
      detail: "No verified set definitions loaded, so Show Control will not guess a next action.",
      label: "No safe action",
    },
    totalSongs: 0,
  });
  assert.deepEqual(leftover, []);
});

test("Show Control makes leftover work clickable on phones and keeps leftover copy owner-only", async () => {
  const [control, styles, page, notFound, leftoverHosted, showData] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(notFoundUrl, "utf8"),
    readFile(leftoverHostedUrl, "utf8"),
    readFile(showDataUrl, "utf8"),
  ]);

  assert.match(control, /buildShowControlPosture/);
  assert.match(control, /leftoverActions/);
  assert.match(control, /Leftover on this show/);
  assert.match(control, /data-leftover-list="true"/);
  assert.match(control, /data-leftover-kind=\{action\.kind\}/);
  assert.match(control, /function runControlAction/);
  assert.match(control, /Saving leftover\.\.\./);
  assert.match(control, /data-leftover=\{/);
  assert.match(control, /songs or times will not be borrowed/);
  assert.match(control, /action\.kind === "see-share-link"/);
  assert.doesNotMatch(control, /action:\s*"pitch"|action:\s*"post"|action:\s*"send"/);
  assert.match(styles, /\.leftoverControl[^}]*min-height: 48px/);
  assert.match(styles, /\.leftoverList/);
  assert.match(styles, /data-leftover="unsaved"/);
  assert.match(styles, /data-leftover="empty"/);

  assert.doesNotMatch(page, /Leftover on this show/);
  assert.doesNotMatch(page, /Save leftover/);
  assert.doesNotMatch(page, /Start leftover/);
  assert.doesNotMatch(notFound, /Leftover on this show/);
  assert.doesNotMatch(notFound, /Save leftover/);
  assert.match(leftoverHosted, /owner leftover work/);
  assert.match(leftoverHosted, /Save leftover/);

  assert.match(showData, /Heart-Shaped Box/);
  assert.match(showData, /First Date/);
  assert.match(showData, /The Way I Love You/);
});
