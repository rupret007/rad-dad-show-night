import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { RUN_SHOW_ID, RUN_SHOW_SLUG, RUN_SONGS } from "./run-fixture-data";

function ownerSongTools(page: Page) {
  return page.getByRole("button", { name: /^(Move up|Move down|Remove)$/ })
    .or(page.getByRole("link", { name: /^(Search YouTube|Search lyrics)$/ }))
    .or(page.getByRole("banner").getByRole("link", { name: /^(Sign out|Open public share link)$/ }));
}

async function openOwner(page: Page) {
  const show = {
    id: RUN_SHOW_ID, slug: RUN_SHOW_SLUG, title: "Offline owner tools fixture",
    venue: "Fixture venue", showDate: "2026-10-01", date: "Fixture date",
    startTime: "", endTime: "", hours: "", expectedWrap: "",
    status: "published", isDefault: true,
  };
  await page.route("**/api/suggestions", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { suggestions: [] } });
  });
  await page.route("**/api/shows", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { shows: [show] } });
  });
  await page.route("**/api/show?*", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({
      headers: { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database", "Cache-Control": "private, no-store" },
      json: {
        show,
        sets: [
          { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
          { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
          { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
        ],
        songs: RUN_SONGS.map((song) => ({ ...song, isOriginal: false })),
        setWriteVersions: { "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "initial:0" },
      },
    });
  });
  await page.goto(`/?surface=owner&show=${RUN_SHOW_SLUG}`);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
}

for (const width of [390, 320]) {
  test.describe(`${width}px owner tools`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("readable touch targets wrap within the phone and remain distinct from Save", async ({ page }) => {
      await openOwner(page);
      const ownerLinks = page.getByRole("banner").getByRole("link", { name: /^(Sign out|Open public share link)$/ });
      await expect(ownerLinks).toHaveCount(2);
      const tools = ownerSongTools(page);
      await expect(tools).toHaveCount(17);
      for (const tool of await tools.all()) {
        const metrics = await tool.evaluate((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return { font: parseFloat(style.fontSize), minHeight: parseFloat(style.minHeight),
            height: rect.height, left: rect.left, right: rect.right,
            background: style.backgroundColor, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        });
        expect.soft(metrics.font).toBeGreaterThanOrEqual(14);
        expect.soft(metrics.minHeight).toBeGreaterThanOrEqual(44);
        expect.soft(metrics.height).toBeGreaterThanOrEqual(44);
        expect.soft(metrics.left).toBeGreaterThanOrEqual(0);
        expect.soft(metrics.right).toBeLessThanOrEqual(width);
        expect.soft(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        expect.soft(metrics.background).toBe("rgba(0, 0, 0, 0)");
      }
      await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last())
        .toHaveCSS("background-color", "rgb(184, 245, 39)");
      // The main share CTA is a separate primary action, not an owner-strip link.
      await expect(page.getByRole("main").getByRole("link", { name: "Open public share link", exact: true }))
        .toHaveCSS("background-color", "rgb(184, 245, 39)");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test("keyboard reaches every enabled tool with a visible focus ring", async ({ page }) => {
      await openOwner(page);
      const targets = ownerSongTools(page);
      await expect(targets).toHaveCount(17);
      for (const target of await targets.all()) {
        if (await target.isDisabled()) continue;
        await target.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(target).toBeFocused();
        await expect(target).toHaveCSS("outline-style", "solid");
        await expect(target).toHaveCSS("outline-width", "3px");
        await expect(target).toHaveCSS("outline-color", "rgb(24, 170, 245)");
        await expect(target).toHaveCSS("outline-offset", "3px");
      }
    });

    test("Move and Remove stage edits while default-show archive stays blocked", async ({ page }) => {
      await openOwner(page);
      const archive = page.getByRole("button", { name: "Archive show", exact: true });
      await expect(archive).toBeDisabled();
      await expect(page.locator("#show-lifecycle-hint")).toContainText("The default public show cannot be archived");
      // Even a synthetic click cannot activate a disabled archive control.
      await archive.evaluate((button: HTMLButtonElement) => button.click());
      const titles = page.getByRole("textbox", { name: "Song", exact: true });
      await page.getByRole("button", { name: "Move down", exact: true }).first().click();
      await expect(titles.first()).toHaveValue("Fixture anchor");
      await page.getByRole("button", { name: "Move up", exact: true }).nth(1).click();
      await expect(titles.first()).toHaveValue("Fixture opening");
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe('Remove "Fixture anchor" from Rad Dad?');
        await dialog.dismiss();
      });
      await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click();
      await expect(titles).toHaveCount(3);
      await expect(titles.nth(1)).toHaveValue("Fixture anchor");
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe('Remove "Fixture anchor" from Rad Dad?');
        await dialog.accept();
      });
      await page.getByRole("button", { name: "Remove", exact: true }).nth(1).click();
      await expect(titles).toHaveCount(2);
      await expect(titles.first()).toHaveValue("Fixture opening");
      await expect(titles.last()).toHaveValue("Fixture closer");
      await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
      await page.getByRole("button", { name: "Undo remove", exact: true }).click();
      await expect(titles).toHaveCount(3);
      await expect(titles.nth(1)).toHaveValue("Fixture anchor");
      await expect(archive).toBeDisabled();
      // Mock handlers reject all writes; no Save, provider lookup, or sign-out is sent.
    });
  });
}
