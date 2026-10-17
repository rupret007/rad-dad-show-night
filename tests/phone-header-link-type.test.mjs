import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);

function phoneHeaderCss(styles) {
  const start = styles.indexOf("@media (max-width: 720px)");
  assert.ok(start >= 0, "phone header rules live in the 720px query covering 390px and 320px");
  const next = styles.indexOf("@media ", start + 1);
  return styles.slice(start, next > start ? next : styles.length);
}

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped} \\{([^}]*)}`));
  assert.ok(match, `missing ${selector} in the 720px header rules`);
  return match[1];
}

function linkTypePx(declaration, rootPx) {
  const maxMatch = declaration.match(
    /font-size:\s*max\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)rem\)/,
  );
  if (maxMatch) {
    return Math.max(Number(maxMatch[1]), Number(maxMatch[2]) * rootPx);
  }
  const pxMatch = declaration.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  if (pxMatch) return Number(pxMatch[1]);
  const remMatch = declaration.match(/font-size:\s*(\d+(?:\.\d+)?)rem/);
  if (remMatch) return Number(remMatch[1]) * rootPx;
  return Number.NaN;
}

test("phone header public links stay at least 14px and wrap beside the RD mark", async () => {
  const [page, styles, readme, packageJson] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(packageUrl, "utf8"),
  ]);

  const nav = page.slice(
    page.indexOf('aria-label="Show page navigation"'),
    page.indexOf("</nav>"),
  );
  assert.match(
    nav,
    /<a className=\{styles\.mobilePrimaryLink\} href="#official-sets">\s*Set lists\s*<\/a>/,
  );
  assert.match(
    nav,
    /<a className=\{styles\.mobilePrimaryLink\} href="#suggestions">\s*Suggest a song\s*<\/a>/,
  );
  assert.match(page, /id="official-sets"/);
  assert.match(page, /id="suggestions"/);
  assert.equal(
    (nav.match(/styles\.mobilePrimaryLink/g) ?? []).length,
    3,
    "practice Set lists plus the two public header links stay in source",
  );

  assert.doesNotMatch(nav, /hamburger|aria-haspopup|aria-expanded|Open menu|Menu</i);
  assert.doesNotMatch(nav, /<button/);
  assert.doesNotMatch(nav, /<details/);
  assert.match(nav, /className=\{styles\.controlLink\}/);
  assert.match(nav, /Owner: edit set/);
  assert.match(page, /className=\{styles\.footerControl\}/);
  assert.match(page, /Owner: open Show Control/);

  const phone = phoneHeaderCss(styles);
  const links = rule(phone, ".topLinks");
  const identity = rule(phone, ".identity");
  const primary = rule(phone, ".topLinks .mobilePrimaryLink");
  const bar = rule(phone, ".topBarInner");

  assert.match(bar, /flex-wrap:\s*wrap/);
  assert.match(identity, /flex:\s*0 0 auto/);
  assert.match(links, /flex-wrap:\s*wrap/);
  assert.match(links, /min-width:\s*0/);
  assert.match(primary, /white-space:\s*normal/);
  assert.match(primary, /overflow-wrap:\s*anywhere/);
  assert.match(primary, /max-width:\s*100%/);
  assert.doesNotMatch(primary, /font-size:\s*0\.68rem/);

  for (const rootPx of [16, 32]) {
    const size = linkTypePx(primary, rootPx);
    assert.ok(
      size >= 14,
      `public header links must be at least 14px at ${rootPx}px root (200% is 32px); got ${size}`,
    );
  }

  assert.match(styles, /\.topLinks a \{ display: none; \}/);
  assert.match(
    styles,
    /\.topLinks \.mobilePrimaryLink, \.topLinks \.practiceLink \{[^}]*display: inline-flex;/,
  );
  assert.doesNotMatch(
    styles,
    /\.topLinks \.controlLink \{[^}]*display: inline-flex;/,
  );
  assert.match(styles, /\.topLinks a:focus-visible/);
  assert.match(
    styles,
    /\.topLinks a:focus-visible[\s\S]*?outline: 3px solid var\(--blue\);/,
  );

  assert.match(readme, /Set lists.*Suggest a song/s);
  assert.match(readme, /14px/);
  assert.match(readme, /without another menu/);
  assert.match(packageJson, /tests\/phone-header-link-type\.test\.mjs/);
});
