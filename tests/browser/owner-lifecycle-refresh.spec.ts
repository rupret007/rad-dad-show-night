import type { Page, Route } from "@playwright/test";
import type { ManagedShow, ShowSong } from "../../lib/show-data";
import { officialSetRevision } from "../../lib/owner-set-save";
import { test, expect } from "./fixtures";

const OWNER_HEADERS = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };
const SHOW_A: ManagedShow = {
  id: "lifecycle-a", slug: "lifecycle-a", title: "Fixture night A", venue: "Fixture venue A",
  showDate: "2026-10-01", date: "Fixture date", startTime: "", endTime: "", hours: "",
  expectedWrap: "", status: "draft", isDefault: false,
};
const SHOW_B: ManagedShow = { ...SHOW_A, id: "lifecycle-b", slug: "lifecycle-b", title: "Fixture night B" };
const SETS = [
  { slug: "jeff-story-friends", title: "Jeff Story & Friends", time: "", kicker: "Opening", accent: "blue" },
  { slug: "stalemate", title: "Stalemate", time: "", kicker: "Middle", accent: "pink" },
  { slug: "rad-dad", title: "Rad Dad", time: "", kicker: "Closer", accent: "lime" },
];
function payload(show: ManagedShow) {
  return {
    show, sets: SETS,
    setWriteVersions: { "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "initial:0" },
    songs: [{
      id: show.id === SHOW_A.id ? 11 : 22, showId: show.id, setSlug: "rad-dad", position: 1,
      title: `Song for ${show.slug}`, artist: "Fixture band", transition: false, isOriginal: false,
      durationSeconds: 180, performanceNote: "Count in", songKey: "G", tuning: "", youtubeUrl: "",
      youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "", updatedAt: "2026-10-01T00:00:00Z",
    }],
  };
}

async function openOwner(page: Page, shows: ManagedShow[], detail: (slug: string, count: number, route: Route) => Promise<void>, failSave = false) {
  const writes: string[] = [];
  const reads: string[] = [];
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === "/api/show" && request.method() === "POST") {
        if (failSave) return route.fulfill({ status: 409, json: { error: "Fixture conflict" } });
        const songs = request.postDataJSON().songs as ShowSong[];
        await route.fulfill({ json: { songs, reviewedBase: officialSetRevision(songs), reviewedVersion: "11111111-1111-4111-8111-111111111111" } });
      } else {
        await route.fulfill({ status: 500, json: { error: "Unexpected fixture write" } });
      }
      return;
    }
    if (url.pathname === "/api/shows") return route.fulfill({ json: { shows } });
    if (url.pathname === "/api/suggestions") return route.fulfill({ json: { suggestions: [] } });
    expect(url.pathname).toBe("/api/show");
    expect(url.searchParams.get("scope")).toBe("owner");
    const slug = url.searchParams.get("show")!;
    reads.push(slug);
    await detail(slug, reads.length, route);
  });
  await page.goto(`/?surface=owner&show=${SHOW_A.slug}`);
  await expect(page.getByLabel("Editing show")).toBeVisible();
  return { reads, writes };
}

async function editCue(page: Page) {
  const details = page.getByText("Details, song resources, and rehearsal notes").first();
  if (!(await page.getByLabel("Performance cue").first().isVisible())) await details.click();
  await page.getByLabel("Performance cue").first().fill("Keep my unsaved cue");
}

async function assertMetadata(page: Page, show: ManagedShow, hasDraft = false) {
  const badge = show.status === "published" ? "Published · public" : show.status === "archived" ? "Archived · closed" : "Draft · not public";
  await expect(page.locator(`span[data-status="${show.status}"]`).first()).toHaveText(`${badge}${show.isDefault ? " · default" : ""}`);
  await expect(page.getByLabel("Editing show")).toHaveValue(show.slug);
  await expect(page.locator("#show-picker option:checked")).toContainText(`${show.showDate} - ${show.venue} (${badge}`);
  const link = page.locator("a[data-share-open]");
  await expect(link).toHaveAttribute("href", `/?show=${show.slug}`);
  await expect(link).toHaveAttribute("data-share-open", String(show.status === "published"));
  await expect(link).toHaveText(show.status === "published" ? "Open public share link" : "See closed public link");
  await expect(page.locator("[data-show-hours]")).toContainText(show.hours || "Hours not set for this night");
  await expect(page.getByText(`${show.title} · ${show.showDate}`, { exact: true })).toBeVisible();
  if (hasDraft) return;
  if (show.status === "published") {
    await expect(page.getByRole("button", { name: "Publish saved show", exact: true })).toHaveCount(0);
    const archive = page.getByRole("button", { name: "Archive show", exact: true });
    if (show.isDefault) {
      await expect(archive).toBeDisabled();
      await expect(page.locator("#show-lifecycle-hint")).toContainText("The default public show cannot be archived");
    } else await expect(archive).toBeEnabled();
  } else {
    await expect(page.getByRole("button", { name: "Publish saved show", exact: true }).first()).toBeEnabled();
    if (show.status === "archived") await expect(page.getByRole("button", { name: "Archive show", exact: true })).toHaveCount(0);
  }
}

for (const listed of ["stale", "missing"] as const) {
  test(`initial detail replaces ${listed} list metadata with the verified record`, async ({ page }) => {
    const verified = { ...SHOW_A, title: "Verified initial night", venue: "Verified venue", hours: "8-11 PM", status: "published" as const, isDefault: true };
    const { reads, writes } = await openOwner(page, listed === "stale" ? [SHOW_A, SHOW_B] : [SHOW_B], async (_slug, _count, route) => {
      await route.fulfill({ headers: OWNER_HEADERS, json: payload(verified) });
    });
    await assertMetadata(page, verified);
    await expect(page.locator("#show-picker option")).toHaveCount(2);
    await expect(page.getByText("Ready. This published set matches the public share link.", { exact: true })).toBeVisible();
    expect(reads).toEqual([SHOW_A.slug]);
    expect(writes).toEqual([]);
  });
}

for (const status of ["published", "archived"] as const) {
  test(`switch adopts verified ${status} metadata and subsequent Save copy`, async ({ page }) => {
    const stale = { ...SHOW_B, status: status === "published" ? "draft" as const : "published" as const };
    const verified = { ...SHOW_B, title: "Verified switched night", venue: "New venue", showDate: "2026-11-12", hours: "9-11 PM", status };
    const { reads, writes } = await openOwner(page, [SHOW_A, stale], async (slug, _count, route) => {
      await route.fulfill({ headers: OWNER_HEADERS, json: payload(slug === SHOW_A.slug ? SHOW_A : verified) });
    });
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await assertMetadata(page, verified);
    await expect(page.locator("#show-picker option")).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/show-control\\?show=${SHOW_B.slug}$`));
    await editCue(page);
    await expect(page.getByText(status === "published"
      ? "Unsaved changes. Save this set to update the public share link."
      : "Unsaved changes. Saving updates this private show. It stays off the public share link until you publish.", { exact: true })).toBeVisible();
    expect(reads).toEqual([SHOW_A.slug, SHOW_B.slug]);
    expect(writes).toEqual([]);
    await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
    await expect(page.getByText(status === "published"
      ? "Rad Dad is live on the public share link."
      : "Rad Dad is saved. The public share link stays closed until this show is published again.", { exact: true })).toBeVisible();
    expect(writes).toEqual(["POST /api/show"]);
  });
}

test("saved-list check adopts verified lifecycle while retaining the browser draft", async ({ page }) => {
  const verified = { ...SHOW_A, status: "published" as const, isDefault: true, hours: "8-10 PM" };
  const { writes } = await openOwner(page, [SHOW_A, SHOW_B], async (_slug, count, route) => {
    await route.fulfill({ headers: OWNER_HEADERS, json: payload(count === 1 ? SHOW_A : verified) });
  }, true);
  await editCue(page);
  await page.getByRole("button", { name: "Save Rad Dad", exact: true }).last().click();
  await page.getByRole("button", { name: "Check saved Rad Dad", exact: true }).first().click();
  await assertMetadata(page, verified, true);
  await expect(page.getByLabel("Performance cue").first()).toHaveValue("Keep my unsaved cue");
  await expect(page.getByText("Review the saved Rad Dad list beside your browser draft. Nothing has been overwritten.", { exact: true })).toBeVisible();
  expect(writes).toEqual(["POST /api/show"]);
});

for (const failure of ["http", "offline", "wrong-show", "invalid-songs", "invalid-versions", "malformed-json"] as const) {
  test(`failed ${failure} switch preserves prior metadata, draft, and URL without writes`, async ({ page }) => {
    const { writes } = await openOwner(page, [SHOW_A, SHOW_B], async (slug, _count, route) => {
      if (slug === SHOW_A.slug) return route.fulfill({ headers: OWNER_HEADERS, json: payload(SHOW_A) });
      const json = payload({ ...SHOW_B, status: "published", hours: "9-11 PM" });
      if (failure === "http") return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      if (failure === "offline") return route.fulfill({ headers: { ...OWNER_HEADERS, "X-Rad-Dad-Offline": "1" }, json });
      if (failure === "wrong-show") return route.fulfill({ headers: OWNER_HEADERS, json: payload(SHOW_A) });
      if (failure === "invalid-songs") return route.fulfill({ headers: OWNER_HEADERS, json: { ...json, songs: [{ ...json.songs[0], showId: "foreign" }] } });
      if (failure === "invalid-versions") return route.fulfill({ headers: OWNER_HEADERS, json: { ...json, setWriteVersions: {} } });
      return route.fulfill({ headers: OWNER_HEADERS, contentType: "application/json", body: "{" });
    });
    await editCue(page);
    const priorUrl = page.url();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await expect(page.getByLabel("Editing show")).toBeVisible();
    await expect(page.getByLabel("Editing show")).toHaveValue(SHOW_A.slug);
    await page.getByText("Details, song resources, and rehearsal notes").first().click();
    await expect(page.getByLabel("Performance cue").first()).toHaveValue("Keep my unsaved cue");
    await expect(page.locator('span[data-status="draft"]').first()).toHaveText("Draft · not public");
    await expect(page.locator("a[data-share-open]")).toHaveAttribute("href", `/?show=${SHOW_A.slug}`);
    await expect(page.locator("[data-show-hours]")).toContainText("Hours not set for this night");
    await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
    expect(page.url()).toBe(priorUrl);
    expect(writes).toEqual([]);
  });
}
