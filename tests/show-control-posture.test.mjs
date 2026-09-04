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
  for (const document of [readme, guide, technical]) {
    assert.match(document, /one\s+next\s+step/i);
    assert.match(document, /Travis\s+owns\s+booking/i);
  }
});
