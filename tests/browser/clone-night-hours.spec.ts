import type { Page } from "@playwright/test";
import type { ShowSong } from "../../lib/show-data";
import { test, expect } from "./fixtures";

const OWNER_HEADERS = {
  "X-Rad-Dad-Read-Scope": "owner",
  "X-Rad-Dad-Data-Source": "owner-database",
  "Cache-Control": "private, no-store",
};
const SOURCE = {
  id: "clone-hours-source",
  slug: "clone-hours-source",
  title: "Offline clone-hours source",
  venue: "Synthetic venue",
  showDate: "2026-09-19",
  date: "Fixture date",
  startTime: "7:00 PM",
  endTime: "10:00 PM",
  hours: "7:00 PM-10:00 PM",
  expectedWrap: "Expected wrap near 10:00 PM",
  status: "published" as const,
  isDefault: false,
};
const EMPTY = {
  ...SOURCE,
  id: "clone-hours-empty",
  slug: "clone-hours-empty",
  title: "Offline empty clone",
  venue: "Other venue",
  showDate: "2026-10-31",
  date: "Saturday, October 31, 2026",
  startTime: "",
  endTime: "",
  hours: "",
  expectedWrap: "",
  status: "draft" as const,
};
const SETS = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "7:00-7:35 PM", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
];

function song(id: number, extra: Partial<ShowSong> = {}): ShowSong {
  return {
    id,
    showId: SOURCE.id,
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

async function openOwner(page: Page, onClone?: (body: Record<string, unknown>) => void) {
  const clones: Record<string, unknown>[] = [];
  await page.route((url) => url.pathname === "/api/suggestions", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
  await page.route((url) => url.pathname === "/api/shows", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: { shows: [SOURCE] } });
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    clones.push(body);
    onClone?.(body);
    if (body.action !== "clone") {
      await route.fulfill({ status: 500, json: { error: "Fixture refuses any non-clone mutation" } });
      return;
    }
    await route.fulfill({ status: 201, json: { show: EMPTY } });
  });
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fulfill({ status: 500, json: { error: "Fixture refuses any owner set write" } });
      return;
    }
    const show = new URL(request.url()).searchParams.get("show") === EMPTY.slug ? EMPTY : SOURCE;
    const sets = show.slug === EMPTY.slug
      ? SETS.map((set) => ({ ...set, time: "" }))
      : SETS;
    await route.fulfill({
      headers: OWNER_HEADERS,
      json: {
        show,
        sets,
        songs: show.slug === EMPTY.slug ? [] : [song(11)],
        setWriteVersions: {
          "jeff-story-friends": "initial:0",
          stalemate: "initial:0",
          "rad-dad": "initial:0",
        },
      },
    });
  });
  await page.goto(`/?surface=owner&show=${SOURCE.slug}`);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
  return clones;
}

test("Show Control names this night's hours and clones an empty night without inherited clocks", async ({ page }) => {
  const clones = await openOwner(page);
  await expect(page.locator("[data-show-hours='set']")).toContainText("7:00 PM-10:00 PM");
  await page.getByRole("button", { name: "Clone show" }).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create draft" }) });
  await expect(form).toContainText("does not inherit songs, set times, or night hours");
  await form.getByLabel("New show title").fill("Offline empty clone");
  await form.getByLabel("New show venue").fill("Other venue");
  await form.getByLabel("New show date").fill("2026-10-31");
  await expect(form.getByLabel("New show start time")).toHaveValue("");
  await expect(form.getByLabel("New show end time")).toHaveValue("");
  await form.getByLabel("Copy official songs and set times into the draft").uncheck();
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect.poll(() => clones.length).toBe(1);
  expect(clones[0]).toMatchObject({
    action: "clone",
    sourceSlug: SOURCE.slug,
    copySongs: false,
    startTime: "",
    endTime: "",
  });
  await expect(page.locator("[data-show-hours='unset']")).toContainText("Hours not set for this night");
  await expect(page.locator("[data-show-hours='unset']")).toContainText("Another show's start or wrap will not appear here");
  await expect(page.getByText("7:00 PM-10:00 PM")).toHaveCount(0);
  await expect(page.getByText("does not inherit another show's songs, set times, or night hours")).toBeVisible();
});

test("a clone form with both hours sends those clocks and stays readable on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const clones = await openOwner(page);
  await page.getByRole("button", { name: "Clone show" }).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create draft" }) });
  await form.getByLabel("New show date").fill("2026-10-31");
  await form.getByLabel("New show start time").fill("8:00 PM");
  await form.getByLabel("New show end time").fill("11:00 PM");
  await form.getByLabel("Copy official songs and set times into the draft").uncheck();
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect.poll(() => clones.length).toBe(1);
  expect(clones[0]).toMatchObject({
    copySongs: false,
    startTime: "8:00 PM",
    endTime: "11:00 PM",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

for (const copySongs of [false, true]) {
  for (const supplied of ["start", "end"] as const) {
    test(`clone with copy=${copySongs} keeps a lone ${supplied} time for correction`, async ({ page }) => {
      const clones = await openOwner(page);
      await page.getByRole("button", { name: "Clone show" }).click();
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create draft" }) });
      await form.getByLabel("New show title").fill("Keep my new night");
      await form.getByLabel("New show date").fill("2026-10-31");
      await form.getByLabel("Copy official songs and set times into the draft").setChecked(copySongs);
      const entered = form.getByLabel(`New show ${supplied} time`);
      const missing = form.getByLabel(`New show ${supplied === "start" ? "end" : "start"} time`);
      await entered.fill(supplied === "start" ? "8:00 PM" : "11:00 PM");
      await missing.fill("   ");
      await form.getByRole("button", { name: "Create draft" }).click();
      await expect(form.getByRole("alert")).toContainText("No draft was created");
      await expect(missing).toBeFocused();
      await expect(entered).toHaveValue(supplied === "start" ? "8:00 PM" : "11:00 PM");
      await expect(form.getByLabel("New show title")).toHaveValue("Keep my new night");
      await expect(form.getByLabel("New show date")).toHaveValue("2026-10-31");
      expect(clones).toEqual([]);
      if (copySongs && supplied === "end") {
        await page.getByRole("button", { name: "Clone show" }).click();
        await page.getByRole("button", { name: "Clone show" }).click();
        await expect(form.getByRole("alert")).toHaveCount(0);
        await expect(entered).toHaveValue("");
        return;
      }
      await missing.fill(supplied === "start" ? "11:00 PM" : "8:00 PM");
      await expect(form.getByRole("alert")).toHaveCount(0);
      await form.getByRole("button", { name: "Create draft" }).click();
      await expect.poll(() => clones.length).toBe(1);
      expect(clones[0]).toMatchObject({ title: "Keep my new night", copySongs, startTime: "8:00 PM", endTime: "11:00 PM" });
    });
  }
}

test("clearing a lone clock allows an optional-hours empty draft", async ({ page }) => {
  const clones = await openOwner(page);
  await page.getByRole("button", { name: "Clone show" }).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create draft" }) });
  await form.getByLabel("New show date").fill("2026-10-31");
  await form.getByLabel("Copy official songs and set times into the draft").uncheck();
  await form.getByLabel("New show start time").fill("8:00 PM");
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  expect(clones).toEqual([]);
  await form.getByLabel("New show start time").fill("");
  await form.getByRole("button", { name: "Create draft" }).click();
  await expect.poll(() => clones.length).toBe(1);
  expect(clones[0]).toMatchObject({ copySongs: false, startTime: "", endTime: "" });
});
