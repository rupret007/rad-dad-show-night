import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const PORT = process.env.LEFTOVER_HOSTED_PORT || "3011";
const HOST = process.env.LEFTOVER_HOSTED_HOST || "localhost";
let BASE = `http://${HOST}:${PORT}`;
const CLONE_SLUG = "richardson-2026-10-31";
const CANONICAL_SLUG = "guitars-growlers-2026-09-19";
const CLOSED_SLUG = "closed-draft-2026-11-01";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function denyInheritedSet(body, label) {
  assert(!/Heart-Shaped Box/.test(body), `${label} inherited Heart-Shaped Box`);
  assert(!/Basket Case/.test(body), `${label} inherited Basket Case`);
  assert(!/7:00-7:35/.test(body), `${label} inherited 7:00-7:35`);
}

async function readPath(pathname) {
  const response = await fetch(`${BASE}${pathname}`, { cache: "no-store" });
  const text = await response.text();
  return { response, text };
}

async function findExistingServer() {
  for (const base of [BASE, "http://localhost:3000", "http://localhost:3001"]) {
    try {
      const response = await fetch(base, { cache: "no-store" });
      if (response.status > 0) return base;
    } catch {
      // Try the next local leftover host.
    }
  }
  return null;
}

async function seedLocalD1() {
  return await new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "site-creator-d1",
        "--config",
        "scripts/leftover-wrangler.toml",
        "--local",
        "--persist-to",
        ".wrangler/state",
        "--yes",
        "--file=scripts/leftover-honesty-seed.sql",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

async function waitForServer(child) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`vinext exited ${child.exitCode} before becoming ready`);
    }
    try {
      const { response } = await readPath("/");
      if (response.status > 0) return;
    } catch (error) {
      logs += `wait ${attempt}: ${error instanceof Error ? error.message : error}\n`;
    }
    await delay(1000);
  }
  throw new Error("hosted leftover-honesty server did not become ready");
}

async function proveIsolation() {
  const home = await readPath("/");
  assert(home.response.ok, `canonical page returned ${home.response.status}`);
  assert(
    /data-show-source="(?:database|confirmed-fallback)"/.test(home.text),
    "canonical page is missing a verified source",
  );
  assert(
    !new RegExp(`data-show-slug="${CLONE_SLUG}"`).test(home.text),
    "homepage inherited the empty clone",
  );
  assert(
    /Heart-Shaped Box|Jeff Story/.test(home.text),
    "canonical page lost this night's set",
  );
  assert(!/The Granada/.test(home.text), "homepage inherited the clone venue");
  assert(!/Richardson Halloween/.test(home.text), "homepage inherited the clone title");
  assert(!/Closed Draft Night/.test(home.text), "homepage inherited the closed draft");
  assert(
    /This public share link is live/.test(home.text),
    "canonical page is missing public-share honesty",
  );
  assert(
    !/NO PUBLISHED SHOW AT THIS LINK/.test(home.text),
    "canonical page used the closed-link copy",
  );

  const api = await readPath("/api/show");
  assert(api.response.ok, `canonical API returned ${api.response.status}`);
  const payload = JSON.parse(api.text);
  assert(
    payload.show?.slug === CANONICAL_SLUG,
    `canonical API served ${payload.show?.slug}`,
  );
  assert(
    Array.isArray(payload.songs) && payload.songs.length > 0,
    "canonical API has no songs",
  );
  assert(
    payload.songs.every((song) => !String(song.rehearsalNotes || "").trim()),
    "canonical API leaked rehearsal notes",
  );

  const clonePage = await readPath(`/?show=${CLONE_SLUG}`);
  const cloneApi = await readPath(`/api/show?show=${CLONE_SLUG}`);
  const closedPage = await readPath(`/?show=${CLOSED_SLUG}`);
  const closedApi = await readPath(`/api/show?show=${CLOSED_SLUG}`);
  denyInheritedSet(clonePage.text, "clone page");
  denyInheritedSet(cloneApi.text, "clone API");
  denyInheritedSet(closedPage.text, "closed draft page");
  denyInheritedSet(closedApi.text, "closed draft API");
  assert(
    !/Closed Draft Night/.test(closedPage.text),
    "closed draft page leaked its private title",
  );
  assert(
    [404, 503].includes(closedApi.response.status),
    `closed draft API returned ${closedApi.response.status}`,
  );
  assert(
    /not found|no published show/i.test(`${closedPage.text} ${closedApi.text}`),
    "closed draft was not leftover-honest",
  );

  if (cloneApi.response.status === 200) {
    const clonePayload = JSON.parse(cloneApi.text);
    assert(clonePayload.show?.slug === CLONE_SLUG, "clone API served another slug");
    assert(clonePayload.dataSource === "database", "empty clone must come from its own D1 rows");
    assert(Array.isArray(clonePayload.songs) && clonePayload.songs.length === 0, "empty clone inherited songs");
    assert(
      (clonePayload.sets || []).every((set) => !set.time),
      "empty clone inherited set times",
    );
    assert(clonePage.response.ok, "published empty clone page should render");
    assert(
      /data-has-verified-list="false"/.test(clonePage.text),
      "empty clone page did not stay empty",
    );
    assert(
      /no official set yet|no verified list yet|does not have a verified list/i.test(
        clonePage.text,
      ),
      "empty clone page is missing honest empty copy",
    );
    assert(
      /This public share link is live/.test(clonePage.text),
      "empty clone page is missing public-share honesty",
    );
    console.log("hosted leftover-honesty: D1-present empty clone stayed empty");
    return "database-empty-clone";
  }

  assert(
    [404, 503].includes(cloneApi.response.status),
    `clone API returned ${cloneApi.response.status}`,
  );
  if (cloneApi.response.status === 503) {
    assert(cloneApi.response.headers.get("retry-after") === "30", "clone 503 missing Retry-After");
  }
  assert(
    /temporarily unavailable|not found|does not have a verified list/i.test(
      `${clonePage.text} ${cloneApi.text}`,
    ),
    "clone failure was not leftover-honest",
  );
  console.log("hosted leftover-honesty: D1-absent clone did not inherit another set");
  return "unavailable-clone";
}

const seed = await seedLocalD1();
if (seed.ok) {
  console.log("hosted leftover-honesty: seeded local D1 empty clone");
} else {
  console.log("hosted leftover-honesty: local D1 seed skipped");
  if (seed.output.trim()) console.log(seed.output.trim().slice(0, 800));
}

const existing = await findExistingServer();
if (existing) {
  BASE = existing;
  const mode = await proveIsolation();
  console.log(`hosted leftover-honesty / isolation passed (${mode}) on ${BASE}`);
  process.exit(0);
}

const child = spawn("npx", ["vinext", "dev", "--host", HOST, "--port", PORT], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    PORT,
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

let logs = "";
child.stdout.on("data", (chunk) => {
  logs += chunk;
});
child.stderr.on("data", (chunk) => {
  logs += chunk;
});

try {
  await waitForServer(child);
  const mode = await proveIsolation();
  console.log(`hosted leftover-honesty / isolation passed (${mode})`);
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  try {
    await Promise.race([once(child, "exit"), delay(3000)]);
  } catch {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}
