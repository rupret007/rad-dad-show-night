import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isPublicShareOpen,
  publishedPublicShareCopy,
  showEditorLiveState,
  showOwnerDirtyNotice,
  showOwnerLifecycleHint,
  showOwnerReadyNotice,
  showOwnerSavedNotice,
  showOwnerSavingNotice,
  showShareLinkLabel,
  showStatusBadge,
  showStatusChangeBlockReason,
  showStatusChangeConfirmation,
  unpublishedPublicCopy,
} from "../lib/show-lifecycle.ts";

const routeUrl = new URL("../app/api/shows/route.ts", import.meta.url);
const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const guideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);
const technicalUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);
const notFoundUrl = new URL("../app/not-found.tsx", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const leftoverHostedUrl = new URL("../scripts/hosted-leftover-honesty.mjs", import.meta.url);

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

test("owner and public copy keep save, publish, and the share link distinct", () => {
  assert.equal(isPublicShareOpen("published"), true);
  assert.equal(isPublicShareOpen("draft"), false);
  assert.equal(isPublicShareOpen("archived"), false);
  assert.equal(showStatusBadge("published", true), "Published · public · default");
  assert.equal(showStatusBadge("draft"), "Draft · not public");
  assert.equal(showShareLinkLabel("published"), "Open public share link");
  assert.equal(showShareLinkLabel("draft"), "See closed public link");
  assert.match(showOwnerLifecycleHint({ currentStatus: "draft", isDefault: false }), /does not open the public share link/);
  assert.match(showOwnerLifecycleHint({ currentStatus: "published", isDefault: false }), /public share link is open/);
  assert.match(
    showOwnerLifecycleHint({ currentStatus: "published", isDefault: true }),
    /default public show cannot be archived/,
  );
  assert.match(
    showOwnerLifecycleHint({ currentStatus: "draft", isDefault: false, dirtySetCount: 1 }),
    /Save or discard 1 changed set/,
  );
  assert.equal(showEditorLiveState({ status: "published", setDirty: false }), "Matches public page");
  assert.equal(showEditorLiveState({ status: "draft", setDirty: false }), "Private draft — not public");
  assert.match(showOwnerDirtyNotice("draft"), /stays off the public share link until you publish/);
  assert.match(showOwnerReadyNotice("draft"), /public share link is closed/);
  assert.match(showOwnerSavingNotice("Rad Dad", "draft"), /private show/);
  assert.doesNotMatch(showOwnerSavingNotice("Rad Dad", "draft"), /Publishing/);
  assert.match(showOwnerSavedNotice("Rad Dad", "draft"), /private draft/);
  assert.doesNotMatch(showOwnerSavedNotice("Rad Dad", "draft"), /is live on the public/);
  assert.equal(publishedPublicShareCopy(true), "This public share link is live.");
  assert.match(publishedPublicShareCopy(false), /no official set yet/);
  assert.match(unpublishedPublicCopy().body, /No published show was found/);
});

test("Show Control disables guarded actions and confirms allowed ones", async () => {
  const [control, styles] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  const changeStart = control.indexOf("async function changeShowStatus");
  const changeEnd = control.indexOf("async function runCoach", changeStart);
  const change = control.slice(changeStart, changeEnd);

  assert.match(change, /dirtySetCount: dirtySets\.size/);
  assert.ok(change.indexOf("showStatusChangeBlockReason") < change.indexOf("fetch(\"/api/shows\""));
  assert.ok(change.indexOf("showStatusChangeConfirmation") < change.indexOf("fetch(\"/api/shows\""));
  assert.match(control, /disabled=\{Boolean\(archiveBlock\) \|\| Boolean\(statusChanging\)\}/);
  assert.match(control, /aria-describedby="show-lifecycle-hint"/);
  assert.match(control, /Publish saved show/);
  assert.match(control, /Archive show/);
  assert.match(control, /showShareLinkLabel\(activeShow\.status\)/);
  assert.match(control, /showOwnerSavingNotice\(activeDefinition\.title, activeShow\.status\)/);
  assert.match(control, /showOwnerSavedNotice\(activeDefinition\.title, activeShow\.status\)/);
  assert.match(control, /showEditorLiveState/);
  assert.doesNotMatch(control, /Publishing \$\{activeDefinition\.title\}/);
  assert.doesNotMatch(control, /is live on the public show page/);
  assert.match(styles, /\.showActions button:disabled/);
  assert.match(styles, /data-share-open="true"/);
  assert.match(styles, /min-height: 44px/);
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
    assert.match(document, /public share link/i);
  }
  assert.match(readme, /Phone tester path/i);
  assert.match(guide, /Saving a set does not publish the show/i);
});

test("the public page and leftover harness stay honest about closed share links", async () => {
  const [notFound, page, leftover] = await Promise.all([
    readFile(notFoundUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(leftoverHostedUrl, "utf8"),
  ]);
  assert.match(notFound, /unpublishedPublicCopy/);
  assert.match(notFound, /data-public-share="closed"/);
  assert.doesNotMatch(notFound, /Closed Draft Night|Heart-Shaped Box/);
  assert.match(page, /publishedPublicShareCopy\(nightUse\.hasVerifiedList\)/);
  assert.match(page, /data-public-share="open"/);
  assert.match(leftover, /CLOSED_SLUG/);
  assert.match(leftover, /closed draft was not leftover-honest/);
});
