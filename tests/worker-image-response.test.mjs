import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { imageResponse } from "../worker/image-response.ts";

const png = readFileSync(new URL("../public/icon-180.png", import.meta.url));

function fixture(contentType = "image/png", status = 200) {
  const fetched = [];
  const transformed = [];
  return {
    fetched, transformed,
    env: {
      ASSETS: {
        async fetch(request) {
          fetched.push(request.url);
          return new Response(png, { status, headers: { "Content-Type": contentType } });
        },
      },
      IMAGES: {
        input(body) {
          return { transform(options) {
            transformed.push(options);
            return { async output(output) {
              transformed.push(output);
              return { response: () => new Response(body, { headers: { "Content-Type": "image/webp" } }) };
            } };
          } };
        },
      },
    },
  };
}

function request(path, query = "url=%2Ficon-180.png&w=640&q=75") {
  return new Request(`https://show.example${path}?${query}`, { headers: { Accept: "image/webp" } });
}

for (const path of ["/_next/image", "/_vinext/image", "/_next/image/"]) {
  test(`${path} uses local assets and preserves image security headers`, async () => {
    const f = fixture();
    const response = await imageResponse(request(path), f.env);
    assert.equal(response.status, 200);
    assert.deepEqual(f.fetched, ["https://show.example/icon-180.png"]);
    assert.deepEqual(f.transformed, [{ width: 640 }, { format: "image/webp", quality: 75 }]);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(response.headers.get("Content-Security-Policy"), /sandbox/);
    assert.equal(response.headers.get("Vary"), "Accept");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  });
}

for (const query of [
  "url=https%3A%2F%2Fevil.example%2Fsecret&w=640&q=75",
  "url=%2F%2Fevil.example%2Fsecret&w=640&q=75",
  "url=%2F%5Cevil.example%2Fsecret&w=640&q=75",
  "url=%2Ficon-180.png&w=1&q=75",
  "url=%2Ficon-180.png&w=640&q=101",
  "url=%2Ficon-180.png&w=640&w=1080&q=75",
]) {
  test(`invalid image request is rejected before reading assets: ${query}`, async () => {
    const f = fixture();
    const response = await imageResponse(request("/_next/image", query), f.env);
    assert.equal(response.status, 400);
    assert.deepEqual(f.fetched, []);
    assert.deepEqual(f.transformed, []);
  });
}

for (const type of ["text/html", "image/svg+xml"]) {
  test(`${type} is rejected without invoking the image binding`, async () => {
    const f = fixture(type);
    assert.equal((await imageResponse(request("/_next/image"), f.env)).status, 400);
    assert.deepEqual(f.transformed, []);
  });
}

test("missing assets return 404 without transforming", async () => {
  const f = fixture("image/png", 404);
  assert.equal((await imageResponse(request("/_next/image"), f.env)).status, 404);
  assert.deepEqual(f.transformed, []);
});

test("an absent optional Images binding serves the local raster with safe headers", async () => {
  const f = fixture();
  const response = await imageResponse(request("/_next/image"), { ASSETS: f.env.ASSETS });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Security-Policy"), /sandbox/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});

test("other routes remain with the app router", () => {
  const f = fixture();
  assert.equal(imageResponse(request("/api/show"), f.env), null);
  assert.deepEqual(f.fetched, []);
});
