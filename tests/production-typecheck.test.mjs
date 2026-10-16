import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const config = ts.getParsedCommandLineOfConfigFile(path.join(root, "tsconfig.json"), {
  incremental: false,
}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
  throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
} });
assert.ok(config);
assert.deepEqual(config.errors, []);

function check(overrides = new Map()) {
  const host = ts.createCompilerHost(config.options);
  const read = host.readFile;
  const exists = host.fileExists;
  host.readFile = (filename) => overrides.get(path.resolve(filename)) ?? read(filename);
  host.fileExists = (filename) => overrides.has(path.resolve(filename)) || exists(filename);
  const program = ts.createProgram({
    rootNames: [...new Set([...config.fileNames, ...overrides.keys()])],
    options: config.options,
    host,
  });
  return ts.getPreEmitDiagnostics(program);
}

const contractPath = path.join(root, "types", "production-contract-fixture.ts");
const contract = `
import { env } from "cloudflare:workers";
import { RUN_OF_SHOW, type RunOfShowBlock } from "../lib/show-data";
import { buildShowSets, featuredGuestSet } from "../lib/show-read-integrity";
const customBlock: RunOfShowBlock = {
  time: "6:15-6:50", duration: "35 min", title: "Another night",
  note: "Different schedule", type: "performance", accent: "pink", setSlug: "rad-dad",
};
const timeline: readonly RunOfShowBlock[] = [customBlock];
buildShowSets(RUN_OF_SHOW);
buildShowSets(timeline);
featuredGuestSet(RUN_OF_SHOW);
featuredGuestSet(timeline);
const statement: D1PreparedStatement = env.DB.prepare("SELECT id FROM songs WHERE id = ?").bind(1);
const row = await statement.first<{ id: number }>();
const id: number | undefined = row?.id;
const rows: D1Result<{ id: number }>[] = await env.DB.batch<{ id: number }>([statement]);
const ids: number[] = rows[0].results.map((song) => song.id);
void id; void ids;
`;

function messages(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  });
}

test("full project checks every production TypeScript file and readonly/database contracts", () => {
  for (const directory of ["app", "lib", "db", "worker", "build"]) {
    for (const file of readdirSync(path.join(root, directory), { recursive: true })) {
      if (/\.(?:ts|tsx|mts)$/.test(file)) {
        assert.ok(config.fileNames.includes(path.join(root, directory, file)), `${directory}/${file} must be checked`);
      }
    }
  }
  const diagnostics = check(new Map([[contractPath, contract]]));
  assert.equal(diagnostics.length, 0, messages(diagnostics));
});

test("production checker rejects server errors and unsafe D1 usage without suppressions", () => {
  const files = ["lib/show-store.ts", "db/index.ts", "app/api/show/route.ts", "app/api/shows/route.ts", "worker/index.ts"];
  const overrides = new Map(files.map((file) => {
    const filename = path.join(root, file);
    return [filename, `${readFileSync(filename, "utf8")}\nconst regressionProbe: number = "must fail";\n`];
  }));
  overrides.set(contractPath, `${contract}
env.DB.prepare(42);
env.DB.missingMethod();
const wrongType: string = row!.id;
const missingNullCheck: number = row.id;
`);
  const diagnostics = check(overrides);
  for (const file of files) {
    assert.ok(diagnostics.some((item) => item.file?.fileName === path.join(root, file) && item.code === 2322), `Gate must reject errors in ${file}`);
  }
  const contractErrors = diagnostics.filter((item) => item.file?.fileName === contractPath);
  assert.deepEqual(contractErrors.map((item) => item.code).sort(), [2345, 2339, 2322, 18047].sort(), messages(contractErrors));
  assert.equal(diagnostics.length, files.length + contractErrors.length, messages(diagnostics));
});

test("CI runs full production checks and preserves the scoped gate", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit --incremental false");
  assert.equal(pkg.scripts["typecheck:suggestions"], "tsc --project tsconfig.suggestions.json");
  const workflow = readFileSync(path.join(root, ".github/workflows/leftover-honesty.yml"), "utf8");
  for (const script of ["typecheck", "typecheck:suggestions", "test:types"]) {
    assert.ok(workflow.split("\n").includes(`      - run: npm run ${script}`), `${script} must run in CI`);
  }
});
