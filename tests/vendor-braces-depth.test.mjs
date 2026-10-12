import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const braces = require("braces");

test("vendor braces is the merged depth-guard fix, not published 3.0.3", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../vendor/braces/package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.name, "braces");
  assert.equal(pkg.version, "3.0.4");
  const parse = await readFile(
    new URL("../vendor/braces/lib/parse.js", import.meta.url),
    "utf8",
  );
  assert.match(parse, /maxDepth/);
  assert.match(parse, /exceeds max depth/);
});

test("vendor braces still expands ordinary set patterns", () => {
  assert.deepEqual(braces("{a,b,c}", { expand: true }), ["a", "b", "c"]);
  assert.deepEqual(braces("set-{1..3}", { expand: true }), [
    "set-1",
    "set-2",
    "set-3",
  ]);
});

test("vendor braces rejects the CVE-2026-93687 nested-depth bomb", () => {
  const nested = `${"{".repeat(101)}a${"}".repeat(101)}`;
  assert.throws(() => braces(nested), /max depth/);
  assert.doesNotThrow(() => braces(`${"{".repeat(100)}a${"}".repeat(100)}`));
});
