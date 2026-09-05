import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as identity from "../../lib/official-set-identity.ts";
import * as showData from "../../lib/show-data.ts";
import * as resources from "../../lib/song-resources.ts";

const source = await readFile(new URL("../../app/api/show/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Actual route code with an explicit fixture owner and fixture-only storage.
 * No product authentication override, HTTP listener, or provider access exists.
 */
export function loadOfficialSetRoute({ db, getAdminUser, store }) {
  if (typeof getAdminUser !== "function") throw new Error("An explicit synthetic auth fixture is required");
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule, exports: routeModule.exports, Response,
    require(id) {
      if (id === "cloudflare:workers") return { env: { DB: db } };
      if (id === "../../../lib/admin-access") return { getAdminUser };
      if (id === "../../../lib/show-data") return showData;
      if (id === "../../../lib/song-resources") return resources;
      if (id === "../../../lib/official-set-identity") return identity;
      if (id === "../../../lib/show-read-integrity") return { isShowDataUnavailableError: () => false };
      if (id === "../../../lib/show-visibility") return { isShowNotFoundError: (error) => error?.name === "ShowNotFoundError" };
      if (id === "../../../lib/show-store") return store;
      throw new Error(`Unexpected route dependency: ${id}`);
    },
  });
  return routeModule.exports;
}
