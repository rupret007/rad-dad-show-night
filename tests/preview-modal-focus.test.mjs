import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const guideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);

test("video preview moves keyboard focus into the dialog and restores it", async () => {
  const [control, styles, readme, guide] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(guideUrl, "utf8"),
  ]);

  assert.match(control, /previewCloseRef/);
  assert.match(control, /previewReturnFocusRef/);
  assert.match(control, /previewCloseRef\.current\?\.focus\(\)/);
  assert.match(control, /previewReturnFocusRef\.current\?\.focus\(\)/);
  assert.match(control, /document\.activeElement/);
  assert.match(control, /event\.key === "Escape"/);
  assert.match(control, /event\.key !== "Tab"/);
  assert.match(control, /closest\("\[role='dialog'\]"\)/);
  assert.match(control, /aria-labelledby="preview-title"/);
  assert.match(control, /ref=\{previewCloseRef\}/);
  assert.match(styles, /\.previewTop button:focus-visible/);
  assert.match(styles, /\.previewTop button \{[^}]*min-height: 44px/);
  assert.match(readme, /Moves keyboard focus into a video preview/);
  assert.match(guide, /moves keyboard focus to Close/);
});
