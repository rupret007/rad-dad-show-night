import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/show-control/show-control.module.css", import.meta.url), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped} \\{([^}]+)\\}`));
  assert.ok(match, `Missing rule for ${selector}`);
  return match[1];
}

for (const selector of [".quickTools button, .quickTools a", ".deleteButton", ".ownerStrip a"]) {
  test(`${selector} has readable 44px targets without adopting Save's fill`, () => {
    const declarations = rule(selector);
    assert.match(declarations, /min-height: 44px;/);
    assert.match(declarations, /font-size: 0\.875rem;/);
    assert.doesNotMatch(declarations, /background: var\(--lime\)/);
  });
}

test("owner song tools retain wrapping and explicit visible keyboard outlines", () => {
  assert.match(rule(".quickTools"), /flex-wrap: wrap/);
  assert.match(rule(".ownerStrip"), /flex-wrap: wrap/);
  assert.match(rule(".ownerStrip a"), /max-width: 100%/);
  assert.match(rule(".quickTools button, .quickTools a"), /max-width: 100%/);
  for (const selector of [".quickTools button:focus-visible", ".quickTools a:focus-visible", ".deleteButton:focus-visible", ".ownerStrip a:focus-visible"]) {
    const selectorAt = styles.indexOf(selector);
    assert.ok(selectorAt >= 0, `Missing ${selector}`);
    const block = styles.slice(styles.indexOf("{", selectorAt), styles.indexOf("}", selectorAt));
    assert.match(block, /outline: 3px solid var\(--blue\)/);
    assert.match(block, /outline-offset: 3px/);
  }
  assert.match(rule(".saveActions .saveButton"), /background: var\(--lime\)/);
});
