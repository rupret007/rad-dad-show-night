import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.WORKER_IMAGE_FIXTURE_PORT || 3012);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, "invalid local fixture port");
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close((error) => error ? reject(error) : resolve()));
});

// Execute the built artifact locally, including its generated binding config.
// No remote binding, migration, deployment or image-service request is needed.
const child = spawn("npx", ["wrangler", "dev", "--config", "dist/server/wrangler.json",
  "--local", "--ip", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
let logs = "";
for (const pipe of [child.stdout, child.stderr]) pipe.on("data", (data) => { logs += data; });
const read = (path) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    assert.equal(child.exitCode, null, "compiled worker exited before readiness");
    try {
      const response = await read("/icon-180.png");
      ready = response.ok;
      await response.body?.cancel();
      if (ready) break;
    } catch { /* Wait only for this newly started process. */ }
    await delay(500);
  }
  assert(ready, "compiled worker did not become ready");

  const expected = await readFile("public/icon-180.png");
  for (const route of ["/_next/image", "/_vinext/image"]) {
    const response = await read(`${route}?url=%2Ficon-180.png&w=640&q=75`);
    assert.equal(response.status, 200, `${route} must serve a local image`);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(response.headers.get("Content-Security-Policy"), /sandbox/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    for (const url of ["https://example.invalid/image.png", "//example.invalid/image.png", "/favicon.svg"]) {
      const rejected = await read(`${route}?url=${encodeURIComponent(url)}&w=640&q=75`);
      assert.equal(rejected.status, 400, `${route} must reject ${url}`);
      await rejected.body?.cancel();
    }
  }
  console.log("compiled worker: both image routes, local asset bytes, security headers and blocked sources PASS");
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  const exited = once(child, "exit");
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    await exited;
  }
}
