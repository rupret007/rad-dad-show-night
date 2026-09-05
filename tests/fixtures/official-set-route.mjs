import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";
import * as identity from "../../lib/official-set-identity.ts";
import * as ownerSetSave from "../../lib/owner-set-save.ts";
import * as showData from "../../lib/show-data.ts";
import * as resources from "../../lib/song-resources.ts";
import * as integrity from "../../lib/show-read-integrity.ts";
import * as visibility from "../../lib/show-visibility.ts";
import * as showPublic from "../../lib/show-public.ts";

const source = await readFile(new URL("../../app/api/show/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const storeSource = await readFile(new URL("../../lib/show-store.ts", import.meta.url), "utf8");
const compiledStore = ts.transpileModule(storeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

export function loadOfficialShowStore(db) {
  const storeModule = { exports: {} };
  vm.runInNewContext(compiledStore, {
    module: storeModule, exports: storeModule.exports,
    require(id) {
      if (id === "cloudflare:workers") return { env: { DB: db } };
      if (id === "drizzle-orm") return orm;
      if (id === "../db") return { getDb: () => drizzle(db) };
      if (id === "../db/schema") return schema;
      if (id === "./show-data") return showData;
      if (id === "./song-resources") return resources;
      if (id === "./owner-set-save") return ownerSetSave;
      if (id === "./show-read-integrity") return integrity;
      if (id === "./show-visibility") return visibility;
      if (id === "./show-public") return showPublic;
      throw new Error(`Unexpected store dependency: ${id}`);
    },
  });
  return storeModule.exports;
}

/** Actual route code with an explicit fixture owner and fixture-only storage.
 * No product authentication override, HTTP listener, or provider access exists.
 */
export function loadOfficialSetRoute({ db, getAdminUser, store, clock = Date }) {
  if (typeof getAdminUser !== "function") throw new Error("An explicit synthetic auth fixture is required");
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule, exports: routeModule.exports, Response, URL, crypto: webcrypto, Date: clock,
    require(id) {
      if (id === "cloudflare:workers") return { env: { DB: db } };
      if (id === "../../../lib/admin-access") return { getAdminUser };
      if (id === "../../../lib/show-data") return showData;
      if (id === "../../../lib/song-resources") return resources;
      if (id === "../../../lib/official-set-identity") return identity;
      if (id === "../../../lib/owner-set-save") return ownerSetSave;
      if (id === "../../../lib/show-read-integrity") return integrity;
      if (id === "../../../lib/show-visibility") return { isShowNotFoundError: (error) => error?.name === "ShowNotFoundError" };
      if (id === "../../../lib/show-store") return { ...loadOfficialShowStore(db), ...store };
      throw new Error(`Unexpected route dependency: ${id}`);
    },
  });
  return routeModule.exports;
}
