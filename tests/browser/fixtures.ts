import { test as base, expect } from "@playwright/test";
import { OFFLINE_ORIGIN, OFFLINE_WEBSOCKET_ORIGIN } from "./fixture-origin";

export { OFFLINE_ORIGIN };

// Every browser spec must import this test instead of the unguarded base test.
// page.route handlers run before these context routes, so specs can fulfill or
// abort the precise fixture API requests they own. Any forgotten handler fails
// the test and is aborted, including requests from popups or secondary pages.
export const test = base.extend<{ offlineNetwork: void }>({
  offlineNetwork: [
    async ({ context }, use) => {
      const unexpectedRequests: string[] = [];
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== OFFLINE_ORIGIN) {
          unexpectedRequests.push(`Blocked external ${request.method()} ${url.origin}${url.pathname}`);
          await route.abort("blockedbyclient");
          return;
        }
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          unexpectedRequests.push(`Unmocked ${request.method()} ${url.pathname}`);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      await context.routeWebSocket("**/*", (socket) => {
        // Vite's local client opens its own socket even with file HMR disabled.
        // Permit only that exact loopback endpoint, never a provider socket.
        const url = new URL(socket.url());
        if (url.origin === OFFLINE_WEBSOCKET_ORIGIN && url.pathname === "/") {
          socket.connectToServer();
          return;
        }
        unexpectedRequests.push("Blocked an unexpected WebSocket connection");
        socket.close();
      });
      await use();
      expect(
        unexpectedRequests,
        "Offline browser tests must mock every API request and must not contact external services.",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
