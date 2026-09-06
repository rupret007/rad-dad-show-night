import type { Page } from "@playwright/test";
import type { ShowSong } from "../../lib/show-data";
import { test, expect } from "./fixtures";

const OWNER_HEADERS = {
  "X-Rad-Dad-Read-Scope": "owner",
  "X-Rad-Dad-Data-Source": "owner-database",
  "Cache-Control": "private, no-store",
};
const SHOW = {
  id: "public-review-fixture",
  slug: "public-review-fixture",
  title: "Offline public-review night",
  venue: "Synthetic venue",
  showDate: "2026-10-01",
  date: "Fixture date",
  startTime: "",
  endTime: "",
  hours: "",
  expectedWrap: "",
  status: "draft" as const,
  isDefault: false,
};
const SETS = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
];

function song(id: number, extra: Partial<ShowSong> = {}): ShowSong {
  return {
    id,
    showId: SHOW.id,
    setSlug: "rad-dad",
    position: 1,
    title: "Fixture closer",
    artist: "Synthetic band",
    transition: false,
    isOriginal: false,
    durationSeconds: 180,
    performanceNote: "",
    songKey: "G",
    tuning: "",
    youtubeUrl: "",
    youtubeVideoId: "",
    chordsUrl: "",
    lyricsUrl: "",
    rehearsalNotes: "",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...extra,
  };
}

const SONGS: ShowSong[] = [
  song(11, {
    title: "Fixture original",
    isOriginal: true,
    rehearsalNotes: "Count the last bar together",
  }),
  song(12, {
    position: 2,
    title: "Fixture search cover",
    youtubeUrl: "https://www.youtube.com/results?search_query=fixture+cover",
    lyricsUrl: "https://genius.com/search?q=fixture+cover",
  }),
  song(13, {
    position: 3,
    title: "Fixture saved cover",
    youtubeUrl: "https://www.youtube.com/watch?v=NUTGr5t3MoY",
    youtubeVideoId: "NUTGr5t3MoY",
    lyricsUrl: "https://genius.com/green-day-basket-case-lyrics",
  }),
];

async function openOwner(page: Page) {
  const mutations: string[] = [];
  await page.route((url) => url.pathname === "/api/suggestions", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
  await page.route((url) => url.pathname === "/api/shows", (route) => {
    if (route.request().method() !== "GET") mutations.push("/api/shows");
    return route.fulfill({ json: { shows: [SHOW] } });
  });
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      mutations.push("/api/show");
      await route.fulfill({ status: 500, json: { error: "Fixture refuses any owner mutation" } });
      return;
    }
    expect(new URL(request.url()).searchParams.get("scope")).toBe("owner");
    await route.fulfill({
      headers: OWNER_HEADERS,
      json: {
        show: SHOW,
        sets: SETS,
        songs: SONGS,
        setWriteVersions: {
          "jeff-story-friends": "initial:0",
          stalemate: "initial:0",
          "rad-dad": "initial:0",
        },
      },
    });
  });
  await page.goto(`/?surface=owner&show=${SHOW.slug}`);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
  return mutations;
}

const publicReview = (page: Page) => page.getByRole("region", { name: "Public list review", exact: true });

function songCard(page: Page, title: string) {
  return page.getByRole("article").filter({ has: page.getByDisplayValue(title, { exact: true }) });
}

test("Show Control reviews the public list instead of presenting search as saved media", async ({ page }) => {
  const mutations = await openOwner(page);
  await expect(publicReview(page)).toContainText("3 songs in this browser draft");
  await expect(publicReview(page)).toContainText("1 song shows saved YouTube on the public list");
  await expect(publicReview(page)).toContainText("1 original hides both");
  await expect(publicReview(page)).toContainText("1 cover keeps search links in Show Control");
  await expect(publicReview(page)).toContainText("Rehearsal notes stay in Show Control");

  const original = songCard(page, "Fixture original");
  const searchCover = songCard(page, "Fixture search cover");
  const savedCover = songCard(page, "Fixture saved cover");
  await expect(page.getByTestId("owner-public-song-review")).toHaveCount(3);
  await expect(original.getByTestId("owner-public-song-review")).toContainText("Original — public list hides YouTube and lyrics");
  await expect(original.getByRole("link", { name: /YouTube|lyrics/i })).toHaveCount(0);
  await expect(searchCover.getByRole("link", { name: "Search YouTube" })).toBeVisible();
  await expect(searchCover.getByRole("link", { name: "Search lyrics" })).toBeVisible();
  await expect(searchCover.getByRole("link", { name: "Open saved YouTube" })).toHaveCount(0);
  await expect(searchCover.getByTestId("owner-public-song-review")).toContainText("Search links stay in Show Control");
  await expect(savedCover.getByRole("link", { name: "Open saved YouTube" })).toBeVisible();
  await expect(savedCover.getByRole("link", { name: "Open saved lyrics" })).toBeVisible();
  await expect(savedCover.getByTestId("owner-public-song-review")).toContainText("Public list shows saved YouTube and lyrics");
  expect(mutations).toEqual([]);
});

test("marking a cover original retires public media and search links", async ({ page }) => {
  await openOwner(page);
  const savedCover = songCard(page, "Fixture saved cover");
  await savedCover.getByLabel("Original / hide resources").check();
  await expect(savedCover.getByTestId("owner-public-song-review")).toContainText("Original — public list hides YouTube and lyrics");
  await expect(savedCover.getByRole("link", { name: /YouTube|lyrics/i })).toHaveCount(0);
  await expect(publicReview(page)).toContainText("no saved YouTube on the public list");
  await expect(publicReview(page)).toContainText("2 originals hide both");
});

test("an empty leftover set reviews as empty and never borrows another night", async ({ page }) => {
  await openOwner(page);
  await page.getByRole("button", { name: /Opening.*Jeff Story & Friends/ }).click();
  await expect(publicReview(page)).toContainText("Add a song to review what the public list will show");
  await expect(publicReview(page)).toContainText("An empty set stays empty");
  await expect(publicReview(page)).not.toContainText("saved YouTube");
  await expect(publicReview(page)).not.toContainText("Heart-Shaped Box");
});

test("public-list review stays readable on a 320px owner phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openOwner(page);
  await expect(publicReview(page)).toBeVisible();
  await expect(page.getByTestId("owner-public-song-review").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
