import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const pageStylesUrl = new URL("../app/show-page.module.css", import.meta.url);
const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const controlStylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("the public show page skips past header navigation into main content", async () => {
  const [page, styles, readme] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(pageStylesUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(page, /className=\{styles\.skipLink\}/);
  assert.match(page, /href="#main-content"/);
  assert.match(page, /Skip to show content/);
  assert.match(page, /id="main-content"/);
  assert.match(page, /tabIndex=\{-1\}/);

  const skipIndex = page.indexOf('href="#main-content"');
  const navIndex = page.indexOf('aria-label="Show page navigation"');
  const mainIndex = page.indexOf('id="main-content"');
  assert.ok(skipIndex > 0 && navIndex > skipIndex, "skip link comes before the header nav");
  assert.ok(mainIndex > navIndex, "main content starts after the header nav");

  const footerIndex = page.indexOf("styles.footer");
  assert.ok(footerIndex > page.indexOf("</main>"), "page footer stays outside main");

  assert.match(styles, /\.skipLink \{/);
  assert.match(styles, /position: fixed;/);
  assert.match(styles, /transform: translateY\(-160%\)/);
  assert.match(styles, /\.skipLink:focus/);
  assert.match(styles, /\.skipLink:focus-visible/);
  assert.match(readme, /skip link/i);
});

test("the public hero keeps one show h1 before the one next step h2 in DOM order", async () => {
  const page = await readFile(pageUrl, "utf8");

  const showTitleAt = page.indexOf("styles.heroShowTitle");
  const nextStepH2At = page.indexOf("<h2>{openAction.title}</h2>");
  assert.ok(showTitleAt > 0 && nextStepH2At > showTitleAt);
  assert.match(page, /className=\{styles\.heroTitle\}/);
  assert.equal(
    page.match(/className=\{styles\.heroTitle\}/g)?.length,
    1,
    "public hero uses a single show identity h1",
  );
});

test("Show Control skips past owner chrome into the workspace", async () => {
  const [control, styles] = await Promise.all([
    readFile(controlUrl, "utf8"),
    readFile(controlStylesUrl, "utf8"),
  ]);

  assert.match(control, /className=\{styles\.skipLink\}/);
  assert.match(control, /href="#show-control-main"/);
  assert.match(control, /Skip to Show Control/);
  assert.match(control, /id="show-control-main"/);
  assert.match(control, /tabIndex=\{-1\}/);

  const skipIndex = control.indexOf('href="#show-control-main"');
  const headerIndex = control.indexOf("styles.controlTopbar");
  const mainIndex = control.indexOf('id="show-control-main"');
  const dockIndex = control.indexOf("styles.saveDock");
  assert.ok(skipIndex > 0 && headerIndex > skipIndex, "skip link comes before the owner top bar");
  assert.ok(mainIndex > headerIndex, "workspace main starts after the owner top bar");
  assert.ok(dockIndex > control.indexOf("</main>"), "save dock stays outside the workspace main");

  assert.match(styles, /\.skipLink \{/);
  assert.match(styles, /position: fixed;/);
  assert.match(styles, /transform: translateY\(-160%\)/);
  assert.match(styles, /\.skipLink:focus/);
});
