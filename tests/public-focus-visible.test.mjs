import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("public show controls expose a visible keyboard focus ring", async () => {
  const [styles, page, liveList, readme] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(liveListUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  for (const selector of [
    ".identity:focus-visible",
    ".topLinks a:focus-visible",
    ".primaryAction:focus-visible",
    ".secondaryAction:focus-visible",
    ".footerSurfaces a:focus-visible",
    ".footerControl:focus-visible",
    ".unavailableActions a:focus-visible",
    ".resourceButton:focus-visible",
    ".resourceLink:focus-visible",
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(styles, /outline: 3px solid var\(--blue\)/);
  assert.match(styles, /outline-offset: 3px/);

  assert.match(page, /styles\.identity/);
  assert.match(page, /styles\.primaryAction/);
  assert.match(page, /styles\.footerControl/);
  assert.match(liveList, /styles\.secondaryAction/);
  assert.match(liveList, /styles\.resourceLink/);
  assert.match(readme, /focus ring/i);
});
