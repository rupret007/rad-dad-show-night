import type { Page } from "@playwright/test";
import { officialSetRevision } from "../../lib/owner-set-save";
import { test, expect } from "./fixtures";

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
  }: {
    shows?: typeof SHOW_A[];
    songs?: ReturnType<typeof song>[];
    onPost?: (posted: Record<string, unknown>) => Promise<{ status?: number; json: unknown }> | { status?: number; json: unknown };
  } = {},
) {
  const show = shows[0];
  await mockSuggestions(page);
  await page.route((url) => url.pathname === "/api/shows", (route) =>
    route.fulfill({ json: { shows } }),
  );
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const requested = new URL(request.url()).searchParams.get("show") || show.slug;
      const selected = shows.find((item) => item.slug === requested) ?? show;
      await route.fulfill({
        json: {
          show: selected,
          sets: SETS,
          songs: selected.slug === SHOW_A.slug ? songs : [],
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
      },
    });
  });
  await page.goto(`/?surface=owner&show=${show.slug}`);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
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
      return { json: { songs: saved, reviewedBase: officialSetRevision(saved) } };
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
  await expect(page.getByText(/Your unsaved draft is still here/)).toBeVisible();
  await expect(page.getByLabel("Performance cue")).toHaveValue("Hold the ending");
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
