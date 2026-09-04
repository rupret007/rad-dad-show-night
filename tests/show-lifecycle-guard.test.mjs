import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  savedSetNotice,
  savedSetStateLabel,
  savingSetNotice,
  showLifecycleHint,
  showPublicShareLinkLabel,
  showPublicShareLinkOpen,
  showStatusChangeBlockReason,
  showStatusChangeConfirmation,
} from "../lib/show-lifecycle.ts";

const routeUrl = new URL("../app/api/shows/route.ts", import.meta.url);
const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const guideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);
const technicalUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);

test("the only default public show cannot be archived", () => {
  const archived = showStatusChangeBlockReason({
    currentStatus: "published",
    targetStatus: "archived",
    isDefault: true,
  });
  assert.match(archived, /default public show cannot be archived/i);
  assert.match(archived, /main show link would stop working/i);

  assert.equal(
    showStatusChangeBlockReason({
      currentStatus: "draft",
      targetStatus: "published",
      isDefault: true,
    }),
    null,
  );
  assert.equal(
    showStatusChangeBlockReason({
      currentStatus: "published",
      targetStatus: "archived",
      isDefault: false,
    }),
    null,
  );
});

test("unsaved sets block every show status change before a network write", () => {
  for (const targetStatus of ["published", "archived"]) {
    const blocked = showStatusChangeBlockReason({
      currentStatus: targetStatus === "published" ? "draft" : "published",
      targetStatus,
      isDefault: false,
      dirtySetCount: 2,
    });
    assert.match(blocked, /Save or discard 2 changed sets/);
  }
  assert.match(
    showStatusChangeBlockReason({
      currentStatus: "published",
      targetStatus: "archived",
      isDefault: false,
      dirtySetCount: 1,
    }),
    /1 changed set before/,
  );
});

test("lifecycle confirmations state the public consequence", () => {
  assert.match(
    showStatusChangeConfirmation("October show", "published"),
    /saved show details and set lists will become available/i,
  );
  assert.match(
    showStatusChangeConfirmation("October show", "archived"),
    /public share link will stop working/i,
  );
});

test("Save copy does not claim a private draft is public", () => {
  assert.equal(savingSetNotice("Rad Dad"), "Saving Rad Dad...");
  assert.doesNotMatch(savingSetNotice("Rad Dad"), /publish/i);
  assert.match(savedSetNotice("Rad Dad", "published"), /live on the public show page/);
  assert.match(savedSetNotice("Rad Dad", "draft"), /private draft/);
  assert.match(savedSetNotice("Rad Dad", "draft"), /Publish the show to open/);
  assert.doesNotMatch(savedSetNotice("Rad Dad", "draft"), /live on the public/);
  assert.match(savedSetNotice("Rad Dad", "archived"), /stays closed until you publish/);
  assert.equal(savedSetStateLabel("published", false), "Matches public page");
  assert.equal(savedSetStateLabel("draft", false), "Saved private draft");
  assert.equal(savedSetStateLabel("archived", false), "Saved, public link closed");
  assert.equal(savedSetStateLabel("published", true), "Draft changes");
});

test("share-link labels tell testers whether the public link is open", () => {
  assert.equal(showPublicShareLinkOpen("published"), true);
  assert.equal(showPublicShareLinkOpen("draft"), false);
  assert.equal(showPublicShareLinkOpen("archived"), false);
  assert.equal(showPublicShareLinkLabel("published", "actions"), "Open public share link");
  assert.equal(showPublicShareLinkLabel("published", "header"), "Open public show");
  assert.match(showPublicShareLinkLabel("draft", "actions"), /closed/);
  assert.match(showPublicShareLinkLabel("archived", "header"), /closed/);
});

test("lifecycle hint names the default-show and dirty-set fences", () => {
  assert.match(
    showLifecycleHint({
      currentStatus: "published",
      isDefault: true,
      dirtySetCount: 0,
    }),
    /default public show cannot be archived/i,
  );
  assert.match(
    showLifecycleHint({
      currentStatus: "draft",
      isDefault: false,
      dirtySetCount: 1,
    }),
    /1 changed set before/,
  );
  assert.match(
    showLifecycleHint({
      currentStatus: "draft",
      isDefault: false,
    }),
    /draft is owner-only/i,
  );
});

test("the API repeats the default-show guard before its update", async () => {
  const route = await readFile(routeUrl, "utf8");
  const selectAt = route.indexOf("SELECT slug, status, is_default");
  const guardAt = route.indexOf("showStatusChangeBlockReason", selectAt);
  const updateAt = route.indexOf("UPDATE shows SET status", guardAt);

  assert.ok(selectAt >= 0);
  assert.ok(guardAt > selectAt);
  assert.ok(updateAt > guardAt);
  assert.match(route.slice(guardAt, updateAt), /status: 409/);
  assert.match(route, /isDefault: existing\.is_default === 1/);
});

test("Show Control disables guarded actions and confirms allowed ones", async () => {
  const [control, styles] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  const changeStart = control.indexOf("async function changeShowStatus");
  const changeEnd = control.indexOf("async function runCoach", changeStart);
  const change = control.slice(changeStart, changeEnd);
  const saveStart = control.indexOf("async function saveActiveSet");
  const save = control.slice(saveStart, changeStart);

  assert.match(change, /dirtySetCount: dirtySets\.size/);
  assert.ok(change.indexOf("showStatusChangeBlockReason") < change.indexOf("fetch(\"/api/shows\""));
  assert.ok(change.indexOf("showStatusChangeConfirmation") < change.indexOf("fetch(\"/api/shows\""));
  assert.match(control, /disabled=\{Boolean\(archiveBlock\) \|\| Boolean\(statusChanging\)\}/);
  assert.match(control, /aria-describedby="show-lifecycle-hint"/);
  assert.match(control, /Publish saved show/);
  assert.match(control, /Archive show/);
  assert.match(styles, /\.showActions button:disabled/);
  assert.match(styles, /\.lifecycleHint\[data-blocked="true"\]/);
  assert.match(styles, /min-height: 44px/);

  assert.match(save, /savingSetNotice\(activeDefinition\.title\)/);
  assert.match(save, /savedSetNotice\(activeDefinition\.title, activeShow\.status\)/);
  assert.doesNotMatch(save, /Publishing \$\{activeDefinition/);
  assert.doesNotMatch(save, /is live on the public show page/);
  assert.match(control, /savedSetStateLabel\(activeShow\.status, dirtySets\.has\(activeSet\)\)/);
  assert.match(control, /showPublicShareLinkLabel\(activeShow\.status, "actions"\)/);
  assert.match(control, /data-share-open=\{shareLinkOpen \? "true" : "false"\}/);
  assert.match(control, /id="show-manager"/);
});

test("Show Control puts lifecycle and empty-clone choice on the tester path", async () => {
  const control = await readFile(controlUrl, "utf8");
  const managerAt = control.indexOf("className={styles.showManager}");
  const introAt = control.indexOf("className={styles.controlIntro}");
  const cloneAt = control.indexOf("Clone this show");
  const copyAt = control.indexOf('name="copySongs"', cloneAt);
  const createAt = control.indexOf("Create draft", cloneAt);

  assert.ok(managerAt >= 0, "missing show manager");
  assert.ok(introAt > managerAt, "show picker must sit above BUILD THE NIGHT");
  assert.ok(copyAt > cloneAt, "missing empty-clone checkbox");
  assert.ok(createAt > copyAt, "empty-clone checkbox must come before Create draft");
  assert.match(control, /does not inherit songs or set times/);
});

test("operator and technical docs name the lifecycle fence", async () => {
  const [readme, guide, technical] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(guideUrl, "utf8"),
    readFile(technicalUrl, "utf8"),
  ]);
  for (const document of [readme, guide, technical]) {
    assert.match(document, /default public show/i);
    assert.match(document, /unsaved/i);
    assert.match(document, /Publish saved show/);
  }
  assert.match(readme, /uncheck/i);
  assert.match(readme, /Saving a draft does not open/i);
  assert.match(guide, /Save \[set name\] writes/i);
  assert.match(guide, /picker at the top of Show Control/i);
});
