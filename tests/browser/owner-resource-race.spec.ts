import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { officialSetRevision } from "../../lib/owner-set-save";

const SHOW_A = { id: "lookup-a", slug: "lookup-a", title: "Lookup fixture A", venue: "Fixture", showDate: "2026-10-01", date: "Fixture", startTime: "", endTime: "", hours: "", expectedWrap: "", status: "draft", isDefault: false };
const SHOW_B = { ...SHOW_A, id: "lookup-b", slug: "lookup-b", title: "Lookup fixture B" };
const sets = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
];
const versions = Object.fromEntries(sets.map((set) => [set.slug, "initial:0"]));
const result = { youtubeUrl: "https://www.youtube.com/watch?v=4ReFoSZHL7o", youtubeVideoId: "4ReFoSZHL7o", lyricsUrl: "https://fixture.invalid/lyrics", chordsUrl: "https://fixture.invalid/chords", source: "fixture" };
function song(id: number, showId = SHOW_A.id) {
  return { id, showId, setSlug: "rad-dad", position: id, title: `Fixture song ${id}`, artist: "Fixture artist", transition: false, isOriginal: false, durationSeconds: 180, performanceNote: "", songKey: "", tuning: "", youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "", updatedAt: "2026-10-01T00:00:00.000Z" };
}
declare global {
  interface Window {
    resourceLookups: Array<{ release: (result: unknown) => void; fail: () => void; signal?: AbortSignal | null }>;
  }
}

async function openOwner(page: Page, count = 1) {
  const posts: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    const state = window;
    state.resourceLookups = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      if (args[0] !== "/api/enrich") return realFetch(...args);
      const response = new Response("{}", { status: 200 });
      // Headers arrive, but the body deliberately ignores abort. Retirement
      // must protect state even when cancelling transport is insufficient.
      const body = new Promise((resolve, reject) => state.resourceLookups.push({ release: resolve, fail: () => reject(new Error("Late fixture failure")), signal: args[1]?.signal }));
      Object.defineProperty(response, "json", { value: () => body });
      return response;
    };
  });
  await page.route("**/api/suggestions", (route) => route.fulfill({ json: { suggestions: [] } }));
  await page.route("**/api/shows", (route) => route.fulfill({ json: { shows: [SHOW_A, SHOW_B] } }));
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("show") === SHOW_B.slug ? SHOW_B : SHOW_A;
    if (route.request().method() === "POST") {
      const posted = route.request().postDataJSON();
      posts.push(posted);
      const songs = posted.songs.map((row: ReturnType<typeof song>) => ({ ...row, updatedAt: "2026-10-02T00:00:00.000Z" }));
      await route.fulfill({ json: { songs, reviewedBase: officialSetRevision(songs), reviewedVersion: "d2f7c5b2-1c2a-41b2-8ca5-8143b590b05b" } });
      return;
    }
    await route.fulfill({ headers: { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" }, json: { show: selected, sets, songs: Array.from({ length: count }, (_, i) => song(i + 1, selected.id)), setWriteVersions: versions } });
  });
  await page.goto(`/?surface=owner&show=${SHOW_A.slug}`);
  await expect(save(page)).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  return { posts };
}
const save = (page: Page) => page.getByRole("button", { name: "Save Rad Dad", exact: true }).last();
async function start(page: Page, row = 0, request = 0) {
  const summary = page.getByText("Details, song resources, and rehearsal notes", { exact: true }).nth(row);
  await summary.click();
  await summary.locator("..").getByRole("button", { name: "Find resources", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.resourceLookups.length)).toBe(request + 1);
}
async function release(page: Page, index = 0, fail = false, payload: unknown = result) {
  await page.evaluate(({ index, fail, payload }) => {
    const lookup = window.resourceLookups[index];
    if (fail) lookup.fail(); else lookup.release(payload);
  }, { index, fail, payload });
  // A browser task after the released promise also flushes React's update.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

test("lookup fills only untouched resource fields; Save is the only write", async ({ page }) => {
  const { posts } = await openOwner(page);
  await start(page);
  await page.getByPlaceholder("Paste a YouTube link", { exact: true }).fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByLabel("Performance cue").fill("Keep my cue");
  await release(page);
  await expect(page.getByPlaceholder("Paste a YouTube link", { exact: true })).toHaveValue("https://youtu.be/dQw4w9WgXcQ");
  await expect(page.getByLabel("Lyrics link")).toHaveValue(result.lyricsUrl);
  await expect(page.getByLabel("Performance cue")).toHaveValue("Keep my cue");
  expect(posts).toHaveLength(0);
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  expect(posts).toHaveLength(1);
  expect((posts[0].songs as ReturnType<typeof song>[])[0]).toMatchObject({ youtubeVideoId: "dQw4w9WgXcQ", lyricsUrl: result.lyricsUrl, performanceNote: "Keep my cue" });
});

test("editing then clearing a resource preserves the deliberate empty value", async ({ page }) => {
  await openOwner(page);
  await start(page);
  await page.getByLabel("Lyrics link").fill("https://fixture.invalid/manual");
  await page.getByLabel("Lyrics link").fill("");
  await release(page);
  await expect(page.getByLabel("Lyrics link")).toHaveValue("");
  await expect(page.getByPlaceholder("Paste a YouTube link", { exact: true })).toHaveValue(result.youtubeUrl);
});

for (const identity of ["Song", "Artist", "Original / hide resources"] as const) {
  test(`changing ${identity} and restoring it retires the lookup`, async ({ page }) => {
    await openOwner(page);
    await start(page);
    if (identity === "Original / hide resources") {
      await page.getByLabel(identity).check();
      await page.getByLabel(identity).uncheck();
    } else {
      const field = page.getByRole("textbox", { name: identity, exact: true });
      const before = await field.inputValue();
      await field.fill("Different identity");
      await field.fill(before);
    }
    await release(page);
    await expect(page.getByLabel("Lyrics link")).toHaveValue("");
    await expect(page.getByPlaceholder("Paste a YouTube link", { exact: true })).toHaveValue("");
    await expect(page.getByText(/YouTube search is ready/)).toHaveCount(0);
    expect(await page.evaluate(() => window.resourceLookups[0].signal?.aborted)).toBe(true);
  });
}

for (const fail of [false, true]) {
  test(`switching away and back ignores a late ${fail ? "failure" : "success"}`, async ({ page }) => {
    const { posts } = await openOwner(page);
    await start(page);
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await expect(save(page)).toBeDisabled();
    await page.getByLabel("Editing show").selectOption(SHOW_A.slug);
    await expect(save(page)).toBeDisabled();
    await release(page, 0, fail);
    await expect(save(page)).toBeDisabled();
    await expect(page.getByText(/Late fixture failure|YouTube search is ready/)).toHaveCount(0);
    await page.getByText("Details, song resources, and rehearsal notes", { exact: true }).click();
    await expect(page.getByLabel("Lyrics link")).toHaveValue("");
    expect(posts).toHaveLength(0);
  });
}

test("changing sets retires lookup even after returning", async ({ page }) => {
  await openOwner(page);
  await start(page);
  await page.getByRole("button", { name: /Stalemate.*0 songs/ }).click();
  await page.getByRole("button", { name: /Rad Dad.*1 song/ }).click();
  await release(page);
  await expect(save(page)).toBeDisabled();
});

test("deletion and undo never revive a retired lookup", async ({ page }) => {
  await openOwner(page);
  await start(page);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: /Undo/ }).click();
  await release(page);
  await page.getByText("Details, song resources, and rehearsal notes", { exact: true }).click();
  await expect(page.getByLabel("Lyrics link")).toHaveValue("");
});

test("an older request cannot overwrite or clear a newer request", async ({ page }) => {
  await openOwner(page, 2);
  await start(page);
  await start(page, 1, 1);
  await release(page);
  await expect(page.getByRole("button", { name: "Finding...", exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Lyrics link").first()).toHaveValue("");
  await release(page, 1);
  await expect(page.getByLabel("Lyrics link").nth(1)).toHaveValue(result.lyricsUrl);
});

test("an empty lookup result leaves a clean set clean", async ({ page }) => {
  await openOwner(page);
  await start(page);
  await release(page, 0, false, {});
  await expect(page.getByRole("button", { name: "Find resources", exact: true })).toBeEnabled();
  await expect(save(page)).toBeDisabled();
});
