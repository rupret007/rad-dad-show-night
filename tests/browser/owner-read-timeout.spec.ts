import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { runSong, RUN_SHOW_ID, RUN_SHOW_SLUG } from "./run-fixture-data";

const SHOW_A = {
  id: RUN_SHOW_ID, slug: RUN_SHOW_SLUG, title: "Read fixture A", venue: "Fixture venue",
  showDate: "2026-10-01", date: "Fixture date", startTime: "", endTime: "", hours: "",
  expectedWrap: "", status: "draft", isDefault: false,
};
const SHOW_B = { ...SHOW_A, id: "read-fixture-b", slug: "read-fixture-b", title: "Read fixture B" };
const OWNER_HEADERS = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };

type HeldRead = { release: () => void; signal: AbortSignal | null | undefined };
declare global {
  interface Window { heldOwnerRead?: HeldRead }
}

// Synthetic headers/bodies deliberately ignore abort. Real owner components and
// timers run in the browser; all data comes from loopback route fixtures.
async function holdRead(page: Page, path: string, phase: "headers" | "body", occurrence = 1) {
  await page.addInitScript(({ path, phase, occurrence }) => {
    const nativeFetch = window.fetch.bind(window);
    let reads = 0;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      const shouldHold = url.pathname === path && ++reads === occurrence;
      const response = await nativeFetch(input, init);
      if (!shouldHold) return response;
      if (phase === "headers") {
        return new Promise<Response>((resolve) => {
          window.heldOwnerRead = { signal: init?.signal, release: () => resolve(response) };
        });
      }
      const payload = await response.json();
      Object.defineProperty(response, "json", { value: () => new Promise((resolve) => {
        window.heldOwnerRead = { signal: init?.signal, release: () => resolve(payload) };
      }) });
      return response;
    };
  }, { path, phase, occurrence });
}

async function openOwner(page: Page, suffix = "", untrusted = false, shows = [SHOW_A, SHOW_B]) {
  await page.route((url) => url.pathname === "/api/suggestions", (route) => route.fulfill({ json: { suggestions: [] } }));
  await page.route((url) => url.pathname === "/api/shows", (route) => route.fulfill({ json: { shows } }));
  await page.route((url) => url.pathname === "/api/show", (route) => {
    expect(route.request().method()).toBe("GET");
    const url = new URL(route.request().url());
    expect(url.searchParams.get("scope")).toBe("owner");
    const show = url.searchParams.get("show") === SHOW_B.slug ? SHOW_B : SHOW_A;
    return route.fulfill({
      headers: untrusted ? { ...OWNER_HEADERS, "X-Rad-Dad-Offline": "1" } : OWNER_HEADERS,
      json: { show, songs: [{ ...runSong(101, show.title, 1), showId: show.id }],
        setWriteVersions: { "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "11111111-1111-4111-8111-111111111111" } },
    });
  });
  await page.goto(`/?surface=owner&show=${SHOW_A.slug}${suffix}`);
}

async function waitForHeldRead(page: Page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.heldOwnerRead))).toBe(true);
}
async function release(page: Page) {
  await page.evaluate(() => window.heldOwnerRead?.release());
}
const editor = (page: Page) => page.getByRole("textbox", { name: "Song", exact: true });

for (const path of ["/api/show", "/api/shows"]) {
  for (const phase of ["headers", "body"] as const) {
    test(`initial ${path} stalled ${phase} expires and offers verified retry`, async ({ page }) => {
      await page.clock.install();
      await holdRead(page, path, phase);
      await openOwner(page);
      await waitForHeldRead(page);
      await page.clock.fastForward(10_100);
      await expect(page.getByRole("button", { name: "Retry verified load" })).toBeVisible();
      await expect(page.locator('[data-show-control="unverified"]')).toBeVisible();
      expect(await page.evaluate(() => window.heldOwnerRead?.signal?.aborted)).toBe(true);
      await release(page);
      await expect(editor(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Save Rad Dad|Publish|Archive/ })).toHaveCount(0);
      // Reload is the existing recovery action. Release the fresh synthetic read.
      await page.getByRole("button", { name: "Retry verified load" }).click();
      await waitForHeldRead(page);
      await release(page);
      await expect(editor(page)).toHaveValue(SHOW_A.title);
    });
  }
}

for (const phase of ["headers", "body"] as const) {
  test(`switch stalled ${phase} restores the show, draft and save authority; late completion is ignored`, async ({ page }) => {
    await page.clock.install();
    await holdRead(page, "/api/show", phase, 2);
    await openOwner(page);
    await expect(editor(page)).toHaveValue(SHOW_A.title);
    await editor(page).fill("Unsaved local title");
    await page.getByPlaceholder("Song title").fill("Unadded song");
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await waitForHeldRead(page);
    await page.clock.fastForward(10_100);
    await expect(page.getByLabel("Editing show")).toHaveValue(SHOW_A.slug);
    await expect(editor(page)).toHaveValue("Unsaved local title");
    await expect(page.getByPlaceholder("Song title")).toHaveValue("Unadded song");
    await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
    expect(await page.evaluate(() => window.heldOwnerRead?.signal?.aborted)).toBe(true);
    await release(page);
    await expect(editor(page)).toHaveValue("Unsaved local title");
    expect(new URL(page.url()).searchParams.get("show")).toBe(SHOW_A.slug);
    // A fresh switch can succeed after the expired read has been retired.
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await expect(editor(page)).toHaveValue(SHOW_B.title);
    await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeDisabled();
  });

  test(`unmount retires switch ${phase} and ignores its late history change`, async ({ page }) => {
    await holdRead(page, "/api/show", phase, 2);
    await openOwner(page, "&lifecycle=1");
    await expect(editor(page)).toHaveValue(SHOW_A.title);
    await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
    await waitForHeldRead(page);
    await page.getByRole("button", { name: "Remount owner fixture" }).click();
    await expect(editor(page)).toHaveValue(SHOW_A.title);
    expect(await page.evaluate(() => window.heldOwnerRead?.signal?.aborted)).toBe(true);
    await release(page);
    await expect(editor(page)).toHaveValue(SHOW_A.title);
    expect(new URL(page.url()).searchParams.get("show")).toBe(SHOW_A.slug);
  });
}

test("unmount aborts initial body read and a fresh mount owns the result", async ({ page }) => {
  await holdRead(page, "/api/show", "body");
  await openOwner(page, "&lifecycle=1");
  await waitForHeldRead(page);
  await page.getByRole("button", { name: "Remount owner fixture" }).click();
  await expect(editor(page)).toHaveValue(SHOW_A.title);
  await editor(page).fill("New mount draft");
  expect(await page.evaluate(() => window.heldOwnerRead?.signal?.aborted)).toBe(true);
  await release(page);
  await expect(editor(page)).toHaveValue("New mount draft");
});

test("initial offline owner receipt never grants editing authority", async ({ page }) => {
  await openOwner(page, "", true);
  await expect(page.getByRole("button", { name: "Retry verified load" })).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
});

test("a created clone with a stalled owner read retains the switch recovery notice", async ({ page }) => {
  await page.clock.install();
  await holdRead(page, "/api/show", "body", 2);
  await openOwner(page, "", false, [SHOW_A]);
  await expect(editor(page)).toHaveValue(SHOW_A.title);
  await editor(page).fill("Keep this draft");
  page.on("dialog", (dialog) => dialog.accept());
  let clones = 0;
  await page.route((url) => url.pathname === "/api/shows", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON().action).toBe("clone");
    clones += 1;
    await route.fulfill({ status: 201, json: { show: SHOW_B } });
  });
  await page.getByRole("button", { name: "Clone show" }).click();
  await page.getByLabel("New show title").fill(SHOW_B.title);
  await page.getByLabel("New show date").fill("2026-10-31");
  await page.getByRole("button", { name: "Create draft" }).click();
  await waitForHeldRead(page);
  await page.clock.fastForward(10_100);
  await expect(editor(page)).toHaveValue("Keep this draft");
  await expect(page.getByLabel("Editing show")).toHaveValue(SHOW_A.slug);
  await expect(page.getByText("The show switch timed out. Your current show and draft are kept. Try switching again.", { exact: true })).toBeVisible();
  expect(clones).toBe(1);
  await release(page);
  await expect(editor(page)).toHaveValue("Keep this draft");
  await page.getByLabel("Editing show").selectOption(SHOW_B.slug);
  await expect(editor(page)).toHaveValue(SHOW_B.title);
  expect(clones).toBe(1);
});
