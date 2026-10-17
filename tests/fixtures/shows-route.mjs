import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as showCloneValidation from "../../lib/show-clone-validation.ts";
import * as showPublic from "../../lib/show-public.ts";
import * as lifecycle from "../../lib/show-lifecycle.ts";

const source = await readFile(new URL("../../app/api/shows/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Execute the complete production handler with explicit offline auth/storage seams.
export function loadShowsRoute({ db, getAdminUser, store }) {
  if (typeof getAdminUser !== "function") throw new Error("An explicit synthetic auth fixture is required");
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule, exports: routeModule.exports, Response, crypto: webcrypto,
    require(id) {
      if (id === "cloudflare:workers") return { env: { DB: db } };
      if (id === "../../../lib/admin-access") return { getAdminUser };
      if (id === "../../../lib/show-clone-validation") return showCloneValidation;
      if (id === "../../../lib/show-public") return showPublic;
      if (id === "../../../lib/show-lifecycle") return lifecycle;
      if (id === "../../../lib/show-store") return store;
      throw new Error(`Unexpected route dependency: ${id}`);
    },
  });
  return routeModule.exports;
}

export function cloneRequest(overrides = {}) {
  return new Request("https://fixture.invalid/api/shows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "clone", sourceSlug: "hours-source-night", showDate: "2026-10-31", copySongs: false, ...overrides }),
  });
}
