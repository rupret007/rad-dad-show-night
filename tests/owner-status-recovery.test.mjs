import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { ownerControlHarness } from "./helpers/owner-control-harness.mjs";
const source = process.env.OWNER_STATUS_COMPONENT_SOURCE ? fs.readFileSync(process.env.OWNER_STATUS_COMPONENT_SOURCE, "utf8") : undefined;
const harness = options => ownerControlHarness({ source, ...options });
const statusWrite = call => call.method === "POST";
function held(h) {
  assert.match(h.text(h.render()), /Show status unverified/);
  assert.match(h.text(h.render()), /may have changed/);
  assert.ok(h.button("Check show status"));
  assert.equal(h.button("Clone show"), undefined);
  assert.equal(h.button("Save Rad Dad"), undefined);
  assert.equal(h.button("Publish saved show"), undefined);
  assert.equal(h.button("Archive show"), undefined);
  assert.equal(h.find(n => n.props?.["data-share-open"]), undefined);
}

for (const status of ["draft", "published"]) {
  test(`lost ${status === "draft" ? "Publish" : "Archive"} receipt holds writes; authenticated recovery preserves drafts`, async () => {
    const h = await harness({ status });
    h.find(n => n.props?.["aria-label"] === "New song title").props.onChange({ target: { value: "Keep pending song" } });
    h.net.handle = async () => Response.json({ error: "Readback failed after update" }, { status: 500 });
    h.click(status === "draft" ? "Publish saved show" : "Archive show"); await h.settle(); held(h);
    const returned = status === "draft" ? "published" : "archived";
    h.net.handle = async () => h.reply({ ...h.show, status: returned });
    h.click("Check show status"); await h.settle();
    assert.ok(h.find(n => n.props?.["data-status"] === returned));
    assert.equal(h.find(n => n.props?.["aria-label"] === "New song title").props.value, "Keep pending song");
    assert.equal(h.calls.filter(statusWrite).length, 1);
    assert.match(h.calls.at(-1).url, /scope=owner/);
    assert.equal(h.calls.at(-1).cache, "no-store");
  });
}
for (const phase of ["request", "body"]) {
  test(`status ${phase} deadline ignores late success, including requests that ignore abort`, async () => {
    const h = await harness(); let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.net.handle = async () => phase === "request" ? pending : { ok: true, status: 200, headers: new Headers(), json: () => pending };
    h.click("Publish saved show"); await h.settle();
    h.expire(); await h.settle(); held(h);
    release(phase === "request" ? h.reply({ ...h.show, status: "published" }) : { show: { ...h.show, status: "published" } });
    await h.settle(); held(h);
    assert.equal(h.calls.filter(statusWrite).length, 1);
  });
}
for (const invalid of ["401", "500", "public", "offline", "wrong-id", "wrong-slug", "invalid-status", "malformed"]) {
  test(`recovery rejects ${invalid} and retains its write hold`, async () => {
    const h = await harness();
    h.net.handle = async () => { throw new Error("Lost response"); };
    h.click("Publish saved show"); await h.settle(); held(h);
    h.net.handle = async () => invalid === "malformed" ? Response.json(null) : h.reply({ ...h.show, status: "published",
      ...(invalid === "wrong-id" ? { id: "other" } : invalid === "wrong-slug" ? { slug: "other" }
        : invalid === "invalid-status" ? { status: "unknown" } : {}) },
      invalid === "401" || invalid === "500" ? { status: Number(invalid) }
        : invalid === "public" ? { headers: {} }
        : invalid === "offline" ? { headers: { "X-Rad-Dad-Read-Scope": "owner", "X-Rad-Dad-Data-Source": "owner-database", "X-Rad-Dad-Offline": "1" } } : {});
    h.click("Check show status"); await h.settle(); held(h);
    assert.match(h.text(h.render()), /Could not verify the current show status/);
    assert.equal(h.calls.filter(statusWrite).length, 1);
  });
}
for (const status of ["draft", "published", "archived"]) {
  test(`successful receipt announces the returned ${status} lifecycle`, async () => {
    const h = await harness();
    h.net.handle = async () => h.reply({ ...h.show, status });
    h.click("Publish saved show"); await h.settle();
    assert.ok(h.find(n => n.props?.["data-status"] === status));
    const notice = status === "published" ? /Fixture night is public at its saved share link\./
      : status === "draft" ? /Fixture night is a draft\. Its public share link is closed\./
      : /Fixture night is archived\. Its public share link is now closed\./;
    assert.match(h.text(h.render()), notice);
  });
}
for (const badReceipt of [null, {}, { status: "unknown" }, { id: "other" }, { slug: "other" }, { isDefault: "false" }]) {
  test(`invalid success receipt ${JSON.stringify(badReceipt)} requires recovery`, async () => {
    const h = await harness();
    h.net.handle = async () => Response.json(badReceipt === null ? null : { show: Object.keys(badReceipt).length ? { ...h.show, ...badReceipt } : {} });
    h.click("Publish saved show"); await h.settle(); held(h);
  });
}

for (const phase of ["request", "body"]) {
  test(`recovery ${phase} deadline stays held and ignores a late authenticated reply`, async () => {
    const h = await harness();
    h.net.handle = async () => { throw new Error("Lost receipt"); };
    h.click("Publish saved show"); await h.settle();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.net.handle = async () => phase === "request" ? pending : {
      ok: true, headers: h.reply().headers, json: () => pending,
    };
    h.click("Check show status"); await h.settle();
    h.expire(); await h.settle(); held(h);
    release(phase === "request" ? h.reply({ ...h.show, status: "published" }) : { show: { ...h.show, status: "published" } });
    await h.settle(); held(h);
    h.net.handle = async () => h.reply({ ...h.show, status: "published" });
    h.click("Check show status"); await h.settle();
    assert.ok(h.find(n => n.props?.["data-status"] === "published"));
    assert.equal(h.calls.filter(statusWrite).length, 1);
  });
}

test("stale event handlers cannot repeat status writes, save, clone, or switch during the hold", async () => {
  const h = await harness();
  h.click("Clone show");
  const publish = h.button("Publish saved show").props.onClick;
  const archive = h.button("Archive show").props.onClick;
  const save = h.button("Save Rad Dad").props.onClick;
  const switchShow = h.find(n => n.type === "select" && n.props.id === "show-picker").props.onChange;
  const clone = h.find(n => n.type === "form" && h.text(n).includes("Create draft")).props.onSubmit;
  h.net.handle = async () => { throw new Error("Lost receipt"); };
  publish(); publish(); archive(); save(); switchShow({ target: { value: "other" } });
  clone({ preventDefault() {} });
  await h.settle(); held(h);
  publish(); archive(); save(); switchShow({ target: { value: "other" } }); clone({ preventDefault() {} });
  await h.settle(); held(h);
  assert.equal(h.calls.filter(statusWrite).length, 1);
  assert.equal(h.calls.filter(call => call.url.includes("other")).length, 0);
});

test("unmount aborts a lifecycle request and ignores its later receipt", async () => {
  const h = await harness(); let release;
  h.net.handle = async () => new Promise(resolve => { release = resolve; });
  h.click("Publish saved show"); await h.settle();
  const signal = h.calls.at(-1).signal;
  h.unmount(); assert.equal(signal.aborted, true);
  release(h.reply({ ...h.show, status: "published" })); await h.settle();
  assert.match(h.text(h.render()), /Show status unverified/);
});
