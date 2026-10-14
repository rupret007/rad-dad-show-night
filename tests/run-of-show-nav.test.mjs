import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RUN_OF_SHOW } from "../lib/show-data.ts";
import { showHasRunOfShow } from "../lib/show-night-use.ts";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const nextStepUrl = new URL("../lib/show-night-use.ts", import.meta.url);

function windowBefore(source, index, size = 180) {
  return source.slice(Math.max(0, index - size), index);
}

test("empty published shows omit the Run of show navigation link", async () => {
  const [page, styles, liveList, nextStep] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(liveListUrl, "utf8"),
    readFile(nextStepUrl, "utf8"),
  ]);

  assert.equal(showHasRunOfShow([]), false);
  assert.equal(showHasRunOfShow(undefined), false);
  assert.equal(showHasRunOfShow(null), false);
  assert.equal(showHasRunOfShow(RUN_OF_SHOW), true);
  assert.ok(RUN_OF_SHOW.length > 0);

  assert.match(
    page,
    /\{hasRunOfShow \? \(\s*<a href="#run-of-show">\s*Run of show\s*<\/a>\s*\) : null\}/,
  );
  assert.doesNotMatch(
    page,
    /<>\s*<a href="#run-of-show">\s*Run of show\s*<\/a>/,
  );

  const runHrefs = [...page.matchAll(/href="#run-of-show"/g)];
  assert.equal(runHrefs.length, 2);
  for (const match of runHrefs) {
    assert.match(
      windowBefore(page, match.index ?? 0),
      /hasRunOfShow/,
      "every Run of show fragment link is gated by hasRunOfShow",
    );
  }

  assert.match(page, /id="run-of-show"/);
  assert.match(page, /\{!practiceMode && hasRunOfShow \? \(/);

  assert.match(page, /href=\{practiceMode \? showHref : "#top"\}/);
  assert.match(page, /id="top"/);

  const fragmentHrefs = [...page.matchAll(/href="(#[^"]+)"/g)].map(
    (match) => match[1],
  );
  const destinations = {
    "#main-content": /id="main-content"/,
    "#run-of-show": /id="run-of-show"/,
    "#official-sets": /id="official-sets"/,
    "#suggestions": /id="suggestions"/,
  };
  assert.deepEqual(
    [...new Set(fragmentHrefs)].sort(),
    Object.keys(destinations).sort(),
  );
  for (const href of fragmentHrefs) {
    assert.match(page, destinations[href]);
  }
  assert.match(
    nextStep,
    /href: use\.firstSet \? `#set-\$\{use\.firstSet\.slug\}` : "#official-sets"/,
  );
  assert.match(liveList, /id=\{`set-\$\{set\.slug\}`\}/);

  assert.match(
    page,
    /<a className=\{styles\.mobilePrimaryLink\} href="#official-sets">\s*Set lists\s*<\/a>/,
  );
  assert.match(
    page,
    /<a className=\{styles\.mobilePrimaryLink\} href="#suggestions">\s*Suggest a song\s*<\/a>/,
  );
  assert.match(styles, /\.topLinks a \{ display: none; \}/);
  assert.match(
    styles,
    /\.topLinks \.mobilePrimaryLink, \.topLinks \.practiceLink \{[^}]*display: inline-flex;/,
  );
});
