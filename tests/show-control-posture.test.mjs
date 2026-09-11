import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildShowControlPosture } from "../lib/show-control-posture.ts";

const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const guideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);
const technicalUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);

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

test("a clean published show leads with the verified band run", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: [],
  });

  assert.equal(posture.publicLink.value, "Open · saved list");
  assert.match(posture.publicLink.detail, /matches every saved set/);
  assert.equal(posture.setPlan.value, "32 songs · 3 active sets");
  assert.match(posture.setPlan.detail, /3 set windows are scheduled/);
  assert.equal(posture.booking.value, "Travis owns booking");
  assert.match(posture.booking.detail, /never pitches, posts, or sends/);
  assert.deepEqual(posture.nextAction, {
    kind: "run-show",
    title: "Run the verified show list.",
    detail: "32 saved songs are public. Open the phone-friendly band run mode.",
    label: "Open band run mode",
  });
  assert.deepEqual(posture.leftoverActions, []);
});

for (const status of ["published", "draft", "archived"]) {
  test(`a pending ${status} save waits without claiming a verified list or offering another write`, () => {
    const posture = buildShowControlPosture({
      status,
      sets: sets.map((set) => ({ ...set, songCount: 0 })),
      dirtySetSlugs: ["rad-dad", "stalemate"],
      heldSetSlugs: ["stalemate"],
      savePending: true,
    });
    assert.equal(posture.nextAction.kind, "wait-save");
    assert.equal(posture.setPlan.label, "Browser set plan");
    assert.match(posture.setPlan.detail, /saved result is not yet verified/);
    assert.deepEqual(posture.leftoverActions.map((action) => action.kind), ["see-share-link"]);
    if (status === "published") {
      assert.equal(posture.publicLink.value, "Open · save pending");
      assert.match(posture.publicLink.detail, /may already have changed/);
      assert.equal(posture.leftoverActions[0].label, "See public list · save pending");
      assert.doesNotMatch(JSON.stringify(posture), /still private|live empty public list|Open band run mode/);
    } else {
      assert.match(posture.publicLink.value, /^Closed/);
      assert.equal(posture.leftoverActions[0].label, "See closed public link");
    }
    const after = buildShowControlPosture({ status, sets, dirtySetSlugs: ["rad-dad"], heldSetSlugs: ["stalemate"] });
    assert.equal(after.nextAction.kind, "check-saved-set");
    assert(after.leftoverActions.some((action) => action.kind === "save-set" && action.setSlug === "rad-dad"));
  });
}

test("the set plan glance states this night's own hours", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: [],
    nightHours: "7:00-10:00 PM",
  });

  assert.match(posture.setPlan.detail, /^This night runs 7:00-10:00 PM\./);
  assert.match(posture.setPlan.detail, /3 set windows are scheduled/);
});

test("an empty clone glance says night hours are not borrowed", () => {
  const emptySets = sets.map((set) => ({ ...set, time: "", songCount: 0 }));
  const posture = buildShowControlPosture({
    status: "draft",
    sets: emptySets,
    dirtySetSlugs: [],
    nightHours: "   ",
  });

  assert.match(posture.setPlan.detail, /^Hours not set for this night;/);
  assert.match(posture.setPlan.detail, /start or wrap will not appear here/);
  assert.match(posture.setPlan.detail, /No songs or set times will be borrowed/);
});

test("the set plan glance flags a populated set with no stage time", () => {
  const mixed = [
    { ...sets[0], time: "" },
    { ...sets[1] },
    { ...sets[2] },
  ];
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: [],
    nightHours: "7:00-10:00 PM",
  });

  assert.match(posture.setPlan.detail, /2 set windows are scheduled for this show\./);
  assert.match(
    posture.setPlan.detail,
    /1 active set still has songs but no stage time on this night\.$/,
  );
});

test("the set plan glance counts every unslotted populated set", () => {
  const mixed = sets.map((set) => ({ ...set, time: "" }));
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: [],
  });

  assert.match(
    posture.setPlan.detail,
    /3 active sets still have songs but no stage time on this night\.$/,
  );
});

test("the set plan glance stays quiet when every populated set is slotted", () => {
  const withEmptyTimed = [
    { ...sets[0] },
    { ...sets[1], time: "", songCount: 0 },
    { ...sets[2] },
  ];
  const posture = buildShowControlPosture({
    status: "published",
    sets: withEmptyTimed,
    dirtySetSlugs: [],
  });

  assert.doesNotMatch(posture.setPlan.detail, /no stage time/);
});

test("the set plan glance flags a scheduled set window with no songs", () => {
  const mixed = [
    { ...sets[0], songCount: 0 },
    { ...sets[1] },
    { ...sets[2] },
  ];
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: [],
    nightHours: "7:00-10:00 PM",
  });

  assert.match(posture.setPlan.detail, /3 set windows are scheduled for this show\./);
  assert.match(
    posture.setPlan.detail,
    /1 scheduled set still has stage time but no songs on this night\.$/,
  );
});

test("the set plan glance counts every empty scheduled set window", () => {
  const mixed = sets.map((set) => ({ ...set, songCount: 0 }));
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: [],
  });

  assert.match(
    posture.setPlan.detail,
    /3 scheduled sets still have stage time but no songs on this night\.$/,
  );
});

test("the set plan glance reports both stage-time gaps together", () => {
  const mixed = [
    { ...sets[0], time: "" },
    { ...sets[1], songCount: 0 },
    { ...sets[2] },
  ];
  const posture = buildShowControlPosture({
    status: "published",
    sets: mixed,
    dirtySetSlugs: [],
    nightHours: "7:00-10:00 PM",
  });

  assert.match(
    posture.setPlan.detail,
    /1 scheduled set still has stage time but no songs on this night\./,
  );
  assert.match(
    posture.setPlan.detail,
    /1 active set still has songs but no stage time on this night\.$/,
  );
});

test("the set plan glance stays quiet on empty windows when every scheduled set has songs", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: [],
  });

  assert.doesNotMatch(posture.setPlan.detail, /stage time but no songs/);
});

test("the first unsaved set wins before publish or run actions", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: ["rad-dad", "stalemate"],
  });

  assert.equal(posture.publicLink.value, "Open · last saved list");
  assert.match(posture.publicLink.detail, /2 changed sets are still private/);
  assert.equal(posture.nextAction.kind, "save-set");
  assert.equal(posture.nextAction.setSlug, "stalemate");
  assert.equal(posture.nextAction.label, "Save Stalemate");
  assert.match(posture.nextAction.detail, /before changing the show lifecycle/);
  assert.deepEqual(
    posture.leftoverActions.map((action) => [action.kind, action.setSlug ?? action.label]),
    [
      ["save-set", "rad-dad"],
      ["see-share-link", "See last saved public list"],
    ],
  );
});

test("an empty clone starts here and never borrows another night's list", () => {
  const emptySets = sets.map((set) => ({ ...set, time: "", songCount: 0 }));
  const posture = buildShowControlPosture({
    status: "draft",
    sets: emptySets,
    dirtySetSlugs: [],
  });

  assert.equal(posture.publicLink.value, "Closed · private draft");
  assert.equal(posture.setPlan.value, "No verified songs");
  assert.match(posture.setPlan.detail, /No songs or set times will be borrowed/);
  assert.equal(posture.nextAction.kind, "add-song");
  assert.equal(posture.nextAction.setSlug, "jeff-story-friends");
  assert.match(posture.nextAction.detail, /instead of borrowing another night's list/);
  assert.deepEqual(
    posture.leftoverActions.map((action) => [action.kind, action.setSlug ?? action.label]),
    [
      ["add-song", "stalemate"],
      ["add-song", "rad-dad"],
      ["see-share-link", "See closed public link"],
    ],
  );
});

test("a saved private show offers publish while missing set definitions fail closed", () => {
  for (const status of ["draft", "archived"]) {
    const posture = buildShowControlPosture({ status, sets, dirtySetSlugs: [] });
    assert.equal(posture.nextAction.kind, "publish-show");
    assert.equal(posture.nextAction.label, "Publish saved show");
    assert.match(posture.nextAction.detail, /still private/);
  }

  const unknown = buildShowControlPosture({
    status: "published",
    sets: [],
    dirtySetSlugs: [],
  });
  assert.equal(unknown.nextAction.kind, "none");
  assert.equal(unknown.nextAction.label, "No safe action");
  assert.match(unknown.nextAction.detail, /will not guess/);
  assert.deepEqual(unknown.leftoverActions, []);
});

test("an uncertain save becomes the one next check before another write", () => {
  const posture = buildShowControlPosture({
    status: "published",
    sets,
    dirtySetSlugs: ["rad-dad"],
    heldSetSlugs: ["rad-dad"],
  });
  assert.equal(posture.nextAction.kind, "check-saved-set");
  assert.equal(posture.nextAction.setSlug, "rad-dad");
  assert.equal(posture.nextAction.label, "Check saved Rad Dad");
  assert.match(posture.nextAction.detail, /verified official list/);
});

test("held public saves never claim browser edits are private or the lists match", () => {
  for (const dirtySetSlugs of [[], ["rad-dad", "stalemate"]]) {
    const posture = buildShowControlPosture({
      status: "published", sets, dirtySetSlugs, heldSetSlugs: ["rad-dad"],
    });
    assert.equal(posture.publicLink.value, "Open · check saved list");
    assert.match(posture.publicLink.detail, /1 set needs a saved-list check/);
    assert.match(posture.publicLink.detail, /may already have changed/);
    assert.doesNotMatch(posture.publicLink.detail, /still private|matches every saved/);
    assert.equal(posture.setPlan.label, "Browser set plan");
    assert.match(posture.setPlan.detail, /Check saved sets before treating these counts as official/);
    assert.equal(posture.nextAction.kind, "check-saved-set");
    const share = posture.leftoverActions.find((action) => action.kind === "see-share-link");
    assert.equal(share.label, "See public list · check pending");
    assert.doesNotMatch(share.detail, /still private|empty night/);
  }
});

test("multiple held saves are counted once and private lifecycle links stay closed", () => {
  const input = { sets, dirtySetSlugs: [], heldSetSlugs: ["rad-dad", "stalemate", "rad-dad"] };
  const published = buildShowControlPosture({ ...input, status: "published" });
  assert.match(published.publicLink.detail, /2 sets need a saved-list check/);
  for (const status of ["draft", "archived"]) {
    const posture = buildShowControlPosture({ ...input, status });
    assert.match(posture.publicLink.value, /^Closed/);
    assert.equal(posture.setPlan.label, "Browser set plan");
    assert.equal(posture.leftoverActions.at(-1).label, "See closed public link");
  }
});

test("deleting the last browser song cannot claim the public night is empty", () => {
  const emptySets = sets.map((set) => ({ ...set, songCount: 0 }));
  for (const heldSetSlugs of [[], ["rad-dad"]]) {
    const posture = buildShowControlPosture({
      status: "published", sets: emptySets, dirtySetSlugs: ["rad-dad"], heldSetSlugs,
    });
    assert.equal(posture.setPlan.label, "Browser set plan");
    assert.equal(posture.setPlan.value, "No songs in this browser");
    const share = posture.leftoverActions.find((action) => action.kind === "see-share-link");
    assert.doesNotMatch(share.label + share.detail, /empty/);
    if (!heldSetSlugs.length) assert.match(posture.setPlan.detail, /Counts include unsaved browser edits/);
  }
});

test("a held empty set offers a check instead of a contradictory start action", () => {
  const posture = buildShowControlPosture({
    status: "published", sets: sets.map((set) => ({ ...set, songCount: 0 })),
    dirtySetSlugs: [], heldSetSlugs: ["rad-dad", "stalemate"],
  });
  assert.equal(posture.nextAction.kind, "check-saved-set");
  assert.deepEqual(posture.leftoverActions.filter((action) => action.kind === "add-song").map((action) => action.setSlug), ["jeff-story-friends"]);
});

test("resolved drafts return to official counts and the existing clean-show action", () => {
  for (const status of ["draft", "published"]) {
    const posture = buildShowControlPosture({ status, sets, dirtySetSlugs: [] });
    assert.equal(posture.setPlan.label, "Official set plan");
    assert.equal(posture.setPlan.value, "32 songs · 3 active sets");
    assert.doesNotMatch(posture.setPlan.detail, /browser|Check saved/);
    assert.equal(posture.nextAction.kind, status === "published" ? "run-show" : "publish-show");
  }
});

test("Show Control renders the posture and its one real action on phones", async () => {
  const [control, styles, readme, guide, technical] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(guideUrl, "utf8"),
    readFile(technicalUrl, "utf8"),
  ]);

  assert.match(control, /buildShowControlPosture/);
  const verifiedGuard = control.indexOf("if (!showVerified)");
  const postureBuild = control.indexOf("const controlPosture = buildShowControlPosture");
  assert.ok(verifiedGuard >= 0 && verifiedGuard < postureBuild);
  assert.match(control.slice(verifiedGuard, postureBuild), /No Add, Save, Publish, or Archive action/);
  assert.match(control, /data-show-control="unverified"/);
  assert.match(control, /data-next-action=\{controlPosture\.nextAction\.kind\}/);
  assert.match(control, /nightHours: activeShow\.hours \?\? ""/);
  assert.match(control, /Show status at a glance/);
  assert.match(control, /One next step/);
  assert.match(
    control,
    /\[controlPosture\.publicLink, controlPosture\.setPlan, controlPosture\.booking\]\.map/,
  );
  assert.match(control, /async function saveSet\(setSlug: SetSlug\)/);
  assert.match(
    control,
    /controlPosture\.nextAction\.kind === "publish-show" && Boolean\(publishBlock\)/,
  );
  assert.match(control, /Open band run mode/);
  assert.match(control, /id="new-song-title"/);
  assert.match(styles, /\.postureDeck/);
  assert.match(styles, /\.nextActionCard/);
  assert.match(styles, /\.nextActionControl[^}]*min-height: 48px/);
  assert.match(styles, /\.nextActionCard \{ order: -1; \}/);
  const statsIndex = control.indexOf("controlStats");
  const postureIndex = control.indexOf("const controlPosture = buildShowControlPosture");
  assert.ok(statsIndex >= 0 && postureIndex >= 0 && postureIndex < statsIndex);
  assert.match(
    control,
    /data-songs-source=\{controlPosture\.setPlan\.label === "Official set plan" \? "official" : "browser"\}/,
  );
  assert.match(control, /Browser total songs/);
  for (const document of [readme, guide, technical]) {
    assert.match(document, /one\s+next\s+step/i);
    assert.match(document, /Travis\s+owns\s+booking/i);
  }
});
