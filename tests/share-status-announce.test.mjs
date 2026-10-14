import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

test("share status is announced and cancelled sheets stay silent", async () => {
  const [liveList, readme] = await Promise.all([
    readFile(liveListUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(liveList, /function SharePageButton/);
  assert.match(liveList, /aria-live="polite"/);
  assert.match(liveList, /setStatus\("Shared"\)/);
  assert.match(liveList, /setStatus\("Link copied"\)/);
  assert.match(liveList, /Could not share/);
  assert.match(liveList, /error\.name === "AbortError"/);
  assert.match(liveList, /setStatus\(cancelled \? "" : "Could not share"\)/);
  assert.match(readme, /Announces share success or failure/);
});
