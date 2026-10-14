import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);
const workflowUrl = new URL("../.github/workflows/leftover-honesty.yml", import.meta.url);

const PUBLIC_FOCUS_SELECTORS = [
  ".identity:focus-visible",
  ".topLinks a:focus-visible",
  ".primaryAction:focus-visible",
  ".secondaryAction:focus-visible",
  ".footerSurfaces a:focus-visible",
  ".footerControl:focus-visible",
  ".unavailableActions a:focus-visible",
  ".resourceButton:focus-visible",
  ".resourceLink:focus-visible",
];

function hexToSrgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function linearize(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const [red, green, blue] = hexToSrgb(hex).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

test("public show controls expose a visible keyboard focus ring", async () => {
  const [styles, page, liveList, readme] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
    readFile(liveListUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  for (const selector of PUBLIC_FOCUS_SELECTORS) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const publicRing = styles.match(
    /\.identity:focus-visible[\s\S]*?\.resourceLink:focus-visible \{\s*outline: 3px solid var\(--blue\);\s*outline-offset: 3px;\s*\}/,
  );
  assert.ok(
    publicRing,
    "public show controls must share a 3px electric-blue :focus-visible ring, not only the skip-link rule",
  );

  const black = styles.match(/--black:\s*(#[0-9a-fA-F]{6})/)?.[1];
  const blue = styles.match(/--blue:\s*(#[0-9a-fA-F]{6})/)?.[1];
  assert.ok(black && blue, "page theme tokens --black and --blue must be hex colors");
  assert.ok(
    contrastRatio(blue, black) >= 3,
    `focus ring ${blue} on dark page ${black} must meet 3:1 non-text contrast`,
  );

  assert.match(page, /styles\.identity/);
  assert.match(page, /styles\.primaryAction/);
  assert.match(page, /styles\.footerControl/);
  assert.match(liveList, /styles\.secondaryAction/);
  assert.match(liveList, /styles\.resourceLink/);
  assert.match(readme, /focus ring/i);
});

test("merged main still keeps skip-to-content and event identity before the primary action", async () => {
  const [page, styles, readme, packageJson] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(packageUrl, "utf8"),
  ]);

  assert.match(page, /className=\{styles\.skipLink\}/);
  assert.match(page, /href="#main-content"/);
  assert.match(styles, /\.skipLink:focus-visible/);
  assert.match(readme, /skip link/i);
  assert.match(packageJson, /tests\/skip-to-content\.test\.mjs/);
  assert.match(packageJson, /tests\/public-focus-visible\.test\.mjs/);

  const identityAt = page.indexOf("styles.eventIdentity");
  const actionAt = page.indexOf("styles.nextActions");
  assert.ok(identityAt >= 0 && actionAt > identityAt, "event identity stays before the primary action");
  assert.match(page, /data-event-identity="current-show"/);
});

test("leftover-honesty still runs the exact high audit command", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.doesNotMatch(workflow, /npm run audit:high/);
});
