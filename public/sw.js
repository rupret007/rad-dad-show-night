const CACHE_NAME = "rad-dad-show-offline-v2";
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
  const showApiUrl = urls.find(
    (value) => new URL(value, self.location.origin).pathname === "/api/show",
  );
  if (!showApiUrl) return { ready: false, cached: 0 };

  try {
    const showResponse = await fetch(showApiUrl, { cache: "no-store" });
    if (
      !showResponse.ok ||
      showResponse.headers.get("X-Rad-Dad-Data-Source") !== "database"
    ) {
      return { ready: false, cached: 0 };
    }
    await cache.put(showApiUrl, showResponse.clone());
  } catch {
    return { ready: false, cached: 0 };
  }

  const cachedUrls = new Set([showApiUrl]);
  const results = await Promise.all(
    urls.filter((url) => url !== showApiUrl).map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return null;
        await cache.put(url, response.clone());
        return url;
      } catch {
        return null;
      }
    }),
  );
  for (const url of results) {
    if (url) cachedUrls.add(url);
  }

  const requiredUrls = urls.filter((value) => {
    const url = new URL(value, self.location.origin);
    return url.pathname === "/" || url.pathname === "/api/show";
  });
  return {
    ready:
      requiredUrls.length >= 3 &&
      requiredUrls.every((url) => cachedUrls.has(url)),
    cached: cachedUrls.size,
  };
}

async function networkFirst(request, timeoutMs, navigation) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request).then(async (response) => {
    const verifiedShowApi =
      new URL(request.url).pathname !== "/api/show" ||
      response.headers.get("X-Rad-Dad-Data-Source") === "database";
    // Navigations are cached only by CACHE_SHOW after the rendered page proves
    // it came from D1. A transient fallback must never replace that copy.
    if (response.ok && !navigation && verifiedShowApi) {
      await cache.put(request, response.clone());
    }
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
