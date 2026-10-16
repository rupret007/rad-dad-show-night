import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { runPayload } from "./run-fixture-data";

const pick = (page: Page, title: string) =>
  page.getByRole("button", { name: `Mark ${title} as current song`, exact: true });

async function mockShow(page: Page) {
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: runPayload() }));
}

test("public song rows are not buttons and still show the same song details", async ({ page }) => {
  await mockShow(page);
  await page.goto("/?surface=public");

  await expect(page.getByText("Fixture opening", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixture band").first()).toBeVisible();
  await expect(page.getByText("Fixture cue").first()).toBeVisible();
  await expect(page.getByText("Key: D / Tuning: Standard").first()).toBeVisible();
  await expect(page.getByText("Original").first()).toBeVisible();

  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mark .+ as current song/ })).toHaveCount(0);
  await expect(page.locator("[aria-pressed]")).toHaveCount(0);
});

test("practice rows stay keyboard-operable with full names and aria-pressed", async ({ page }) => {
  await mockShow(page);
  await page.goto("/?surface=run");

  const opening = pick(page, "Fixture opening");
  await expect(opening).toBeVisible();
  await expect(opening).toHaveAccessibleName("Mark Fixture opening as current song");
  await expect(opening).toHaveAttribute("aria-pressed", "false");
  await expect(opening).toContainText("Fixture opening");
  await expect(opening).toContainText("Fixture band");
  await expect(opening).toContainText("Fixture cue");
  await expect(opening).toContainText("Key: D / Tuning: Standard");
  await expect(opening).toContainText("Original");

  await opening.focus();
  await expect(opening).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(opening).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[aria-label^="Mark "][aria-pressed="true"]')).toHaveCount(1);

  const closer = pick(page, "Fixture closer");
  await closer.focus();
  await page.keyboard.press("Space");
  await expect(closer).toHaveAttribute("aria-pressed", "true");
  await expect(closer).toHaveAccessibleName("Mark Fixture closer as current song");
  await expect(opening).toHaveAttribute("aria-pressed", "false");
});
