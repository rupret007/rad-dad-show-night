import type { Page } from "@playwright/test";
import { buildCoachCheck, parseCoachInput, type CoachInput } from "../../lib/set-coach";
import type { ShowSong } from "../../lib/show-data";
import { test, expect } from "./fixtures";

const OWNER_HEADERS = {
  "X-Rad-Dad-Read-Scope": "owner",
  "X-Rad-Dad-Data-Source": "owner-database",
  "Cache-Control": "private, no-store",
};
const SHOW_A = {
  id: "coach-fixture-a", slug: "coach-fixture-a", title: "Offline coach night A", venue: "Synthetic venue",
  showDate: "2026-10-01", date: "Fixture date", startTime: "", endTime: "", hours: "", expectedWrap: "",
  status: "draft" as const, isDefault: false,
};
const SHOW_B = { ...SHOW_A, id: "coach-fixture-b", slug: "coach-fixture-b", title: "Offline coach night B" };
const SETS = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "9:00-9:20 PM", kicker: "Closer", accent: "lime" },
];
const SONGS: ShowSong[] = [
  {
    id: 101, showId: SHOW_A.id, setSlug: "rad-dad", position: 1, title: "Fixture opening", artist: "Synthetic band",
    transition: false, isOriginal: true, durationSeconds: 180, performanceNote: "Count together", songKey: "D",
    tuning: "Standard", youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "",
    updatedAt: "2026-09-05T00:00:00.000Z",
  },
  {
    id: 102, showId: SHOW_A.id, setSlug: "rad-dad", position: 2, title: "Fixture ending", artist: "Synthetic band",
    transition: true, isOriginal: true, durationSeconds: 180, performanceNote: "Hold the final note", songKey: "D",
    tuning: "Standard", youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "",
    updatedAt: "2026-09-05T00:00:00.000Z",
  },
  {
    id: 201, showId: SHOW_A.id, setSlug: "stalemate", position: 1, title: "Fixture middle set", artist: "Synthetic band",
    transition: false, isOriginal: true, durationSeconds: 240, performanceNote: "", songKey: "G",
    tuning: "Standard", youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "",
    updatedAt: "2026-09-05T00:00:00.000Z",
  },
];

type CoachReply = { status?: number; json: unknown };
type FixtureOptions = {
  window?: "known" | "blank" | "missing" | "duplicate";
  onCoach?: (input: CoachInput, attempt: number) => CoachReply | Promise<CoachReply>;
  beforeSecondShow?: () => Promise<void>;
};
const coach = (page: Page) => page.getByRole("region", { name: "Set Coach", exact: true });
const review = (page: Page) => page.getByRole("region", { name: "Set Coach review", exact: true });
const save = (page: Page) => page.getByRole("button", { name: "Save Rad Dad", exact: true }).last();

async function openOwner(page: Page, options: FixtureOptions = {}) {
  const requests: CoachInput[] = [];
  const mutations: string[] = [];
  await page.route((url) => url.pathname === "/api/suggestions", (route) => route.fulfill({ json: { suggestions: [] } }));
  await page.route((url) => url.pathname === "/api/shows", (route) => {
    if (route.request().method() !== "GET") mutations.push("/api/shows");
    return route.fulfill({ json: { shows: [SHOW_A, SHOW_B] } });
  });
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      mutations.push("/api/show");
      await route.fulfill({ status: 500, json: { error: "Fixture refuses any owner mutation" } });
      return;
    }
    expect(new URL(request.url()).searchParams.get("scope")).toBe("owner");
    const selected = new URL(request.url()).searchParams.get("show") === SHOW_B.slug ? SHOW_B : SHOW_A;
    if (selected === SHOW_B) await options.beforeSecondShow?.();
    const sets = options.window === "blank" ? SETS.map((set) => ({ ...set, time: "" }))
      : options.window === "duplicate" ? [...SETS, { ...SETS[2], time: "9:00-10:00 PM" }]
      : SETS;
    await route.fulfill({ headers: OWNER_HEADERS, json: {
      show: selected,
      ...(options.window === "missing" ? {} : { sets }),
      songs: SONGS.map((song) => ({ ...song, showId: selected.id })),
      setWriteVersions: { "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "initial:0" },
    } });
  });
  await page.route((url) => url.pathname === "/api/coach", async (route) => {
    expect(route.request().method()).toBe("POST");
    const input = route.request().postDataJSON() as CoachInput;
    expect(parseCoachInput(input), "The component must send the API's accepted draft contract").not.toBeNull();
    requests.push(input);
    const result = await options.onCoach?.(input, requests.length) ?? { json: buildCoachCheck(input) };
    await route.fulfill({ status: result.status ?? 200, json: result.json });
  });
  await page.goto(`/?surface=owner&show=${SHOW_A.slug}`);
  await expect(save(page)).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await expect(coach(page)).toContainText(`${SHOW_A.title} at ${SHOW_A.venue} · Rad Dad · 2 songs in this browser draft`);
  return { requests, mutations };
}

async function runReview(page: Page) {
  await coach(page).getByRole("button", { name: /^(Review this set(?: again)?|Retry review)$/ }).click();
}

async function openFirstDetails(page: Page) {
  const details = page.getByText("Details, song resources, and rehearsal notes", { exact: true }).first();
  if (!(await details.evaluate((element) => (element.parentElement as HTMLDetailsElement).open))) await details.click();
}

type DeferredWindow = Window & {
  releaseCoachFixture?: () => void;
  coachFixtureAborted?: () => boolean;
};

async function deferFirstCoachRead(page: Page, phase: "headers" | "body") {
  await page.addInitScript(({ phase }) => {
    const realFetch = window.fetch.bind(window);
    let requests = 0;
    window.fetch = async (...args) => {
      const response = await realFetch(...args);
      const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), window.location.href);
      if (url.pathname !== "/api/coach" || ++requests !== 1) return response;
      const fixtureWindow = window as DeferredWindow;
      fixtureWindow.coachFixtureAborted = () => Boolean(args[1]?.signal?.aborted);
      if (phase === "headers") {
        return new Promise<Response>((resolve) => {
          // The actual local fixture response arrived; only this synthetic
          // browser promise ignores cancellation to prove retirement semantics.
          fixtureWindow.releaseCoachFixture = () => resolve(response);
        });
      }
      const payload = await response.json();
      Object.defineProperty(response, "json", { value: () => new Promise((resolve) => {
        fixtureWindow.releaseCoachFixture = () => resolve(payload);
      }) });
      return response;
    };
  }, { phase });
}

async function waitForDeferredRead(page: Page) {
  await expect.poll(() => page.evaluate(() => typeof (window as DeferredWindow).releaseCoachFixture)).toBe("function");
}

async function releaseDeferredRead(page: Page) {
  await page.evaluate(() => (window as DeferredWindow).releaseCoachFixture?.());
}

test("Coach reviews the current unsaved draft and actual show window without saving or publishing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await openOwner(page);
  await openFirstDetails(page);
  await page.getByLabel("Performance cue", { exact: true }).first().fill("My unsaved closing cue");
  await runReview(page);
  await expect(review(page)).toBeVisible();
  await expect(review(page)).toContainText("6 estimated minutes / 20 scheduled minutes");
  await expect(review(page)).toContainText(/\d+\/100/);
  await expect(review(page)).toContainText(`${SHOW_A.title} at ${SHOW_A.venue} · Rad Dad · 2 songs in this browser draft`);
  expect(fixture.requests).toHaveLength(1);
  expect(fixture.requests[0]).toMatchObject({
    showId: SHOW_A.id, showSlug: SHOW_A.slug, showTitle: `${SHOW_A.title} at ${SHOW_A.venue}`,
    setSlug: "rad-dad", setTime: "9:00-9:20 PM",
  });
  expect(fixture.requests[0]?.requestId).toBeTruthy();
  expect(fixture.requests[0]?.songs.map((song) => song.id)).toEqual([101, 102]);
  expect(fixture.requests[0]?.songs[0]?.performanceNote).toBe("My unsaved closing cue");
  await expect(page.getByLabel("Performance cue", { exact: true }).first()).toHaveValue("My unsaved closing cue");
  await expect(save(page)).toBeEnabled();
  expect(fixture.mutations).toEqual([]);
  await coach(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("coach-desktop.png") });
});

test("completed advice is retired by title, cue and order edits and cannot return after a set round trip", async ({ page }) => {
  const fixture = await openOwner(page);
  const edit = [
    async () => { await page.getByLabel("Song", { exact: true }).first().fill("Unsaved renamed opening"); },
    async () => { await openFirstDetails(page); await page.getByLabel("Performance cue", { exact: true }).first().fill("A different count-in"); },
    async () => { await page.getByRole("button", { name: "Move down", exact: true }).first().click(); },
  ];
  for (const change of edit) {
    await runReview(page); await expect(review(page)).toBeVisible();
    const attempts = fixture.requests.length;
    await change();
    await expect(review(page)).toHaveCount(0);
    await expect(coach(page).getByRole("button", { name: "Review this set again", exact: true })).toBeEnabled();
    expect(fixture.requests).toHaveLength(attempts);
    await expect(save(page)).toBeEnabled();
  }
  await runReview(page); await expect(review(page)).toBeVisible();
  await page.getByRole("navigation", { name: "Choose a set to edit" }).getByRole("button", { name: /Stalemate/ }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(coach(page)).toContainText("Stalemate · 1 songs in this browser draft");
  await page.getByRole("navigation", { name: "Choose a set to edit" }).getByRole("button", { name: /Rad Dad/ }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByLabel("Song", { exact: true }).nth(1)).toHaveValue("Unsaved renamed opening");
  expect(fixture.requests).toHaveLength(4);
  expect(fixture.mutations).toEqual([]);
});

test("a late review for another set is aborted and cannot attach itself to the selected set", async ({ page }) => {
  await deferFirstCoachRead(page, "headers");
  const fixture = await openOwner(page);
  await runReview(page); await waitForDeferredRead(page);
  await expect(coach(page).getByRole("button", { name: "Reviewing...", exact: true })).toBeDisabled();
  await expect(save(page)).toBeDisabled();
  await page.getByRole("navigation", { name: "Choose a set to edit" }).getByRole("button", { name: /Stalemate/ }).click();
  await expect.poll(() => page.evaluate(() => (window as DeferredWindow).coachFixtureAborted?.())).toBe(true);
  await releaseDeferredRead(page);
  await expect(review(page)).toHaveCount(0);
  await expect(coach(page)).toContainText("Stalemate · 1 songs in this browser draft");
  expect(fixture.requests).toHaveLength(1);
  await runReview(page); await expect(review(page)).toContainText("Stalemate · 1 songs in this browser draft");
  expect(fixture.requests[1]?.setSlug).toBe("stalemate");
  expect(fixture.mutations).toEqual([]);
});

test("show loading unmounts Coach and retires a late body before the next show is loaded", async ({ page }) => {
  await deferFirstCoachRead(page, "body");
  let releaseShow: (() => void) | undefined;
  const showGate = new Promise<void>((resolve) => { releaseShow = resolve; });
  const fixture = await openOwner(page, { beforeSecondShow: () => showGate });
  await runReview(page); await waitForDeferredRead(page);
  await page.getByLabel("Editing show", { exact: true }).selectOption(SHOW_B.slug);
  await expect(page.getByText("Loading official sets...", { exact: true })).toBeVisible();
  await expect(coach(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as DeferredWindow).coachFixtureAborted?.())).toBe(true);
  await releaseDeferredRead(page);
  releaseShow?.();
  await expect(coach(page)).toContainText(SHOW_B.title);
  await expect(review(page)).toHaveCount(0);
  expect(fixture.requests).toHaveLength(1);
  await runReview(page); await expect(review(page)).toContainText(SHOW_B.title);
  expect(fixture.requests[1]?.showId).toBe(SHOW_B.id);
  expect(fixture.mutations).toEqual([]);
});

for (const window of ["blank", "missing", "duplicate"] as const) {
  test(`${window} set timing never borrows canonical minutes or invents a timing score`, async ({ page }, testInfo) => {
    if (window === "blank") await page.setViewportSize({ width: 320, height: 900 });
    const fixture = await openOwner(page, { window });
    await runReview(page);
    await expect(review(page)).toContainText("Timing not scored");
    await expect(review(page)).toContainText("6 estimated minutes / Scheduled window unknown");
    await expect(review(page)).toContainText("No verified set window");
    await expect(review(page)).not.toContainText("/100");
    await expect(review(page)).not.toContainText("60 scheduled minutes");
    expect(fixture.requests[0]?.setTime).toBe("");
    expect(fixture.mutations).toEqual([]);
    if (window === "blank") {
      await coach(page).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("coach-unknown-320.png") });
    }
  });
}

for (const failure of ["unavailable", "unconfirmed 202", "malformed", "mismatched echo"] as const) {
  test(`${failure} review retains the draft and requires one explicit retry`, async ({ page }) => {
    await page.clock.install();
    const fixture = await openOwner(page, { onCoach: (input, attempt) => {
      if (attempt > 1) return { json: buildCoachCheck(input) };
      if (failure === "unavailable") return { status: 503, json: { error: "Offline fixture unavailable" } };
      if (failure === "unconfirmed 202") return { status: 202, json: buildCoachCheck(input) };
      if (failure === "malformed") return { json: { score: 99 } };
      return { json: { ...buildCoachCheck(input), requestId: "another-review-receipt" } };
    } });
    await page.getByLabel("Song", { exact: true }).first().fill("Unsaved title kept after failure");
    await runReview(page);
    await expect(coach(page).getByRole("button", { name: "Retry review", exact: true })).toBeEnabled();
    await expect(review(page)).toHaveCount(0);
    await expect(page.getByLabel("Song", { exact: true }).first()).toHaveValue("Unsaved title kept after failure");
    await expect(save(page)).toBeEnabled();
    await page.clock.fastForward(1000);
    expect(fixture.requests).toHaveLength(1);
    await runReview(page); await expect(review(page)).toBeVisible();
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[1]?.requestId).not.toBe(fixture.requests[0]?.requestId);
    expect(fixture.mutations).toEqual([]);
  });
}

for (const phase of ["headers", "body"] as const) {
  test(`the review deadline covers stalled ${phase} and a retired response cannot overwrite a manual retry`, async ({ page }) => {
    await page.clock.install();
    await deferFirstCoachRead(page, phase);
    const fixture = await openOwner(page, { onCoach: (input, attempt) => {
      const result = buildCoachCheck(input);
      if (attempt === 1) result.findings[0].detail = "Retired first request advice";
      return { json: result };
    } });
    await page.getByLabel("Song", { exact: true }).first().fill("Unsaved timed-out draft");
    await runReview(page); await waitForDeferredRead(page);
    await expect(coach(page).getByRole("button", { name: "Reviewing...", exact: true })).toBeDisabled();
    await expect(save(page)).toBeEnabled();
    await page.clock.fastForward(10_100);
    await expect(coach(page)).toContainText("The review timed out. Your draft is kept.");
    await expect(coach(page).getByRole("button", { name: "Retry review", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Song", { exact: true }).first()).toHaveValue("Unsaved timed-out draft");
    expect(fixture.requests).toHaveLength(1);
    await runReview(page); await expect(review(page)).toBeVisible();
    await releaseDeferredRead(page);
    await expect(review(page)).not.toContainText("Retired first request advice");
    await expect(coach(page)).toContainText("Review ready for the draft shown here.");
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.mutations).toEqual([]);
  });
}
