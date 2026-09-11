# Show Night dependency close-out

Marker: BOB_CODEX_CLOSEOUT_20260908. This continues draft #31; independent
Karen leftover + security review must cover its new exact tip. No deployment,
live D1, migration 0003, booking, posting, or merge is authorized here.

## Findings and narrowly scoped changes

The starting lockfile audit reported 21 affected packages: 15 high, 5 moderate,
1 low. `npm audit --omit=dev` reported zero, but that is not a runtime safety
claim: `worker/index.ts` imports Vinext from devDependencies into the worker.

| Dependency path | Applicability and change |
| --- | --- |
| Vinext → image-size 2.0.2 | Malformed ICNS/JXL/HEIF parsing advisories have no patched image-size release in the audit. Vinext beta.6 removes this dependency. Its image and app-router code participates in the runtime, so a dev-only audit would miss this path. |
| Vite 8.0.13 | Windows development-server file-disclosure findings; update within the 8.0 line to 8.0.16. These are local tooling findings, not evidence of a deployed Show Night exploit. |
| Cloudflare Vite plugin / Wrangler / Miniflare | Update to plugin 1.47.0 and Wrangler 4.114.0, which use stable Miniflare 4.20260722.0 and patched sharp/ws/esbuild paths. Override only that Miniflare version's Undici to 7.29.0 for its remaining high advisories. The available parent update with fixed Undici instead moves to Miniflare 5 alpha; this patch preserves the stable major. Remove the targeted override when a tested stable parent supplies an unaffected version. |
| Vinext peer | Update @vitejs/plugin-rsc to 0.5.34 to satisfy beta.6's declared peer requirement. |
| Transitive tooling | Refresh compatible Babel/core, brace-expansion, browserslist, fast-uri, fflate, js-yaml, nanoid and postcss resolutions identified by the audit. No application dependency major upgrade. |

Vinext beta.6 generates `/_next/image`, retaining `/_vinext/image` as an alias.
The custom Cloudflare worker now uses the vendor's path matcher for both.
A compiled-worker request reproduced HTTP 500 because its generated configuration
did not bind ASSETS. The Vite configuration now includes that local asset binding.
Without the optional IMAGES service, it serves the validated source raster with
security headers; it does not call a remote transform service. The handler is tested
with those binding contracts: both routes, trailing slash, a valid local image,
headers, remote/protocol-relative/backslash URLs, invalid/duplicate parameters,
SVG/HTML rejection, missing assets, absent IMAGES and app-route passthrough. No network image
source, authentication, or owner-write path is added.

## Remaining findings

The resulting full audit reports **4 moderate, 0 high, 0 critical, 0 low**.
These four package entries describe one advisory, not four independent flaws:
Drizzle Kit 0.31.10 → @esbuild-kit/esm-loader → @esbuild-kit/core-utils →
esbuild 0.18.20, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
The issue concerns cross-origin reads from esbuild's development server.

The installed core-utils implementation calls esbuild transform/transformSync;
it does not start that server. Show Night uses Drizzle Kit for `db:generate`,
not the worker's request path. This supports a tooling-only assessment for the
repository's current usage; it does not make the vulnerable package safe for
other uses. Do not expose that legacy esbuild server. Revisit when Drizzle Kit
ships a compatible loader without it. npm's proposed fix downgrades Drizzle Kit
to 0.18.1; neither that unrelated downgrade nor a forced esbuild major override
is justified here. Migration 0003 and live D1 remain Jeff-only.

CI now runs `npm audit --audit-level=high` after the frozen install. Moderate
findings remain visible and documented rather than hidden with `--omit=dev`.
Audit results are time-dependent; future new high/critical findings fail CI.

## Verification boundary

Run the required isolation (including worker-image regressions), disposable D1,
lint, targeted typecheck, production build, Chromium fixtures, and local
`leftover:hosted` gate. The latter starts `vinext dev` against disposable local
D1: it verifies SSR/API isolation, not an installed production deployment.
The local gate now uses Vinext's `--hostname` flag; the obsolete `--host` silently
left a requested IPv4 fixture listening on localhost instead. The production
build is a separate check, followed by `test:worker`: it executes the compiled
worker and generated binding configuration with Wrangler `--local`, proving
image bytes, both routes, security headers and rejected sources over HTTP.
Cloudflare's live image service and
live database remain unverified until Jeff authorizes a deployment/live check.

`lib/show-data.ts`, official set data, migrations and outbound fences are held.
Hosted CI and self-review do not substitute for independent Karen PASS.
