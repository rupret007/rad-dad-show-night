import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("public and practice tap targets stay at least 44px", async () => {
  const [styles, readme] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(
    styles,
    /\.leftoverPublicLinks \.secondaryAction \{ min-height: 44px;/,
  );
  assert.match(styles, /\.practiceControls button \{ min-height: 44px;/);
  assert.match(styles, /\.resourceButton, \.resourceLink \{ min-height: 44px;/);
  assert.match(
    styles,
    /\.practiceLivePanel \.resourceLink \{ min-height: 44px;/,
  );
  assert.doesNotMatch(
    styles,
    /\.resourceButton, \.resourceLink \{ min-height: 3[14]px/,
  );
  assert.doesNotMatch(
    styles,
    /\.leftoverPublicLinks \.secondaryAction \{ min-height: 38px/,
  );
  assert.match(readme, /44px tap target/i);
});
