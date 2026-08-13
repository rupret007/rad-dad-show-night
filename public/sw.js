const CACHE_NAME = "rad-dad-show-offline-v1";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-180.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("rad-dad-show-offline-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_SHOW" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    cacheShowResources(event.data.urls).then((result) => {
      event.ports[0]?.postMessage(result);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/show-control")) return;
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/show") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, 4000, true));
    return;
  }
  if (url.pathname === "/api/show") {
    event.respondWith(networkFirst(request, 3000, false));
    return;
  }
  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheShowResources(values) {
  const cache = await caches.open(CACHE_NAME);
  const urls = values.filter((value) => {
    try {
      const url = new URL(value, self.location.origin);
      return (
        url.origin === self.location.origin &&
        !url.pathname.startsWith("/show-control") &&
        (!url.pathname.startsWith("/api/") || url.pathname === "/api/show")
      );
    } catch {
      return false;
    }
  });
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to cache ${url}`);
      await cache.put(url, response.clone());
    }),
  );
  const cached = results.filter((result) => result.status === "fulfilled").length;
  return { ready: cached >= Math.min(3, urls.length), cached };
}

async function networkFirst(request, timeoutMs, navigation) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  try {
    return await withTimeout(network, timeoutMs);
  } catch {
    const exact = await cache.match(request);
    if (exact) return markOfflineResponse(exact);
    if (navigation) {
      const related = await findRelatedShowPage(cache, new URL(request.url));
      if (related) return markOfflineResponse(related);
      return (await cache.match("/offline.html")) || Response.error();
    }
    return new Response(
      JSON.stringify({ error: "Offline and no saved show data is available." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function findRelatedShowPage(cache, requestedUrl) {
  const showSlug = requestedUrl.searchParams.get("show");
  if (!showSlug) return null;
  const keys = await cache.keys();
  const match = keys.find((key) => {
    const url = new URL(key.url);
    return url.pathname === "/" && url.searchParams.get("show") === showSlug;
  });
  return match ? cache.match(match) : null;
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout")), timeoutMs),
    ),
  ]);
}

function markOfflineResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Rad-Dad-Offline", "1");
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
