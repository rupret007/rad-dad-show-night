import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { test, expect } from "./fixtures";

// Render the actual navigation JSX without importing the server route or its
// database dependencies. The production stylesheet is used without rewriting it.
const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const start = source.indexOf('<nav className={styles.topBar}');
const end = source.indexOf("</nav>", start);
if (start < 0 || end < 0) throw new Error("The public navigation fixture is missing.");
const compiled = ts.transpileModule(`const header = (${source.slice(start, end + 6)});`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const header = new Function(
  "React", "styles", "practiceMode", "showHref", "hasRunOfShow", "nightUse", "practiceHref", "controlHref",
  `${compiled}\nreturn header;`,
)(React, new Proxy({}, { get: (_, key) => key }), false, "/?show=fixture", true,
  { hasVerifiedList: true }, "/?show=fixture&practice=1", "/show-control");
const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
  .replace('@import "tailwindcss";', "");
const styles = readFileSync(new URL("../../app/show-page.module.css", import.meta.url), "utf8");
const markup = renderToStaticMarkup(header);

for (const width of [320, 390]) {
  for (const rootPx of [16, 32]) {
    test(`public header at ${width}px and ${rootPx / 16 * 100}% text stays readable and operable`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/phone-header", (route) => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globals}\n${styles}\nhtml { font-size: ${rootPx}px; }</style></head><body><div class="page">${markup}<main><section id="official-sets">Official sets</section><section id="suggestions">Suggestions</section></main></div></body></html>`,
      }));
      await page.goto("/phone-header");
      const nav = page.getByRole("navigation", { name: "Show page navigation" });
      const identity = nav.getByRole("link", { name: "Rad Dad show night" });
      const links = [nav.getByRole("link", { name: "Set lists", exact: true }),
        nav.getByRole("link", { name: "Suggest a song", exact: true })];
      await expect(nav.getByRole("link", { name: "Owner: edit set" })).toBeHidden();
      await expect(nav.getByRole("button")).toHaveCount(0);
      await expect(nav.locator("a:visible")).toHaveCount(3);

      const identityBox = await identity.boundingBox();
      expect(identityBox).not.toBeNull();
      const boxes = [];
      for (const link of links) {
        await expect(link).toBeVisible();
        expect(await link.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)))
          .toBeGreaterThanOrEqual(rootPx === 32 ? 28 : 14);
        const box = await link.boundingBox();
        expect(box).not.toBeNull();
        if (!box || !identityBox) throw new Error("Missing header geometry");
        // Include the 3px focus outline plus its 3px offset in the viewport.
        expect(box.x).toBeGreaterThanOrEqual(6);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 6);
        expect(box.x >= identityBox.x + identityBox.width || box.y >= identityBox.y + identityBox.height).toBe(true);
        expect(await link.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        boxes.push(box);
      }
      expect(boxes[0].x + boxes[0].width <= boxes[1].x || boxes[0].y + boxes[0].height <= boxes[1].y).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      await page.keyboard.press("Tab");
      await expect(identity).toBeFocused();
      for (const link of links) {
        await page.keyboard.press("Tab");
        await expect(link).toBeFocused();
        await expect(link).toHaveCSS("outline-style", "solid");
        await expect(link).toHaveCSS("outline-width", "3px");
        await expect(link).toHaveCSS("outline-color", "rgb(24, 170, 245)");
      }
      for (const [index, link] of links.entries()) {
        await link.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(index === 0 ? "#official-sets$" : "#suggestions$"));
      }
      await page.screenshot({ path: testInfo.outputPath("header.png") });
    });
  }
}
