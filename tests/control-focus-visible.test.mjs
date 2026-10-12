import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const pageUrl = new URL("../app/show-control/page.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("Show Control chrome exposes a visible keyboard focus ring", async () => {
  const [styles, control, page, readme] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(controlUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  for (const selector of [
    ".controlBrand:focus-visible",
    ".ownerStrip a:focus-visible",
    ".showSelect select:focus-visible",
    ".showActions a:focus-visible",
    ".showActions button:focus-visible",
    ".nextActionControl:focus-visible",
    ".leftoverControl:focus-visible",
    ".setTabs button:focus-visible",
    ".clonePanel input:focus-visible",
    ".clonePanel button:focus-visible",
    ".saveActions button:focus-visible",
    ".loadFailureCard button:focus-visible",
    ".loadFailureCard a:focus-visible",
    ".accessActions a:focus-visible",
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(styles, /outline: 3px solid var\(--blue\)/);
  assert.match(control, /styles\.controlBrand/);
  assert.match(control, /styles\.nextActionControl/);
  assert.match(control, /styles\.leftoverControl/);
  assert.match(control, /styles\.saveActions/);
  assert.match(page, /styles\.accessActions/);
  assert.match(readme, /focus ring on Show Control/i);
});
