import type { Page } from "@playwright/test";
import { officialSetRevision } from "../../lib/owner-set-save";
import { test, expect } from "./fixtures";

const VERSION_A = "11111111-1111-4111-8111-111111111111";
const VERSION_B = "22222222-2222-4222-8222-222222222222";
const VERSION_C = "33333333-3333-4333-8333-333333333333";
const OWNER_HEADERS = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database", "Cache-Control": "private, no-store" };
const versions = (rad = VERSION_A) => ({ "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": rad });
type FixtureResponse = { status?: number; json: unknown; headers?: Record<string, string> };

const SHOW_A = {
  id: "owner-save-fixture-a",
  slug: "owner-save-fixture-a",
  title: "Offline save fixture A",
  venue: "Fixture venue",
  showDate: "2026-10-01",
  date: "Fixture date",
  startTime: "",
  endTime: "",
  hours: "",
  expectedWrap: "",
  status: "draft" as const,
  isDefault: false,
};

const SHOW_B = {
  ...SHOW_A,
  id: "owner-save-fixture-b",
  slug: "owner-save-fixture-b",
  title: "Offline save fixture B",
};

const SETS = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
];

function song(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    showId: SHOW_A.id,
    setSlug: "rad-dad",
    position: 1,
    title: "Fixture closer",
    artist: "Offline band",
    transition: false,
    isOriginal: false,
    durationSeconds: 180,
    performanceNote: "Count in together",
    songKey: "G",
    tuning: "",
    youtubeUrl: "",
    youtubeVideoId: "",
    chordsUrl: "",
    lyricsUrl: "",
    rehearsalNotes: "",
    updatedAt: "2026-09-05T00:00:00.000Z",
    ...extra,
  };
}

async function mockSuggestions(page: Page) {
  await page.route((url) => url.pathname === "/api/suggestions", (route) =>
    route.fulfill({ json: { suggestions: [] } }),
  );
}

async function openOwner(
  page: Page,
  {
    shows = [SHOW_A],
    songs = [song(11)],
    onPost,
    onGet,
    expectVerified = true,
  }: {
    shows?: typeof SHOW_A[];
    songs?: ReturnType<typeof song>[];
    onPost?: (posted: Record<string, unknown>) => Promise<{ status?: number; json: unknown }> | { status?: number; json: unknown };
    onGet?: (count: number, requested: string) => Promise<FixtureResponse> | FixtureResponse;
    expectVerified?: boolean;
  } = {},
) {
  const show = shows[0];
  let reads = 0;
  await mockSuggestions(page);
  await page.route((url) => url.pathname === "/api/shows", (route) =>
    route.fulfill({ json: { shows } }),
  );
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      expect(new URL(request.url()).searchParams.get("scope")).toBe("owner");
      const requested = new URL(request.url()).searchParams.get("show") || show.slug;
      const selected = shows.find((item) => item.slug === requested) ?? show;
      reads += 1;
      if (onGet) {
        const result = await onGet(reads, requested);
        await route.fulfill({ status: result.status ?? 200, json: result.json, headers: result.headers ?? OWNER_HEADERS });
        return;
      }
      await route.fulfill({
        headers: OWNER_HEADERS,
        json: {
          show: selected,
          sets: SETS,
          songs: selected.slug === SHOW_A.slug ? songs : [],
          setWriteVersions: versions(),
        },
      });
      return;
    }
    if (request.method() !== "POST") {
      await route.fulfill({ status: 405, json: { error: "Method not allowed" } });
      return;
    }
    const posted = request.postDataJSON() as Record<string, unknown>;
    if (onPost) {
      const result = await onPost(posted);
      await route.fulfill({ status: result.status ?? 200, json: result.json });
      return;
    }
    const postedSongs = (posted.songs as ReturnType<typeof song>[]).map((item, index) => ({
      ...item,
      id: typeof item.id === "number" ? item.id : 90 + index,
      showId: SHOW_A.id,
      setSlug: "rad-dad",
      updatedAt: "2026-09-05T01:00:00.000Z",
    }));
    await route.fulfill({
      json: {
        songs: postedSongs,
        reviewedBase: officialSetRevision(postedSongs),
        reviewedVersion: VERSION_B,
      },
    });
  });
  await page.goto(`/?surface=owner&show=${show.slug}`);
  if (expectVerified) await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
}

function ownerPayload(songs = [song(11)], version = VERSION_A, show = SHOW_A) {
  return { show, sets: SETS, songs, setWriteVersions: versions(version) };
}

async function editCue(page: Page, text = "My local ending") {
  await page.getByText("Details, song resources, and rehearsal notes").first().click();
  await page.getByLabel("Performance cue").first().fill(text);
}

async function saveActive(page: Page) {
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
}

async function checkActive(page: Page) {
  await page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first().click();
}

test("later edits typed during Save stay unsaved after the sent list writes", async ({ page }, testInfo) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const posts: Array<Record<string, unknown>> = [];
  await openOwner(page, {
    onPost: async (posted) => {
      posts.push(posted);
      await gate;
      const saved = [
        song(11, {
          performanceNote: posted.songs ? (posted.songs as ReturnType<typeof song>[])[0]?.performanceNote : "",
          updatedAt: "2026-09-05T01:00:00.000Z",
        }),
      ];
      return { json: { songs: saved, reviewedBase: officialSetRevision(saved), reviewedVersion: VERSION_B } };
    },
  });

  await page.getByText("Details, song resources, and rehearsal notes").click();
  await page.getByLabel("Performance cue").fill("Count in together - send");
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
  await expect(page.getByText(/Saving Rad Dad/)).toBeVisible();
  await page.getByLabel("Performance cue").fill("Hold the ending");
  release?.();
  await expect(page.getByText(/Later edits on this set are still unsaved/)).toBeVisible();
  await expect(page.getByLabel("Performance cue")).toHaveValue("Hold the ending");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
  expect(posts[0]?.reviewedBase).toBe(officialSetRevision([song(11)]));
  expect(posts[0]?.reviewedVersion).toBe(VERSION_A);
  await page.screenshot({ path: testInfo.outputPath("owner-save-later-edits.png"), fullPage: true });
});

test("an unverified committed write blocks Save until Check confirms the official list", async ({ page }, testInfo) => {
  let posts = 0;
  await openOwner(page, {
    onPost: () => {
      posts += 1;
      return {
        status: 202,
        json: {
          written: true,
          error: "The set was written, but the official list could not be verified.",
        },
      };
    },
  });

  await page.getByText("Details, song resources, and rehearsal notes").click();
  await page.getByLabel("Performance cue").fill("Hold the ending");
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
  await expect(page.getByText(/could not be verified|Check that saved list before saving again/i)).toBeVisible();
  await expect(page.locator("[data-save-hold='uncertain']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first()).toBeVisible();
  expect(posts).toBe(1);

  await page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Saved set comparison" })).toBeVisible();
  await expect(page.getByLabel("Performance cue")).toHaveValue("Hold the ending");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
  expect(posts).toBe(1);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("owner-save-check-kept-draft.png"), fullPage: true });
});

test("a stale reviewed-base conflict keeps the draft until Check loads the newer list", async ({ page }) => {
  await openOwner(page, {
    onPost: () => ({
      status: 409,
      json: { error: "This set changed since you last loaded it." },
    }),
  });

  await page.getByText("Details, song resources, and rehearsal notes").click();
  await page.getByLabel("Performance cue").fill("Hold the ending");
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
  await expect(page.getByText(/changed since you last loaded it/)).toBeVisible();
  await expect(page.locator("[data-save-hold='conflict']")).toBeVisible();
  await page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Saved set comparison" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
  await expect(page.getByText(/Saving now writes this draft/)).toBeVisible();
  await expect(page.getByLabel("Performance cue")).toHaveValue("Hold the ending");
});

test("Undo remove stays bound to the show that removed the song", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await openOwner(page, { shows: [SHOW_A, SHOW_B] });
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Undo remove", exact: true })).toBeVisible();
  await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
  await expect(page.getByRole("button", { name: "Undo remove", exact: true })).toHaveCount(0);
  await expect(page.getByText("Fixture closer")).toHaveCount(0);
});

test("phone next action becomes Check saved after an uncertain write", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOwner(page, {
    onPost: () => ({
      status: 202,
      json: { written: true, error: "The official list could not be verified." },
    }),
  });
  await page.getByText("Details, song resources, and rehearsal notes").click();
  await page.getByLabel("Performance cue").fill("Hold the ending");
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
  const next = page.locator("[data-next-action='check-saved-set']");
  await expect(next.getByRole("button", { name: "Check saved Rad Dad", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-save-hold-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("a competing saved list is reviewed at phone widths before an explicit whole-set replacement", async ({ page }, testInfo) => {
  const winner = [song(22, { title: "Other owner's closer", performanceNote: "New saved cue", rehearsalNotes: "Private fixture note", updatedAt: "2026-09-05T02:00:00.000Z" })];
  const posts: Array<Record<string, unknown>> = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await openOwner(page, {
    onGet: (count) => ({ json: count === 1 ? ownerPayload() : ownerPayload(winner, VERSION_B) }),
    onPost: (posted) => {
      posts.push(posted);
      if (posts.length === 1) return { status: 409, json: { error: "This set changed since you last loaded it." } };
      const saved = (posted.songs as ReturnType<typeof song>[]).map((row, index) => song(90 + index, { ...row, id: 90 + index, updatedAt: "2026-09-05T03:00:00.000Z" }));
      return { json: { songs: saved, reviewedBase: officialSetRevision(saved), reviewedVersion: VERSION_C } };
    },
  });
  await editCue(page);
  await saveActive(page);
  await checkActive(page);
  const review = page.getByRole("region", { name: "Saved set comparison" });
  await expect(review).toBeVisible();
  await expect(review.getByRole("region", { name: "Checked saved list" })).toContainText("Other owner's closer");
  await expect(review.getByRole("region", { name: "Your browser draft" })).toContainText("My local ending");
  await expect(page.getByTestId("owner-recreate-warning")).toContainText("Fixture closer");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish saved show", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Archive show", exact: true })).toBeDisabled();
  await page.getByLabel("Performance cue").fill("Later local cue during review");
  await expect(review.getByRole("region", { name: "Your browser draft" })).toContainText("Later local cue during review");
  expect(posts).toHaveLength(1);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await review.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`owner-competing-review-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Review saved Rad Dad", exact: true }).first().click();
    await expect(review).toBeFocused();
    const heading = await review.getByRole("heading", { name: "Review saved Rad Dad", exact: true }).boundingBox();
    expect(heading?.y).toBeGreaterThanOrEqual(90);
    await page.screenshot({ path: testInfo.outputPath(`owner-review-viewport-${width}.png`) });
    await review.screenshot({ path: testInfo.outputPath(`owner-review-panel-${width}.png`) });
  }
  await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
  expect(posts).toHaveLength(1);
  await expect(review).toHaveCount(0);
  await saveActive(page);
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]?.reviewedVersion).toBe(VERSION_B);
  expect(posts[1]?.reviewedBase).toBe(officialSetRevision(winner));
  const resent = posts[1]?.songs as ReturnType<typeof song>[];
  expect(resent).toHaveLength(1);
  expect(resent[0]?.id).toMatch(/^draft-/);
  expect(resent[0]?.performanceNote).toBe("Later local cue during review");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
});

test("Use saved list adopts the checked winner without writing or retaining discarded edits", async ({ page }) => {
  const winner = [song(11, { performanceNote: "Winning saved cue", durationSeconds: 240, updatedAt: "2026-09-05T02:00:00.000Z" })];
  let posts = 0;
  await openOwner(page, {
    onGet: (count) => ({ json: count === 1 ? ownerPayload() : ownerPayload(winner, VERSION_B) }),
    onPost: () => { posts += 1; return { status: 409, json: { error: "This set changed since you last loaded it." } }; },
  });
  await editCue(page);
  await saveActive(page);
  await checkActive(page);
  await page.getByRole("button", { name: "Use saved list", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved set comparison" })).toHaveCount(0);
  await expect(page.getByLabel("Performance cue")).toHaveValue("Winning saved cue");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await expect(page.getByText(/No write was made/)).toBeVisible();
  expect(posts).toBe(1);
});

test("an unsuccessful second Check invalidates old choices but retains later draft edits", async ({ page }) => {
  const winner = [song(11, { performanceNote: "Winning saved cue", updatedAt: "2026-09-05T02:00:00.000Z" })];
  let posts = 0;
  await openOwner(page, {
    onGet: (count) => count === 3 ? { status: 503, json: { error: "Fixture unavailable" } }
      : { json: count === 1 ? ownerPayload() : ownerPayload(winner, VERSION_B) },
    onPost: () => { posts += 1; return { status: 409, json: { error: "This set changed since you last loaded it." } }; },
  });
  await editCue(page);
  await saveActive(page);
  await checkActive(page);
  const review = page.getByRole("region", { name: "Saved set comparison" });
  await page.getByLabel("Performance cue").fill("Keep this later draft");
  await review.getByRole("button", { name: "Check saved Rad Dad", exact: true }).click();
  await expect(review.getByRole("alert")).toContainText("not current");
  await expect(review.getByRole("button", { name: "Keep my draft", exact: true })).toBeDisabled();
  await expect(review.getByRole("button", { name: "Use saved list", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Performance cue")).toHaveValue("Keep this later draft");
  await review.getByRole("button", { name: "Check saved Rad Dad", exact: true }).click();
  await expect(review.getByRole("button", { name: "Keep my draft", exact: true })).toBeEnabled();
  expect(posts).toBe(1);
});

const BAD_OWNER_READS: Array<{ name: string; payload: () => unknown; headers?: Record<string, string> }> = [
  { name: "missing write versions", payload: () => ({ ...ownerPayload(), setWriteVersions: undefined }) },
  { name: "malformed write version", payload: () => ({ ...ownerPayload(), setWriteVersions: versions("not-a-receipt") }) },
  { name: "wrong-show receipt", payload: () => ownerPayload([song(11, { showId: SHOW_B.id })], VERSION_B, SHOW_B) },
  { name: "public response headers", payload: () => ownerPayload(), headers: { "X-Rad-Dad-Data-Source": "database" } },
  { name: "missing owner response headers", payload: () => ownerPayload(), headers: {} },
  { name: "offline cached owner response", payload: () => ownerPayload(), headers: { ...OWNER_HEADERS, "X-Rad-Dad-Offline": "1" } },
];
for (const bad of BAD_OWNER_READS) {
  test(`Check refuses ${bad.name} without releasing the draft hold`, async ({ page }) => {
    let posts = 0;
    await openOwner(page, {
      onGet: (count) => count === 1 ? { json: ownerPayload() } : { json: bad.payload(), headers: bad.headers },
      onPost: () => { posts += 1; return { status: 202, json: { written: true, error: "The official list could not be verified." } }; },
    });
    await editCue(page);
    await saveActive(page);
    await checkActive(page);
    await expect(page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first()).toBeEnabled();
    await expect(page.getByRole("region", { name: "Saved set comparison" })).toHaveCount(0);
    await expect(page.getByLabel("Performance cue")).toHaveValue("My local ending");
    await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publish saved show", exact: true })).toBeDisabled();
    expect(posts).toBe(1);
  });
}

test("initial cached owner rows and receipts never enable the editor", async ({ page }) => {
  await openOwner(page, {
    expectVerified: false,
    onGet: () => ({ json: ownerPayload(), headers: { ...OWNER_HEADERS, "X-Rad-Dad-Offline": "1" } }),
  });
  await expect(page.getByText(/Could not verify the current owner set data/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true })).toHaveCount(0);
});

test("a save response reusing its old write version remains uncertain", async ({ page }) => {
  await openOwner(page, {
    onPost: (posted) => {
      const saved = (posted.songs as ReturnType<typeof song>[]).map((row) => ({ ...row, updatedAt: "2026-09-05T02:00:00.000Z" }));
      return { json: { songs: saved, reviewedBase: officialSetRevision(saved), reviewedVersion: VERSION_A } };
    },
  });
  await editCue(page);
  await saveActive(page);
  await expect(page.locator("[data-save-hold='uncertain']")).toBeVisible();
  await expect(page.getByLabel("Performance cue")).toHaveValue("My local ending");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
});

test("two owner pages starting from an empty set review the first winning write before retry", async ({ page, context }) => {
  const second = await context.newPage();
  let official: ReturnType<typeof song>[] = [];
  let version = "initial:0";
  const posts: Array<Record<string, unknown>> = [];
  const options = {
    songs: [],
    onGet: () => ({ json: ownerPayload(official, version) }),
    onPost: (posted: Record<string, unknown>): FixtureResponse => {
      posts.push(posted);
      if (posted.reviewedVersion !== version || posted.reviewedBase !== officialSetRevision(official)) {
        return { status: 409, json: { error: "This set changed since you last loaded it." } };
      }
      official = (posted.songs as ReturnType<typeof song>[]).map((row, index) => song(90 + index, { ...row, id: 90 + index, updatedAt: "2026-09-05T02:00:00.000Z" }));
      version = VERSION_B;
      return { json: { songs: official, reviewedBase: officialSetRevision(official), reviewedVersion: version } };
    },
  };
  for (const owner of [page, second]) {
    await owner.route((url) => url.pathname === "/api/enrich", (route) => route.fulfill({ json: { source: "fixture", youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "" } }));
    await openOwner(owner, options);
  }
  await page.getByLabel("New song title").fill("First owner's opening song");
  await page.getByRole("button", { name: "Add + find", exact: true }).click();
  await second.getByLabel("New song title").fill("Second owner's local song");
  await second.getByRole("button", { name: "Add + find", exact: true }).click();
  await saveActive(page);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  await saveActive(second);
  await expect(second.locator("[data-save-hold='conflict']")).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[0]?.reviewedVersion).toBe("initial:0");
  expect(posts[1]?.reviewedVersion).toBe("initial:0");
  await checkActive(second);
  const review = second.getByRole("region", { name: "Saved set comparison" });
  await expect(review.getByRole("region", { name: "Checked saved list" })).toContainText("First owner's opening song");
  await expect(review.getByRole("region", { name: "Your browser draft" })).toContainText("Second owner's local song");
  await second.getByRole("button", { name: "Keep my draft", exact: true }).click();
  expect(posts).toHaveLength(2);
  expect(official[0]?.title).toBe("First owner's opening song");
  await expect(second.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
  await second.close();
});

for (const method of ["POST", "GET"] as const) {
  test(`a stalled ${method === "POST" ? "Save" : "Check"} body releases recovery at the deadline and ignores its late receipt`, async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(({ method }) => {
      const realFetch = window.fetch.bind(window);
      let reads = 0;
      window.fetch = async (...args) => {
        const response = await realFetch(...args);
        const path = String(args[0]);
        const requestMethod = args[1]?.method ?? "GET";
        if (path.startsWith("/api/show") && !path.startsWith("/api/shows")) {
          if (requestMethod === "GET") reads += 1;
          if (requestMethod === method && (method === "POST" || reads === 2)) {
            const payload = await response.json();
            Object.defineProperty(response, "json", { value: () => new Promise((resolve) => {
              // Only the synthetic body ignores abort, proving the UI deadline
              // independently retires a late response without another write.
              (window as Window & { releaseOwnerBody?: () => void }).releaseOwnerBody = () => resolve(payload);
            }) });
          }
        }
        return response;
      };
    }, { method });
    let posts = 0;
    await openOwner(page, {
      onGet: (count) => ({ json: count === 1 ? ownerPayload() : ownerPayload([song(11, { performanceNote: "Late saved cue" })], VERSION_B) }),
      onPost: (posted) => {
        posts += 1;
        if (method === "GET") return { status: 409, json: { error: "This set changed since you last loaded it." } };
        const saved = (posted.songs as ReturnType<typeof song>[]).map((row) => ({ ...row, updatedAt: "2026-09-05T02:00:00.000Z" }));
        return { json: { songs: saved, reviewedBase: officialSetRevision(saved), reviewedVersion: VERSION_B } };
      },
    });
    await editCue(page);
    await saveActive(page);
    if (method === "GET") await checkActive(page);
    await expect.poll(() => page.evaluate(() => typeof (window as Window & { releaseOwnerBody?: unknown }).releaseOwnerBody)).toBe("function");
    if (method === "GET") await page.getByLabel("Performance cue").fill("Changed while checking");
    await page.clock.fastForward(10_100);
    await expect(page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first()).toBeEnabled();
    await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
    await page.evaluate(() => (window as Window & { releaseOwnerBody?: () => void }).releaseOwnerBody?.());
    await expect(page.getByRole("region", { name: "Saved set comparison" })).toHaveCount(0);
    await expect(page.getByLabel("Performance cue")).toHaveValue(method === "GET" ? "Changed while checking" : "My local ending");
    expect(posts).toBe(1);
  });
}

test("switching shows refuses an offline owner receipt instead of editing its cached set", async ({ page }) => {
  await openOwner(page, {
    shows: [SHOW_A, SHOW_B],
    onGet: (_count, requested) => requested === SHOW_A.slug
      ? { json: ownerPayload() }
      : { json: ownerPayload([], VERSION_B, SHOW_B), headers: { ...OWNER_HEADERS, "X-Rad-Dad-Offline": "1" } },
  });
  await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
  await expect(page.getByText(/Could not verify that show's current owner data/)).toBeVisible();
  await expect(page.getByLabel("Editing show")).toHaveValue(SHOW_A.slug);
  await expect(page.getByRole("textbox", { name: "Song", exact: true })).toHaveValue("Fixture closer");
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
});
