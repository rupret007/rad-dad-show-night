import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { createStoredShowSnapshot, showSnapshotKey } from "../../lib/show-read-integrity";
import { RUN_SHOW_ID, RUN_SHOW_SLUG, RUN_SONGS, runPayload, runSong } from "./run-fixture-data";

const middle = "2026-09-06T13:00:00.000Z";
const newest = "2026-09-07T13:00:00.000Z";
const pick = (page: Page, title: string) => page.getByRole("button", { name: `Mark ${title} as current song`, exact: true });
const current = (page: Page) => page.locator('[aria-label^="Mark "][aria-pressed="true"]');
const payload = (title: string, updatedAt: string) => ({
  ...runPayload([{ ...runSong(204, title, 1), updatedAt }]), updatedAt,
});

async function readShow(page: Page, trigger: () => Promise<unknown>) {
  // A local snapshot can render before the initial API response. Finish each
  // read before checking a rejected replay or starting the next refresh.
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/show");
  await trigger();
  expect(await (await response).finished()).toBeNull();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function refreshVisiblePage(page: Page) {
  // Normal playback refreshes on visibility; the manual button is reserved
  // for missing/ambiguous run positions.
  await readShow(page, () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))));
}

async function seedSnapshot(page: Page, title: string, updatedAt: string, showId = RUN_SHOW_ID) {
  const snapshot = createStoredShowSnapshot(RUN_SHOW_SLUG,
    [{ ...runSong(204, title, 1), showId, updatedAt }], updatedAt, newest, showId);
  await page.addInitScript(({ key, snapshot, slug }) => {
    Object.defineProperty(navigator, "onLine", { get: () => false });
    localStorage.setItem(key, JSON.stringify(snapshot));
    localStorage.setItem(`rad-dad-practice-position:${slug}`, "204");
  }, { key: showSnapshotKey(RUN_SHOW_SLUG), snapshot, slug: RUN_SHOW_SLUG });
}

test("offline API restores a newer verified set over database HTML and a later live read cannot rewind to cache", async ({ page }) => {
  let response = payload("Newer offline set", middle);
  let offline = true;
  await page.route("**/api/show?show=*", (route) => route.fulfill({
    headers: offline ? { "X-Rad-Dad-Offline": "1" } : {}, json: response,
  }));
  await readShow(page, () => page.goto("/?surface=run&strict"));
  await expect(pick(page, "Newer offline set")).toBeVisible();
  await expect(page.getByText(/^Last verified live list/)).toBeVisible();
  await expect(pick(page, RUN_SONGS[0].title)).toHaveCount(0);
  response = payload("Current live set", newest);
  offline = false;
  await refreshVisiblePage(page);
  await expect(pick(page, "Current live set")).toBeVisible();
  await expect(page.getByText(/^Verified live list/)).toBeVisible();
  await pick(page, "Current live set").click();
  response = payload("Older cache must not return", middle);
  offline = true;
  await refreshVisiblePage(page);
  await expect(page.getByText(/^Last verified live list/)).toBeVisible();
  await expect(current(page)).toHaveAccessibleName("Mark Current live set as current song");
  await expect(pick(page, "Older cache must not return")).toHaveCount(0);
});

test("offline local snapshot restores the saved ID absent from stale HTML when the API fails", async ({ page }) => {
  await seedSnapshot(page, "Latest local set", newest);
  await page.route("**/api/show?show=*", (route) => route.abort("failed"));
  await page.goto("/?surface=run&strict");
  await expect(current(page)).toHaveAccessibleName("Mark Latest local set as current song");
  await expect(page.getByText(/^Last verified live list/)).toBeVisible();
});

for (const localIsNewer of [true, false]) {
  test(`offline sources retain the newest set when ${localIsNewer ? "local storage" : "the API cache"} is newer`, async ({ page }) => {
    await seedSnapshot(page, "Local snapshot", localIsNewer ? newest : middle);
    await page.route("**/api/show?show=*", (route) => route.fulfill({
      headers: { "X-Rad-Dad-Offline": "1" },
      json: payload("API snapshot", localIsNewer ? middle : newest),
    }));
    await readShow(page, () => page.goto("/?surface=run"));
    const expected = localIsNewer ? "Local snapshot" : "API snapshot";
    await expect(current(page)).toHaveAccessibleName(`Mark ${expected} as current song`);
    await refreshVisiblePage(page);
    await expect(current(page)).toHaveAccessibleName(`Mark ${expected} as current song`);
    await expect(page.getByText(/^Last verified live list/)).toBeVisible();
  });
}

test("newer timestamps do not admit another show's local or API snapshot", async ({ page }) => {
  await seedSnapshot(page, "Foreign local snapshot", newest, "foreign-show");
  await page.route("**/api/show?show=*", (route) => route.fulfill({
    headers: { "X-Rad-Dad-Offline": "1" },
    json: { ...payload("Foreign API snapshot", newest), show: { id: "foreign-show", slug: RUN_SHOW_SLUG } },
  }));
  await readShow(page, () => page.goto("/?surface=run"));
  await expect(page.getByText(/^Last verified live list/)).toBeVisible();
  await expect(pick(page, RUN_SONGS[0].title)).toBeVisible();
  await expect(page.getByRole("button", { name: /Mark Foreign/ })).toHaveCount(0);
});
