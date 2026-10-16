import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("practice set jumps size to this night's verified sets", async () => {
  const [liveList, styles, readme] = await Promise.all([
    readFile(liveListUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(liveList, /practiceJumpSets/);
  assert.match(liveList, /data-set-count=\{String\(practiceJumpSets\.length\)\}/);
  assert.match(liveList, /practiceJumpSets\.map/);
  assert.doesNotMatch(liveList, /sets\s*\n\s*\.filter\(\(set\) => \(grouped\[set\.slug\]/);
  assert.match(
    styles,
    /\.practiceSetNav \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(7\.5rem, 1fr\)\)/,
  );
  assert.doesNotMatch(
    styles,
    /\.practiceSetNav \{[^}]*grid-template-columns: repeat\(3, 1fr\)/,
  );
  assert.match(readme, /practice-mode set jumps/i);
});
