import { spawnSync } from "node:child_process";

// braces <=3.0.3 is still unpatched (GHSA-vfj7-8cjw-p6xm). Ignore only that
// advisory so leftover-honesty can stay honest about every other high.
const IGNORED = new Set(["GHSA-vfj7-8cjw-p6xm"]);

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
if (result.error) throw result.error;

const report = JSON.parse(result.stdout || "{}");
const remaining = [];

for (const [name, info] of Object.entries(report.vulnerabilities ?? {})) {
  if (info.severity !== "high" && info.severity !== "critical") continue;
  const vias = Array.isArray(info.via) ? info.via : [];
  const advisories = vias.filter((via) => via && typeof via === "object");
  const blocking = advisories.filter((via) => {
    const id = typeof via.url === "string" ? via.url.split("/").pop() : "";
    return (via.severity === "high" || via.severity === "critical") && !IGNORED.has(id);
  });
  if (blocking.length) remaining.push({ name, severity: info.severity, blocking });
}

if (remaining.length) {
  console.error("High/critical advisories remain:");
  for (const item of remaining) {
    for (const via of item.blocking) {
      console.error(`- ${item.name}: ${via.title} (${via.url})`);
    }
  }
  process.exit(1);
}

console.log("npm audit --audit-level=high: only ignored unpatched braces GHSA-vfj7-8cjw-p6xm remains");
process.exit(0);
