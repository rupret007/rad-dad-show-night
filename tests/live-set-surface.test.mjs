import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const {
  LIVE_SET_SLUGS,
  NEVER_AUTO_POST,
  OFFICIAL_SET_WRITER,
  PUBLIC_SITE_LABEL,
  PUBLIC_SITE_URL,
  PUBLIC_SUGGESTION_WRITER,
  RADDAD_SITE_ROLE,
  SHOW_NIGHT_DOES_NOT_EXPAND_VAULT,
  SHOW_NIGHT_ROLE,
  TRAVIS_BOOKS,
  VAULT_ROLE,
} = await import("../lib/surface-roles.ts");

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const leftoverTitleDumpUrl = new URL("../content/show.json", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const technicalGuideUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);
const showPlanUrl = new URL("../docs/SHOW_PLAN.md", import.meta.url);

const catalogExpansionTokens = [
  /app_api\.json/,
  /master_catalog\.json/,
  /AI-Music-Vault/,
  /setlist_ready_default_import/,
  /storyboard_default_live/,
  /vault:catalog_import/,
  /from ["'].*vault/i,
];

const remoteCatalogTokens = [
  /https?:\/\/[^"'`\s]*vault[^"'`\s]*/i,
  /https?:\/\/[^"'`\s]*app_api\.json/i,
  /https?:\/\/[^"'`\s]*master_catalog\.json/i,
];

const autoPitchTokens = [
  /auto-pitch/i,
  /auto-post/i,
  /\bautopost\b/i,
  /never_auto_post:\s*false/,
  /travis_books:\s*false/,
];

const sourceOfTruthLies = [
  /one shared source of truth/i,
  /this page is the source of truth/i,
];

const skipDirNames = new Set([
  ".git",
  ".next",
  ".wrangler",
  "dist",
  "node_modules",
]);

const scannableExtensions = new Set([
  ".css",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
]);

async function collectScannableFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skipDirNames.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectScannableFiles(path)));
      continue;
    }
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    if (scannableExtensions.has(extension)) files.push(path);
  }
  return files;
}

test("surface roles name Show Night as the live set, not the catalog or public site", () => {
  assert.equal(SHOW_NIGHT_ROLE, "live_set_surface");
  assert.equal(VAULT_ROLE, "catalog");
  assert.equal(RADDAD_SITE_ROLE, "public_site");
  assert.equal(SHOW_NIGHT_DOES_NOT_EXPAND_VAULT, true);
  assert.equal(NEVER_AUTO_POST, true);
  assert.equal(TRAVIS_BOOKS, true);
  assert.equal(PUBLIC_SUGGESTION_WRITER, "POST /api/suggestions");
  assert.equal(OFFICIAL_SET_WRITER, "POST /api/show");
  assert.deepEqual([...LIVE_SET_SLUGS], [
    "jeff-story-friends",
    "stalemate",
    "rad-dad",
  ]);
  assert.equal(PUBLIC_SITE_URL, "https://www.raddadband.com");
  assert.equal(PUBLIC_SITE_LABEL, "Public band site");
});

test("unused leftover title dump stays removed", async () => {
  await assert.rejects(
    () => readFile(leftoverTitleDumpUrl, "utf8"),
    (error) => error?.code === "ENOENT",
  );
});

test("the live page sits next to the public site and does not claim to be the only source of truth", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /surface-roles/);
  assert.match(source, /PUBLIC_SITE_URL/);
  assert.match(source, /Live set surface/);
  assert.doesNotMatch(source, /one shared source of truth/i);
  assert.doesNotMatch(source, /this page is the source of truth/i);
  assert.doesNotMatch(source, /02 \/ Live source of truth/);
});

test("docs keep the three-surface split and do not dump a catalog", async () => {
  const [readme, guide, plan] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(technicalGuideUrl, "utf8"),
    readFile(showPlanUrl, "utf8"),
  ]);

  for (const source of [readme, guide, plan]) {
    assert.match(source, /live set surface/i);
    assert.match(source, /does\s+not\s+expand\s+Vault/i);
    assert.match(source, /raddadband\.com/);
    assert.doesNotMatch(source, /one shared source of truth/i);
    assert.doesNotMatch(source, /this page is the source of truth/i);
    assert.doesNotMatch(source, /JS-\d{4}/);
    assert.doesNotMatch(source, /ST-\d{4}/);
    assert.doesNotMatch(source, /setlist_ready_default_import/);
  }
});

test("application sources do not expand Vault, auto-pitch, or revive a second setlist dump", async () => {
  const files = await collectScannableFiles(repoRoot);
  assert.ok(files.some((path) => path.endsWith("lib/surface-roles.ts")));

  for (const path of files) {
    if (path.endsWith("tests/live-set-surface.test.mjs")) continue;
    const source = await readFile(path, "utf8");
    for (const token of catalogExpansionTokens) {
      assert.doesNotMatch(
        source,
        token,
        `${path} must not expand Vault`,
      );
    }
    for (const token of remoteCatalogTokens) {
      assert.doesNotMatch(
        source,
        token,
        `${path} must not fetch a remote catalog`,
      );
    }
    for (const token of autoPitchTokens) {
      assert.doesNotMatch(source, token, `${path} must not auto-pitch or auto-post`);
    }
    for (const token of sourceOfTruthLies) {
      assert.doesNotMatch(
        source,
        token,
        `${path} must not claim Show Night is the only source of truth`,
      );
    }
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
