import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const SHOW = {
  id: "status-fixture", slug: "status-fixture", title: "Status fixture night", venue: "Fixture venue",
  showDate: "2026-10-31", date: "Fixture date", startTime: "", endTime: "", hours: "", expectedWrap: "",
  status: "draft", isDefault: false,
};
const HEADERS = { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database" };
const PAYLOAD = { show: SHOW, songs: [], setWriteVersions: {
  "jeff-story-friends": "initial:0", stalemate: "initial:0", "rad-dad": "initial:0",
} };

async function openOwner(page: Page, initialStatus = "draft") {
  const writes: unknown[] = [];
  await page.route("**/api/suggestions", route => route.fulfill({ json: { suggestions: [] } }));
  await page.route("**/api/shows", route => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, json: { error: "Readback failed after update" } });
    }
    return route.fulfill({ json: { shows: [{ ...SHOW, status: initialStatus }] } });
  });
  await page.route("**/api/show?**", route => route.fulfill({ headers: HEADERS,
    json: { ...PAYLOAD, show: { ...SHOW, status: initialStatus } } }));
  await page.goto(`/?surface=owner&show=${SHOW.slug}`);
  await expect(page.getByRole("button", { name: "Clone show", exact: true })).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  return writes;
}

async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish saved show", exact: true }).click();
}

async function expectHeld(page: Page) {
  await expect(page.getByRole("heading", { name: "Show status unverified" })).toBeVisible();
  await expect(page.getByText(/may have changed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check show status", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^(Save Rad Dad|Publish saved show|Archive show|Clone show)$/ })).toHaveCount(0);
  await expect(page.locator("[data-share-open]")).toHaveCount(0);
  await expect(page.getByText(/Draft · private|Published · public|Archived · private/)).toHaveCount(0);
}

for (const initial of ["draft", "published"]) {
  test(`failed ${initial === "draft" ? "Publish" : "Archive"} holds writes until a verified read`, async ({ page }) => {
    const writes = await openOwner(page, initial);
    await page.getByLabel("New song title", { exact: true }).fill("Keep my pending title");
    if (initial === "draft") await publish(page);
    else await page.getByRole("button", { name: "Archive show", exact: true }).click();
    await expectHeld(page);
    const returned = initial === "draft" ? "published" : "archived";
    await page.route("**/api/show?**", route => {
      expect(route.request().method()).toBe("GET");
      expect(new URL(route.request().url()).searchParams.get("scope")).toBe("owner");
      return route.fulfill({ headers: HEADERS, json: { ...PAYLOAD, show: { ...SHOW, status: returned } } });
    });
    await page.getByRole("button", { name: "Check show status", exact: true }).click();
    await expect(page.locator(`[data-status="${returned}"]`)).toBeVisible();
    await expect(page.getByLabel("New song title", { exact: true })).toHaveValue("Keep my pending title");
    expect(writes).toHaveLength(1);
  });
}

for (const failure of ["401", "500", "public", "offline", "wrong-show", "invalid-status", "malformed"]) {
  test(`recovery remains held after ${failure} read`, async ({ page }) => {
    const writes = await openOwner(page);
    await publish(page);
    await expectHeld(page);
    await page.route("**/api/show?**", route => route.fulfill({
      status: failure === "401" ? 401 : failure === "500" ? 500 : 200,
      headers: failure === "public" ? {} : { ...HEADERS, ...(failure === "offline" ? { "X-Rad-Dad-Offline": "1" } : {}) },
      json: failure === "malformed" ? null : { ...PAYLOAD, show: { ...SHOW,
        id: failure === "wrong-show" ? "other-show" : SHOW.id,
        status: failure === "invalid-status" ? "surprise" : "published" } },
    }));
    await page.getByRole("button", { name: "Check show status", exact: true }).click();
    await expect(page.getByText(/Could not verify the current show status/)).toBeVisible();
    await expectHeld(page);
    expect(writes).toHaveLength(1);
  });
}

for (const status of ["draft", "published", "archived"]) {
  test(`success notice uses returned ${status} status`, async ({ page }) => {
    await openOwner(page);
    await page.route("**/api/shows", route => route.fulfill({ json: { show: { ...SHOW, status } } }));
    await publish(page);
    await expect(page.locator(`[data-status="${status}"]`)).toBeVisible();
    await expect(page.getByText(status === "published"
      ? "Status fixture night is public at its saved share link."
      : status === "archived" ? "Status fixture night is archived. Its public share link is now closed."
      : "Status fixture night is a draft. Its public share link is closed.", { exact: true })).toBeVisible();
  });
}

for (const phase of ["request", "body"]) {
  test(`a stalled status ${phase} times out and late success cannot unlock recovery`, async ({ page }) => {
    await openOwner(page);
    await page.clock.install();
    await page.evaluate((stallPhase) => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (args[0] === "/api/shows" && args[1]?.method === "POST") {
          const late = () => new Promise<Response>(resolve => {
            (window as unknown as { releaseStatus: () => void }).releaseStatus = () => resolve(new Response("{}"));
          });
          if (stallPhase === "request") return late();
          return { ok: true, status: 200, headers: new Headers(), json: () => late().then(() => ({ show: {
            id: "status-fixture", slug: "status-fixture", title: "Late result", status: "published", isDefault: false,
            venue: "", showDate: "", date: "", startTime: "", endTime: "", hours: "", expectedWrap: "",
          } })) } as Response;
        }
        return original(...args);
      };
    }, phase);
    await publish(page);
    await page.clock.fastForward(10_001);
    await expectHeld(page);
    await page.evaluate(() => (window as unknown as { releaseStatus: () => void }).releaseStatus());
    await expectHeld(page);
  });
}

test("mobile recovery provides one keyboard action without overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openOwner(page);
  await publish(page);
  await expectHeld(page);
  const check = page.getByRole("button", { name: "Check show status", exact: true });
  await expect(check).toBeFocused();
  expect(await check.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("status-recovery-mobile.png"), fullPage: true });
});
