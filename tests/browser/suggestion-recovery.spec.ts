import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import type { PublicSuggestion, SuggestionFields } from "../../lib/suggestion-board";

const draft: SuggestionFields = {
  title: "Fixture afterglow", artist: "Offline band", addedBy: "Fixture guest",
  notes: "A local test idea only.", isOriginal: true,
};
const row = (fields: SuggestionFields = draft, id = "fixture-1"): PublicSuggestion => ({
  ...fields, id, submittedAt: "2026-09-04T22:00:00-05:00",
});
const feedStatus = (page: Page) => page.getByTestId("suggestion-feed-status");
const delivery = (page: Page) => page.getByTestId("suggestion-delivery");

async function fillDraft(page: Page, fields = draft) {
  await page.getByLabel("Song title *", { exact: true }).fill(fields.title);
  await page.getByLabel("Artist", { exact: true }).fill(fields.artist);
  await page.getByLabel("Your name *", { exact: true }).fill(fields.addedBy);
  await page.getByRole("textbox", { name: "Why this one?", exact: true }).fill(fields.notes);
  await page.getByLabel("This is an original or unreleased song").setChecked(fields.isOriginal);
}

test("StrictMode cancellation cannot strand the first verified board load", async ({ page }) => {
  await page.route("**/api/suggestions", (route) => route.fulfill({ json: { suggestions: [row()] } }));
  await page.goto("/?strict=1");
  await expect(page.getByRole("region", { name: "Community suggestions" }).getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await expect(feedStatus(page)).toContainText("Board loaded");
});

test("a late initial read cannot confirm a pending submission or authorize resend", async ({ page }) => {
  let reads = 0;
  let releaseInitial: (() => void) | undefined;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 202, json: { delivery: "awaiting-board", submission: draft } });
      return;
    }
    reads += 1;
    if (reads === 1) await new Promise<void>((resolve) => { releaseInitial = resolve; });
    await route.fulfill({ json: { suggestions: [row()] } });
  });
  try {
    await page.goto("/");
    await expect.poll(() => reads).toBe(1);
    await fillDraft(page);
    await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
    await expect(delivery(page)).toContainText("waiting for board confirmation");
    releaseInitial?.();
    await expect(feedStatus(page)).toContainText("Board loaded");
    await expect(delivery(page)).toContainText("waiting for board confirmation");
    await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
    await expect(page.getByRole("checkbox", { name: "I understand another submission may create a duplicate" })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh board", exact: true }).click();
    await expect(delivery(page)).toContainText("Confirmed on the board");
    await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue("");
  } finally { releaseInitial?.(); }
});

test("not-sent validation identifies what to correct and retains editable details", async ({ page }) => {
  const invalid = { ...draft, isOriginal: false, notes: "[ORIGINAL] A cover note" };
  await page.route("**/api/suggestions", async (route) => {
    await route.fulfill(route.request().method() === "POST"
      ? { status: 400, json: { delivery: "not-sent", error: "Mark this song as original, or remove the leading [ORIGINAL] marker from the notes." } }
      : { json: { suggestions: [] } });
  });
  await page.goto("/");
  await fillDraft(page, invalid);
  await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
  await expect(delivery(page)).toContainText("remove the leading [ORIGINAL] marker");
  await expect(page.getByRole("textbox", { name: "Why this one?", exact: true })).toHaveValue(invalid.notes);
  await expect(page.getByRole("textbox", { name: "Why this one?", exact: true })).toBeEditable();
});

test("leaving uncertain delivery requires an explicit clear and returns keyboard focus", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") {
      writes += 1;
      await route.abort("failed");
    } else await route.fulfill({ json: { suggestions: [] } });
  });
  await page.goto("/");
  await fillDraft(page);
  await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
  await expect(delivery(page)).toContainText("Delivery not confirmed");
  await page.getByRole("button", { name: "Start a different idea", exact: true }).click();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
  await page.getByRole("button", { name: "Keep checking this idea", exact: true }).click();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
  await page.getByRole("button", { name: "Start a different idea", exact: true }).click();
  await page.getByRole("button", { name: "Yes, start a different idea", exact: true }).click();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Song title *", { exact: true })).toBeFocused();
  expect(writes).toBe(1);
});

test("failed feed is unavailable, not empty; explicit refresh recovers", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/suggestions", async (route) => {
    expect(route.request().method()).toBe("GET");
    reads += 1;
    await route.fulfill(reads === 1
      ? { status: 503, json: { error: "Fixture unavailable" } }
      : { json: { suggestions: [] } });
  });
  await page.goto("/");
  await expect(feedStatus(page)).toContainText(/unavailable/i);
  await expect(page.getByText(/No ideas in this verified board/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(page.getByText(/No ideas in this verified board/i)).toBeVisible();
  await expect(feedStatus(page)).not.toContainText(/unavailable|live/i);
  expect(reads).toBe(2);
});

test("malformed feed preserves last checked rows and can recover again", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/suggestions", async (route) => {
    reads += 1;
    await route.fulfill({ json: reads === 2
      ? { suggestions: [{ title: "Not a receipt" }] }
      : { suggestions: [row()] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(feedStatus(page)).toContainText(/last checked|unavailable/i);
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(feedStatus(page)).not.toContainText(/unavailable|last checked/i);
  expect(reads).toBe(3);
});

test("search and same-song cue prevent a redundant public write", async ({ page }) => {
  const other = row({ ...draft, title: "Another fixture", artist: "Different band" }, "fixture-2");
  let writes = 0;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") writes += 1;
    await route.fulfill({ json: { suggestions: [row(), other] } });
  });
  await page.goto("/");
  await page.getByLabel("Find a song or artist", { exact: true }).fill("offline band");
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: other.title, exact: true })).toHaveCount(0);
  await fillDraft(page, { ...draft, title: "  FIXTURE   AFTERGLOW  " });
  await expect(page.getByText(/Already suggested — no need/i)).toBeVisible();
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(writes).toBe(0);
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue("  FIXTURE   AFTERGLOW  ");
});

test("form receipt stays separate until a later board read confirms the whole draft", async ({ page }) => {
  let visible = false;
  let writes = 0;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") {
      writes += 1;
      await route.fulfill({ status: 202, json: { delivery: "awaiting-board", submission: draft } });
    } else await route.fulfill({ json: { suggestions: visible ? [row()] : [] } });
  });
  await page.goto("/");
  await fillDraft(page);
  await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
  await expect(delivery(page)).toContainText(/waiting|confirmation/i);
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toHaveCount(0);
  visible = true;
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(delivery(page)).toContainText(/confirmed/i);
  await expect(page.getByRole("region", { name: "Community suggestions" }).getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue("");
  expect(writes).toBe(1);
});

test("same song from someone else is not confirmation of this submitted draft", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 202, json: { delivery: "awaiting-board", submission: draft } });
    } else {
      reads += 1;
      await route.fulfill({ json: { suggestions: reads > 1 ? [row({ ...draft, addedBy: "Someone else" })] : [] } });
    }
  });
  await page.goto("/");
  await fillDraft(page);
  await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
  await expect(delivery(page)).toContainText(/waiting|confirmation/i);
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
  await expect(delivery(page)).not.toContainText(/board confirmed|confirmed on the board/i);
});

for (const failure of ["lost-response", "malformed-success", "mismatched-receipt"] as const) {
  test(`${failure} retains draft and never automatically resends`, async ({ page }) => {
    let writes = 0;
    await page.route("**/api/suggestions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ json: { suggestions: [] } });
        return;
      }
      writes += 1;
      if (failure === "lost-response") await route.abort("failed");
      else await route.fulfill({ status: 202, json: failure === "malformed-success"
        ? { ok: true }
        : { delivery: "awaiting-board", submission: { ...draft, notes: "Wrong receipt" } } });
    });
    await page.goto("/");
    await fillDraft(page);
    await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
    await expect(delivery(page)).toContainText(/cannot confirm|could not confirm|not confirmed|uncertain/i);
    await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
    await expect(page.getByRole("textbox", { name: "Why this one?", exact: true })).toHaveValue(draft.notes);
    await expect(page.getByLabel("This is an original or unreleased song")).toBeChecked();
    await expect(page.getByRole("link", { name: /backup form/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh board", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "I understand another submission may create a duplicate" })).toBeVisible();
    expect(writes).toBe(1);
    await expect(page.getByRole("button", { name: "Retry suggestion", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: "I understand another submission may create a duplicate" }).check();
    await page.getByRole("button", { name: "Retry suggestion", exact: true }).click();
    await expect.poll(() => writes).toBe(2);
  });
}

test("bounded write deadline unlocks the retained draft without a retry", async ({ page }) => {
  await page.clock.install();
  let writes = 0;
  let releaseWrite: (() => void) | undefined;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ json: { suggestions: [] } });
      return;
    }
    writes += 1;
    await new Promise<void>((resolve) => { releaseWrite = resolve; });
    await route.abort("failed").catch(() => undefined);
  });
  try {
    await page.goto("/");
    await fillDraft(page);
    await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByLabel("Song title *", { exact: true })).toBeDisabled();
    await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    expect(writes).toBe(1);
    await page.clock.fastForward(20_100);
    await expect(delivery(page)).toContainText(/cannot confirm|could not confirm|not confirmed|uncertain/i);
    await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
    expect(writes).toBe(1);
  } finally { releaseWrite?.(); }
});

test("a verified duplicate response identifies the existing idea without clearing text", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/suggestions", async (route) => {
    if (route.request().method() === "POST") {
      writes += 1;
      await route.fulfill({ status: 409, json: { delivery: "already-present", existing: row(), error: "Already present" } });
    } else await route.fulfill({ json: { suggestions: [] } });
  });
  await page.goto("/");
  await fillDraft(page);
  await page.getByRole("button", { name: "Add suggestion", exact: true }).click();
  await expect(page.getByText(/already on the board/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await expect(page.getByLabel("Song title *", { exact: true })).toHaveValue(draft.title);
  expect(writes).toBe(1);
});

test("320px search and long public strings stay readable without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const long = row({ ...draft, title: "W".repeat(140), artist: "W".repeat(140), notes: "W".repeat(500), addedBy: "W".repeat(100) });
  await page.route("**/api/suggestions", (route) => route.fulfill({ json: { suggestions: [long] } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: long.title, exact: true })).toBeVisible();
  const search = await page.getByLabel("Find a song or artist", { exact: true }).boundingBox();
  const title = await page.getByLabel("Song title *", { exact: true }).boundingBox();
  expect(search!.y).toBeLessThan(title!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("discovery and draft render together on desktop and in reading order on phones", async ({ page }, testInfo) => {
  await page.route("**/api/suggestions", (route) => route.fulfill({ json: { suggestions: [
    row(), row({ ...draft, title: "Second fixture idea", artist: "Another offline band", isOriginal: false }, "fixture-2"),
  ] } }));
  await page.goto("/");
  await expect(feedStatus(page)).toContainText("Board loaded");
  await page.screenshot({ path: testInfo.outputPath("board-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const search = await page.getByLabel("Find a song or artist", { exact: true }).boundingBox();
  const title = await page.getByLabel("Song title *", { exact: true }).boundingBox();
  expect(search!.y).toBeLessThan(title!.y);
  await page.screenshot({ path: testInfo.outputPath("board-phone.png"), fullPage: true });
});

async function ownerFixture(page: Page) {
  const show = {
    id: "fixture-show", slug: "suggestion-fixture-night", title: "Offline fixture night",
    venue: "Fixture venue", showDate: "2026-10-01", date: "Fixture date", startTime: "", endTime: "",
    hours: "", expectedWrap: "", status: "draft", isDefault: false,
  };
  const sets = ["jeff-story-friends", "stalemate", "rad-dad"].map((slug) => ({
    slug, title: slug === "rad-dad" ? "Rad Dad" : slug, time: "", kicker: "Fixture", accent: "blue",
  }));
  const writes: string[] = [];
  await page.route((url) => url.pathname === "/api/show", async (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    await route.fulfill({ json: { show, sets, songs: [] } });
  });
  await page.route((url) => url.pathname === "/api/shows", (route) => route.fulfill({ json: { shows: [show] } }));
  return { writes, url: `/?surface=owner&show=${show.slug}` };
}

test("owner show remains usable through inbox failure; refresh recovers a draft-only add", async ({ page }) => {
  const owner = await ownerFixture(page);
  let reads = 0;
  await page.route("**/api/suggestions", async (route) => {
    reads += 1;
    await route.fulfill(reads === 1
      ? { status: 503, json: { error: "Fixture unavailable" } }
      : { json: { suggestions: [row()] } });
  });
  await page.goto(owner.url);
  const inbox = page.getByRole("complementary", { name: "Suggestion inbox" });
  await expect(inbox.getByRole("status")).toContainText("Suggestion inbox unavailable");
  await expect(inbox.getByText("No suggestions yet.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeVisible();
  await inbox.getByRole("button", { name: "Refresh suggestions", exact: true }).click();
  await inbox.getByRole("button", { name: "Add to Rad Dad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Rad Dad", exact: true }).last()).toBeEnabled();
  expect(owner.writes).toEqual([]);
});

test("owner inbox retains last checked ideas but blocks copying stale rows until refreshed", async ({ page }) => {
  const owner = await ownerFixture(page);
  let reads = 0;
  await page.route("**/api/suggestions", async (route) => {
    reads += 1;
    await route.fulfill({ json: reads === 2 ? { suggestions: [null] } : { suggestions: [row()] } });
  });
  await page.goto(owner.url);
  const inbox = page.getByRole("complementary", { name: "Suggestion inbox" });
  await expect(inbox.getByRole("button", { name: "Add to Rad Dad" })).toBeEnabled();
  await inbox.getByRole("button", { name: "Refresh suggestions" }).click();
  await expect(inbox.getByRole("status")).toContainText("Keeping the last checked ideas");
  await expect(inbox.getByText(draft.title, { exact: true })).toBeVisible();
  await expect(inbox.getByRole("button", { name: "Add to Rad Dad" })).toBeDisabled();
  await inbox.getByRole("button", { name: "Refresh suggestions" }).click();
  await expect(inbox.getByRole("button", { name: "Add to Rad Dad" })).toBeEnabled();
  expect(owner.writes).toEqual([]);
});
