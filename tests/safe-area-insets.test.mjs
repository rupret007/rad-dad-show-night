import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const pageStylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const controlStylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const offlineUrl = new URL("../public/offline.html", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("viewport-fit cover is paired with safe-area padding on sticky chrome", async () => {
  const [layout, pageStyles, controlStyles, offline, readme] = await Promise.all([
    readFile(layoutUrl, "utf8"),
    readFile(pageStylesUrl, "utf8"),
    readFile(controlStylesUrl, "utf8"),
    readFile(offlineUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(layout, /viewportFit:\s*"cover"/);

  assert.match(pageStyles, /\.topBar \{[\s\S]*padding-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(pageStyles, /\.topBar \{[\s\S]*padding-left: env\(safe-area-inset-left, 0px\)/);
  assert.match(pageStyles, /\.practiceToolbar \{[^}]*top: calc\(72px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(pageStyles, /\.practiceToolbar \{[^}]*top: calc\(66px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(pageStyles, /\.footer \{[^}]*padding: 38px 0 calc\(52px \+ env\(safe-area-inset-bottom, 0px\)\)/);

  assert.match(controlStyles, /\.controlTopbar \{[^}]*env\(safe-area-inset-top, 0px\)/);
  assert.match(controlStyles, /\.saveDock \{[^}]*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(controlStyles, /\.workspace \{[^}]*calc\(128px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(controlStyles, /padding-bottom: calc\(160px \+ env\(safe-area-inset-bottom, 0px\)\)/);

  assert.match(offline, /viewport-fit=cover/);
  assert.match(offline, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(readme, /safe area/i);
});
