import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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

  assert.match(change, /dirtySetCount: dirtySets\.size/);
  assert.ok(change.indexOf("showStatusChangeBlockReason") < change.indexOf("fetch(\"/api/shows\""));
  assert.ok(change.indexOf("showStatusChangeConfirmation") < change.indexOf("fetch(\"/api/shows\""));
  assert.match(control, /disabled=\{Boolean\(archiveBlock\) \|\| Boolean\(statusChanging\)\}/);
  assert.match(control, /aria-describedby="show-lifecycle-hint"/);
  assert.match(control, /Publish saved show/);
  assert.match(control, /Archive show/);
  assert.match(styles, /\.showActions button:disabled/);
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
  }
});
