import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { RUN_SHOW_SLUG, RUN_SONGS, runPayload, runSong } from "./run-fixture-data";

const position = (page: Page) => page.getByTestId("run-position-status");
const current = (page: Page) => page.locator('[aria-label^="Mark "][aria-pressed="true"]');
const controls = (page: Page) => page.locator('[aria-label="Practice controls"]');
const pick = (page: Page, title: string) => page.getByRole("button", { name: `Mark ${title} as current song`, exact: true });
async function triggerRead(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

test("a confirmed baseline cannot retire a saved position before the first delayed live list arrives", async ({ page }) => {
  await page.addInitScript((slug) => localStorage.setItem(`rad-dad-practice-position:${slug}`, "204"), RUN_SHOW_SLUG);
  let started = false;
  let releaseRead: (() => void) | undefined;
  await page.route("**/api/show?show=*", async (route) => {
    started = true;
    await new Promise<void>((resolve) => { releaseRead = resolve; });
    await route.fulfill({ json: runPayload([RUN_SONGS[0], runSong(204, "Actual saved fixture place", 2), RUN_SONGS[2]]) });
  });
  try {
    await page.goto("/?surface=run&source=fallback");
    await expect.poll(() => started).toBe(true);
    await expect(position(page)).toHaveAttribute("data-run-position", "missing");
    await expect(current(page)).toHaveCount(0);
    releaseRead?.();
    await expect(current(page)).toHaveAccessibleName("Mark Actual saved fixture place as current song");
    await expect(controls(page)).toContainText("Next / Fixture closer");
    expect(await page.evaluate((slug) => localStorage.getItem(`rad-dad-practice-position:${slug}`), RUN_SHOW_SLUG)).toBe("204");
  } finally { releaseRead?.(); }
});

test("official metadata and reordering preserve the exact current ID and recompute Next", async ({ page }, testInfo) => {
  let payload = runPayload();
  let reads = 0;
  await page.route("**/api/show?show=*", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(new URL(route.request().url()).searchParams.get("show")).toBe(RUN_SHOW_SLUG);
    reads += 1;
    await route.fulfill({ json: payload });
  });
  await page.goto("/?surface=run");
  await expect.poll(() => reads).toBe(1);
  await pick(page, "Fixture anchor").click();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
  await expect(controls(page)).toContainText("Next / Fixture closer");
  payload = runPayload([
    { ...RUN_SONGS[2], position: 1 },
    { ...RUN_SONGS[1], title: "Fixture anchor reviewed", position: 2, songKey: "E", performanceNote: "Reviewed handoff" },
    { ...RUN_SONGS[0], position: 3 },
  ]);
  await triggerRead(page);
  await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor reviewed as current song");
  await expect(current(page)).toContainText("Key: E");
  await expect(current(page)).toContainText("Reviewed handoff");
  await expect(controls(page)).toContainText("Next / Fixture opening");
  await page.screenshot({ path: testInfo.outputPath("run-current-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Next song", exact: true }).click();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture opening as current song");
  expect(await page.evaluate((slug) => localStorage.getItem(`rad-dad-practice-position:${slug}`), RUN_SHOW_SLUG)).toBe("101");
});

test("a removed current song never matches its old title or index and requires an explicit pick", async ({ page }, testInfo) => {
  let payload = runPayload();
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: payload }));
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  payload = runPayload([RUN_SONGS[0], runSong(202, "Fixture anchor", 2), RUN_SONGS[2]]);
  await triggerRead(page);
  await expect(position(page)).toHaveAttribute("data-run-position", "missing");
  await expect(position(page)).toContainText("Your place is no longer in this saved set");
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous song", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next song", exact: true })).toBeDisabled();
  expect(await page.evaluate((slug) => localStorage.getItem(`rad-dad-practice-position:${slug}`), RUN_SHOW_SLUG)).toBe("102");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("run-removed-320.png"), fullPage: true });
  await pick(page, "Fixture anchor").click();
  await expect(current(page)).toHaveCount(1);
  expect(await page.evaluate((slug) => localStorage.getItem(`rad-dad-practice-position:${slug}`), RUN_SHOW_SLUG)).toBe("202");
});

test("an empty saved set keeps the missing-place recovery without borrowing another song", async ({ page }) => {
  let payload = runPayload();
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: payload }));
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  payload = runPayload([]);
  await triggerRead(page);
  await expect(position(page)).toHaveAttribute("data-run-position", "missing");
  await expect(page.getByText(/This show does not have a verified list yet/)).toBeVisible();
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next song", exact: true })).toBeDisabled();
  payload = runPayload([runSong(301, "A new fixture opener", 1)]);
  await page.getByRole("button", { name: "Refresh saved list", exact: true }).click();
  await expect(pick(page, "A new fixture opener")).toBeVisible();
  await expect(current(page)).toHaveCount(0);
  await pick(page, "A new fixture opener").click();
  await expect(current(page)).toHaveCount(1);
});

test("an observed removal stays a manual choice even if a later snapshot reintroduces the old ID", async ({ page }) => {
  let payload = runPayload();
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: payload }));
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  payload = runPayload([RUN_SONGS[0], RUN_SONGS[2]]);
  await triggerRead(page);
  await expect(position(page)).toHaveAttribute("data-run-position", "missing");
  payload = runPayload(RUN_SONGS.map((song) => song.id === 102 ? { ...song, title: "Reappearing fixture anchor" } : song));
  await page.getByRole("button", { name: "Refresh saved list", exact: true }).click();
  await expect(pick(page, "Reappearing fixture anchor")).toBeVisible();
  await expect(position(page)).toHaveAttribute("data-run-position", "missing");
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next song", exact: true })).toBeDisabled();
  await pick(page, "Reappearing fixture anchor").click();
  await expect(current(page)).toHaveAccessibleName("Mark Reappearing fixture anchor as current song");
});

test("malformed or offline cached refreshes cannot replace an already verified in-memory list", async ({ page }) => {
  let mode: "good" | "null-song" | "invalid-sets" | "cached" = "good";
  let reads = 0;
  await page.route("**/api/show?show=*", async (route) => {
    reads += 1;
    const payload = runPayload();
    await route.fulfill({
      headers: mode === "cached" ? { "x-rad-dad-offline": "1" } : {},
      json: mode === "null-song" ? { ...payload, songs: [null] }
        : mode === "invalid-sets" ? { ...payload, sets: [{ slug: "foreign-set" }] }
        : mode === "cached" ? runPayload([runSong(101, "Stale offline fixture must not replace live", 1)])
        : payload,
    });
  });
  await page.goto("/?surface=run");
  await expect.poll(() => reads).toBe(1);
  await pick(page, "Fixture anchor").click();
  for (const next of ["null-song", "invalid-sets", "cached"] as const) {
    mode = next;
    const prior = reads;
    await triggerRead(page);
    await expect.poll(() => reads).toBe(prior + 1);
    await expect(page.getByText(/Live updates paused \/ last verified set|Offline \/ showing last verified set/)).toBeVisible();
    await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
    await expect(page.getByText("Stale offline fixture must not replace live")).toHaveCount(0);
  }
});

test("malformed original and transition flags never turn original songs into public media links", async ({ page }) => {
  let flags: Record<string, unknown> | null = null;
  let reads = 0;
  await page.route("**/api/show?show=*", async (route) => {
    reads += 1;
    const payload = runPayload();
    await route.fulfill({ json: flags ? {
      ...payload, songs: RUN_SONGS.map((song) => song.id === 102 ? {
        ...song, ...flags, title: "Malformed flags must not replace original",
        youtubeUrl: "https://www.youtube.com/watch?v=fixture1234", youtubeVideoId: "fixture1234",
        lyricsUrl: "https://example.invalid/private-original-lyrics",
      } : song),
    } : payload });
  });
  await page.goto("/?surface=run");
  await expect.poll(() => reads).toBe(1);
  await pick(page, "Fixture anchor").click();
  for (const invalid of [{ isOriginal: "true" }, { isOriginal: 0 }, { transition: "false" }]) {
    flags = invalid;
    const prior = reads;
    await triggerRead(page);
    await expect.poll(() => reads).toBe(prior + 1);
    await expect(page.getByText("Live updates paused / last verified set", { exact: true })).toBeVisible();
    await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
    await expect(page.getByRole("link", { name: "YouTube", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open lyrics", exact: true })).toHaveCount(0);
    const snapshot = await page.evaluate((slug) => JSON.parse(localStorage.getItem(`rad-dad-show-snapshot:${slug}`) ?? "null"), RUN_SHOW_SLUG);
    expect(snapshot.songs.find((song: { id: number }) => song.id === 102).isOriginal).toBe(true);
  }
});

test("wrong-show and interrupted reads retain the last verified selection", async ({ page }) => {
  let mode: "good" | "other" | "failure" = "good";
  await page.route("**/api/show?show=*", async (route) => {
    if (mode === "failure") return route.abort("failed");
    const payload = runPayload();
    await route.fulfill({ json: mode === "other" ? {
      ...payload, show: { id: "foreign-fixture", slug: "foreign-night" },
      songs: [runSong(501, "Foreign fixture must not render", 1)],
    } : payload });
  });
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  for (const next of ["other", "failure"] as const) {
    mode = next;
    await triggerRead(page);
    await expect(page.getByText("Live updates paused / last verified set", { exact: true })).toBeVisible();
    await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
    await expect(page.getByText("Foreign fixture must not render")).toHaveCount(0);
  }
  mode = "good";
  await triggerRead(page);
  await expect(page.getByText(/^Verified live list/)).toBeVisible();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
});

test("duplicate IDs disable ambiguous selection until a corrected verified read", async ({ page }) => {
  let payload = runPayload();
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: payload }));
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  payload = runPayload([RUN_SONGS[1], { ...RUN_SONGS[1], title: "Ambiguous fixture", position: 3 }]);
  await triggerRead(page);
  await expect(position(page)).toHaveAttribute("data-run-position", "ambiguous");
  await expect(current(page)).toHaveCount(0);
  await expect(pick(page, "Fixture anchor")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next song", exact: true })).toBeDisabled();
  payload = runPayload();
  await page.getByRole("button", { name: "Refresh saved list", exact: true }).click();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
});

test("a stalled body times out, repeated triggers stay single-flight, and a late body cannot replace recovery", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    let reads = 0;
    window.fetch = async (...args) => {
      const response = await realFetch(...args);
      if (String(args[0]).startsWith("/api/show?") && ++reads === 2) {
        const payload = await response.json();
        Object.defineProperty(response, "json", { value: () => new Promise((resolve) => {
          // Fixture deliberately ignores AbortSignal after headers, exercising
          // the actual component's independent full-body read deadline.
          (window as Window & { releaseRunBody?: () => void }).releaseRunBody = () => resolve(payload);
        }) });
      }
      return response;
    };
  });
  let reads = 0;
  await page.route("**/api/show?show=*", async (route) => {
    reads += 1;
    const songs = RUN_SONGS.map((song) => song.id === 102 ? { ...song, title: reads === 2 ? "Obsolete late fixture" : reads >= 3 ? "Recovered fixture anchor" : song.title } : song);
    await route.fulfill({ json: runPayload(songs) });
  });
  await page.goto("/?surface=run");
  await expect.poll(() => reads).toBe(1);
  await pick(page, "Fixture anchor").click();
  await triggerRead(page);
  await expect.poll(() => reads).toBe(2);
  await expect.poll(() => page.evaluate(() => typeof (window as Window & { releaseRunBody?: unknown }).releaseRunBody)).toBe("function");
  await triggerRead(page);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(reads).toBe(2);
  await page.clock.fastForward(10_100);
  await expect(page.getByText("Live updates paused / last verified set", { exact: true })).toBeVisible();
  expect(reads).toBe(2);
  await triggerRead(page);
  await expect(current(page)).toHaveAccessibleName("Mark Recovered fixture anchor as current song");
  await page.evaluate(() => (window as Window & { releaseRunBody?: () => void }).releaseRunBody?.());
  await expect(current(page)).toHaveAccessibleName("Mark Recovered fixture anchor as current song");
  await expect(page.getByText("Obsolete late fixture")).toHaveCount(0);
  expect(reads).toBe(3);
});

test("changing show identity retires the prior reading position in the same mounted surface", async ({ page }) => {
  await page.route("**/api/show?show=*", (route) => {
    const other = new URL(route.request().url()).searchParams.get("show") !== RUN_SHOW_SLUG;
    const payload = runPayload();
    return route.fulfill({ json: other ? {
      ...payload, show: { id: "other-run-fixture-show", slug: "other-run-fixture-night" },
      songs: RUN_SONGS.map((song) => ({ ...song, showId: "other-run-fixture-show", title: `Other ${song.title}` })),
    } : payload });
  });
  await page.goto("/?surface=run");
  await pick(page, "Fixture anchor").click();
  await page.getByRole("button", { name: "Switch fixture show", exact: true }).click();
  await expect(pick(page, "Other Fixture anchor")).toBeVisible();
  await expect(current(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next song", exact: true })).toBeDisabled();
  await pick(page, "Other Fixture closer").click();
  await expect(current(page)).toHaveAccessibleName("Mark Other Fixture closer as current song");
  expect(await page.evaluate((slug) => localStorage.getItem(`rad-dad-practice-position:${slug}`), RUN_SHOW_SLUG)).toBe("102");
});

test("denied device storage leaves manual run controls usable and readable at 320px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"] as const) {
      Object.defineProperty(Storage.prototype, method, { value: () => { throw new DOMException("Fixture storage denied", "SecurityError"); } });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/show?show=*", (route) => route.fulfill({ json: runPayload() }));
  await page.goto("/?surface=run");
  await expect(page.getByText(/Device storage is unavailable/)).toBeVisible();
  await pick(page, "Fixture anchor").click();
  await page.getByRole("button", { name: "Next song", exact: true }).click();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture closer as current song");
  await page.getByRole("button", { name: "Previous song", exact: true }).click();
  await expect(current(page)).toHaveAccessibleName("Mark Fixture anchor as current song");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    resolve();
  }))));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("run-storage-denied-320.png"), fullPage: true });
  expect(errors).toEqual([]);
});
