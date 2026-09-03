import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS, SHOW_DETAILS } from "../lib/show-data.ts";
import {
  pickVisibleDefaultShow,
  canReadShowStatus,
} from "../lib/show-visibility.ts";
import {
  publicSongsLeakRehearsalNotes,
  shouldCopyCloneSongs,
  toPublicShowSongs,
  visibleOfficialSets,
} from "../lib/show-public.ts";
import {
  buildShowSets,
  createStoredShowSnapshot,
  parseStoredShowSnapshot,
} from "../lib/show-read-integrity.ts";

const storeUrl = new URL("../lib/show-store.ts", import.meta.url);
const showsRouteUrl = new URL("../app/api/shows/route.ts", import.meta.url);
const showControlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const liveListUrl = new URL("../app/live-set-lists.tsx", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);
const leftoverWorkflowUrl = new URL(
  "../.github/workflows/leftover-honesty.yml",
  import.meta.url,
);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const showDataUrl = new URL("../lib/show-data.ts", import.meta.url);

test("public show songs never carry owner rehearsal notes", () => {
  const leaked = toPublicShowSongs([
    { ...DEFAULT_SONGS[0], rehearsalNotes: "Hold the last chorus. Private ending." },
    { ...DEFAULT_SONGS[1], rehearsalNotes: "" },
  ]);

  assert.deepEqual(
    leaked.map((song) => song.rehearsalNotes),
    ["", ""],
  );
  assert.equal(publicSongsLeakRehearsalNotes(leaked), false);
  assert.equal(
    publicSongsLeakRehearsalNotes([
      { rehearsalNotes: "Hold the last chorus. Private ending." },
    ]),
    true,
  );
  assert.equal(leaked[0].title, DEFAULT_SONGS[0].title);
});

test("a device snapshot cannot revive rehearsal notes from another session", () => {
  const stored = createStoredShowSnapshot(
    SHOW_DETAILS.slug,
    [
      {
        ...DEFAULT_SONGS[0],
        rehearsalNotes: "Do not show this on the public page.",
      },
    ],
    "2026-09-03T13:00:00.000Z",
    "2026-09-03T13:01:00.000Z",
  );
  const parsed = parseStoredShowSnapshot(JSON.stringify(stored), SHOW_DETAILS.slug);
  assert.equal(parsed?.songs[0]?.title, DEFAULT_SONGS[0].title);
  assert.equal(parsed?.songs[0]?.rehearsalNotes, "");
});

test("the public homepage only resolves the default show, never the latest clone", () => {
  const defaultShow = {
    isDefault: true,
    status: "draft",
    slug: SHOW_DETAILS.slug,
  };
  const publishedClone = {
    isDefault: false,
    status: "published",
    slug: "richardson-2026-10-31",
  };

  assert.equal(canReadShowStatus("draft", "public"), false);
  assert.equal(pickVisibleDefaultShow([defaultShow, publishedClone], "public"), undefined);
  assert.equal(
    pickVisibleDefaultShow(
      [{ ...defaultShow, status: "published" }, publishedClone],
      "public",
    )?.slug,
    SHOW_DETAILS.slug,
  );
  assert.equal(
    pickVisibleDefaultShow([publishedClone], "public"),
    undefined,
  );
  assert.equal(
    pickVisibleDefaultShow([defaultShow, publishedClone], "owner")?.slug,
    SHOW_DETAILS.slug,
  );
});

test("an empty published clone does not inherit official set times or songs", () => {
  const emptySets = visibleOfficialSets(buildShowSets([]), []);
  assert.deepEqual(emptySets, []);

  const timedEmpty = visibleOfficialSets(
    buildShowSets([
      {
        time: "8:00-8:25",
        title: "Jeff Story & Friends",
        type: "performance",
        setSlug: "jeff-story-friends",
      },
    ]),
    [],
  );
  assert.deepEqual(
    timedEmpty.map((set) => ({ slug: set.slug, time: set.time })),
    [
      { slug: "jeff-story-friends", time: "8:00-8:25 PM" },
      { slug: "stalemate", time: "" },
      { slug: "rad-dad", time: "" },
    ].filter((set) => set.time),
  );
  assert.doesNotMatch(timedEmpty[0].time, /7:00-7:35/);
});

test("owner can start an empty clone instead of copying another night", () => {
  assert.equal(shouldCopyCloneSongs(undefined), true);
  assert.equal(shouldCopyCloneSongs(true), true);
  assert.equal(shouldCopyCloneSongs(false), false);
  assert.equal(shouldCopyCloneSongs("false"), false);
  assert.equal(shouldCopyCloneSongs("on"), true);
});

test("store, owner UI, and leftover CI keep this leftover real", async () => {
  const [store, showsRoute, showControl, liveList, page, workflow, packageJson, readme] =
    await Promise.all([
      readFile(storeUrl, "utf8"),
      readFile(showsRouteUrl, "utf8"),
      readFile(showControlUrl, "utf8"),
      readFile(liveListUrl, "utf8"),
      readFile(pageUrl, "utf8"),
      readFile(leftoverWorkflowUrl, "utf8"),
      readFile(packageJsonUrl, "utf8"),
      readFile(readmeUrl, "utf8"),
    ]);

  const getShowRecord = store.slice(
    store.indexOf("export async function getShowRecord"),
    store.indexOf("export async function getManagedShows"),
  );
  assert.match(getShowRecord, /eq\(shows\.isDefault, true\)/);
  assert.match(getShowRecord, /throw new ShowNotFoundError/);
  assert.doesNotMatch(getShowRecord, /orderBy\(desc\(shows\.showDate\)\)/);
  assert.match(store, /toPublicShowSongs\(officialSongs\)/);
  assert.match(store, /scope === "public"/);

  assert.match(showsRoute, /shouldCopyCloneSongs\(payload\.copySongs\)/);
  assert.match(showsRoute, /if \(copySongs\)/);
  assert.match(showsRoute, /error: "Show not found\."/);
  assert.match(showsRoute, /status: 404/);

  assert.match(showControl, /copySongs: data\.copySongs === "on"/);
  assert.match(showControl, /does not inherit another show/);
  assert.match(showControl, /activeSetTime/);
  assert.doesNotMatch(
    showControl.slice(showControl.indexOf("editorHeader"), showControl.indexOf("composer")),
    /activeDefinition\.time/,
  );

  assert.match(liveList, /visibleOfficialSets\(sets, songs\)/);
  assert.match(page, /visibleOfficialSets\(sets, songs\)/);
  assert.match(readme, /rehearsal notes stay in Show Control/i);
  assert.match(packageJson, /leftover:hosted/);
  assert.match(workflow, /npm run leftover:hosted/);
  assert.match(workflow, /npm run test:isolation/);
});

test("this leftover does not rewrite Jeff's official set", async () => {
  const source = await readFile(showDataUrl, "utf8");
  assert.match(source, /Heart-Shaped Box/);
  assert.match(source, /Travis Story - guitar/);
  assert.match(source, /First Date/);
  assert.match(source, /The Way I Love You/);
});
