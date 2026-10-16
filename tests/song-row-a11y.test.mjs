import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);

test("public song rows are not buttons; practice rows keep the picker contract", async () => {
  const source = await readFile(liveListUrl, "utf8");

  assert.doesNotMatch(source, /tabIndex=\{practiceMode \? 0 : -1\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => practiceMode && selectSong/);
  assert.doesNotMatch(
    source,
    /aria-label=\{practiceMode \? `Mark \$\{song\.title\} as current song` : undefined\}/,
  );
  assert.doesNotMatch(
    source,
    /aria-pressed=\{practiceMode \? runPosition\.kind === "selected"/,
  );

  assert.match(source, /practiceMode \? \(/);
  assert.match(source, /<div className=\{styles\.songMain\}>/);
  assert.match(
    source,
    /<SongReferenceDetails\s+song=\{song\}\s+showCurrentFlag=\{false\}\s+showTbdFlag=\{isTbdSlot\}/,
  );
  assert.match(source, /aria-label=\{`Mark \$\{song\.title\} as current song`\}/);
  assert.match(
    source,
    /aria-pressed=\{runPosition\.kind === "selected" && currentSongId === String\(song\.id\)\}/,
  );
  assert.match(source, /onClick=\{\(\) => selectSong\(String\(song\.id\)\)\}/);
  assert.match(source, /disabled=\{runPosition\.kind === "ambiguous"\}/);
  assert.match(source, /song\.songKey \? `Key: \$\{song\.songKey\}`/);
  assert.match(source, /song\.tuning \? `Tuning: \$\{song\.tuning\}`/);
  assert.match(source, />Original</);
});
