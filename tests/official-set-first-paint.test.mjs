import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { SET_DEFINITIONS } = await import("../lib/show-data.ts");
const { SHOW_FLYER_CANDIDATES } = await import("../lib/show-media.ts");
const {
  LIVE_SET_SLUGS,
  MISSING_MEDIA_FAILS_CLOSED,
  STORYBOARD_ROLE,
} = await import("../lib/surface-roles.ts");

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const flyerUrl = new URL("../app/show-flyer.tsx", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const nextStepUrl = new URL("../lib/show-night-use.ts", import.meta.url);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const siteOrVaultAreNotOfficialSet = [
  "Song 2",
  "Saw Her Standing There",
  "Tutti Frutti",
  "In the Jungle",
  "In Bloom",
  "Santeria",
  "Bowling for Soup",
  "Harbor Lights",
  "Sidewalk Radio",
];

test("first paint names the official live sets and does not dump site or Vault rows", async () => {
  assert.equal(MISSING_MEDIA_FAILS_CLOSED, true);
  assert.equal(STORYBOARD_ROLE, "band_os");
  assert.deepEqual(
    SET_DEFINITIONS.map((set) => set.slug),
    [...LIVE_SET_SLUGS],
  );

  const [page, flyer, nextStep] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(flyerUrl, "utf8"),
    readFile(nextStepUrl, "utf8"),
  ]);

  assert.match(page, /aria-label="Official sets"/);
  assert.match(page, /firstOpenAction/);
  assert.match(nextStep, /See the official sets/);
  assert.match(page, /#official-sets/);
  assert.match(page, /sets\.map/);
  assert.match(page, /\{set\.time \|\| "This show"\}/);
  assert.match(page, /\{set\.title\}/);
  assert.doesNotMatch(page, /SET_DEFINITIONS\.map/);
  assert.match(page, /ShowFlyer/);
  assert.match(page, /SHOW_FLYER_CANDIDATES/);
  assert.doesNotMatch(page, /SHOW NIGHT HQ/);
  assert.doesNotMatch(page, /Rad Dad show night home/);
  assert.doesNotMatch(page, /Practice \+ lyrics/);
  assert.doesNotMatch(page, /Lyrics and YouTube open in a new tab/);
  assert.doesNotMatch(page, /every song has a direct YouTube path/i);

  for (const title of siteOrVaultAreNotOfficialSet) {
    const token = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.doesNotMatch(
      page,
      token,
      `${title} is not an official first-paint set row`,
    );
    assert.doesNotMatch(flyer, token);
  }
});

test("the flyer fail-closes on missing media by reusing existing files", async () => {
  const flyer = await readFile(flyerUrl, "utf8");
  assert.match(flyer, /SHOW_FLYER_CANDIDATES/);
  assert.match(flyer, /onError/);
  assert.match(flyer, /setIndex/);
  assert.deepEqual([...SHOW_FLYER_CANDIDATES], [
    "/rad-dad-friends-guitars-growlers-flyer-v8.png",
    "/rad-dad-friends-flyer.png",
  ]);

  for (const candidate of SHOW_FLYER_CANDIDATES) {
    await access(join(repoRoot, "public", candidate.slice(1)));
  }
});

test("this leftover does not rewrite Jeff's official set or add a fourth live band", async () => {
  const source = await readFile(showDataUrl, "utf8");
  assert.match(source, /Heart-Shaped Box/);
  assert.match(source, /Travis Story - guitar/);
  assert.match(source, /First Date/);
  assert.match(source, /The Way I Love You/);
  const definitions = source.slice(source.indexOf("export const SET_DEFINITIONS"));
  const slugs = [...definitions.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(slugs, [...LIVE_SET_SLUGS]);
});
