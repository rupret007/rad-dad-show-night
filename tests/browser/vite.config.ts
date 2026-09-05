import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureLinkId = "\0show-night-offline-link";

function offlineComponentsOnly(): Plugin {
  return {
    name: "show-night-offline-components-only",
    resolveId(source) {
      // Navigation is not under test. A test-only anchor avoids booting vinext
      // routing or link prefetch while retaining the component's real hrefs.
      return source === "next/link" ? fixtureLinkId : null;
    },
    load(id) {
      if (id !== fixtureLinkId) return null;
      return `
        import { createElement } from "react";
        export default function OfflineLink({ href, children, ...props }) {
          return createElement("a", { ...props, href }, children);
        }
      `;
    },
    configureServer(server) {
      // No API route or proxy exists in this fixture. Tests must fulfill or
      // abort every API request explicitly; never run a connected backend.
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1:4317").pathname;
        if (pathname === "/api" || pathname.startsWith("/api/")) {
          response.statusCode = 501;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "Offline test API requests must be mocked." }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: fixtureRoot,
  publicDir: false,
  // Do not load the repository's .env files or its Cloudflare/vinext config.
  envDir: false,
  envPrefix: "SHOW_NIGHT_BROWSER_FIXTURE_",
  plugins: [offlineComponentsOnly(), react()],
  css: { postcss: { plugins: [] } },
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
    hmr: false,
    fs: { strict: true, allow: [repositoryRoot] },
    watch: { useFsEvents: false, usePolling: true },
  },
});
