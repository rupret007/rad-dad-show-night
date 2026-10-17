// v2 could cache owner responses; v3 could announce readiness without JS/CSS;
// v4 shipped separately (R13 HTML verification), so R14 readiness rules take v5.
const CACHE_NAME = "rad-dad-show-offline-v5";
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
      event.ports[0]?.postMessage({ ...result, cacheVersion: 4 });
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
  // Owner reads must reach the authenticated network. Never open a cache or
  // manufacture an offline response that could be mistaken for write authority.
  if (url.pathname === "/api/show" && !isPublicShowUrl(url)) return;

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
        (!url.pathname.startsWith("/api/") || isPublicShowUrl(url))
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
    const showResponse = await fetch(showApiUrl, { cache: "no-store", credentials: "omit" });
    if (!(await showApiMatchesRequest(showApiUrl, showResponse))) {
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
        const response = await fetch(url, { cache: "no-store", credentials: "omit" });
        if (!response.ok) return null;
        if (new URL(url, self.location.origin).pathname === "/api/show" &&
            !(await showApiMatchesRequest(url, response))) return null;
        if ((new URL(url, self.location.origin).pathname === "/" ||
             response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() === "text/html") &&
            !(await showHtmlMatchesRequest(url, response))) return null;
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

  const showUrls = urls.filter((value) => {
    const url = new URL(value, self.location.origin);
    return url.pathname === "/" || url.pathname === "/api/show";
  });
  // Every requested public resource is required, including extensionless scripts
  // and styles. A fetch or cache-write failure must not certify a partial copy.
  const requiredUrls = urls;
  return {
    ready:
      showUrls.length >= 3 &&
      requiredUrls.every((url) => cachedUrls.has(url)),
    cached: cachedUrls.size,
  };
}

async function networkFirst(request, timeoutMs, navigation) {
  const cache = await caches.open(CACHE_NAME);
  const isShowApi = new URL(request.url).pathname === "/api/show";
  const networkRequest = isShowApi ? new Request(request, { credentials: "omit" }) : request;
  const network = fetch(networkRequest).then(async (response) => {
    const verifiedShowApi =
      !isShowApi || (await showApiMatchesRequest(request.url, response));
    if (isShowApi && (response.headers.get("X-Rad-Dad-Read-Scope") !== "public" ||
        response.headers.get("X-Rad-Dad-Data-Source") === "owner-database" ||
        (response.ok && !verifiedShowApi && !(await showApiMatchesRequest(request.url, response, true))))) {
      throw new Error("Unverified public show response");
    }
    // Navigations are cached only by CACHE_SHOW after each fetched HTML body
    // proves its own show and database source, independently of the open page.
    if (response.ok && !navigation && verifiedShowApi) {
      await cache.put(request, response.clone());
    }
    return response;
  });
  try {
    return await withTimeout(network, timeoutMs);
  } catch {
    const exact = await cache.match(request);
    if (exact && (!isShowApi || await showApiMatchesRequest(request.url, exact))) {
      return markOfflineResponse(exact);
    }
    if (exact && isShowApi) await cache.delete(request);
    if (navigation) {
      const related = await findRelatedShowPage(cache, new URL(request.url));
      if (related) return markOfflineResponse(related);
      return (await cache.match("/offline.html")) || Response.error();
    }
    return new Response(
      JSON.stringify({ error: "Offline and no saved show data is available." }),
      { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
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

function isPublicShowUrl(url) {
  return url.origin === self.location.origin && url.pathname === "/api/show" &&
    !url.searchParams.has("scope");
}

async function showHtmlMatchesRequest(requestUrl, response) {
  const url = new URL(requestUrl, self.location.origin);
  const slug = url.searchParams.get("show");
  if (url.origin !== self.location.origin || url.pathname !== "/" ||
      !slug || url.searchParams.getAll("show").length !== 1 ||
      !response.ok || response.redirected ||
      (response.url && response.url !== url.href) ||
      response.headers.get("X-Rad-Dad-Offline") === "1" ||
      response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "text/html") return false;

  const html = await response.clone().text();
  // Service workers have no DOMParser. Tokenize the server's HTML tags, keeping
  // quoted attributes intact and ignoring comments and inert/raw-text content.
  // Proof must be on one real div, never assembled from unrelated text/props.
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][\w:-]*)(?=[\t\n\f\r />])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const inertElements = [];
  let scannedUntil = 0;
  let roots = 0;
  let match;
  const escapedSlug = slug.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;",
  })[char]);
  while ((match = tags.exec(html))) {
    // A global regexp can resume inside a malformed tag/quoted attribute. Such
    // text is not a fresh tag in the browser, so never skip an unmatched "<".
    if (html.slice(scannedUntil, match.index).includes("<")) return false;
    scannedUntil = tags.lastIndex;
    const tag = match[1]?.toLowerCase();
    if (!tag) {
      if (!match[0].startsWith("<!--") && !/^<!doctype\s+html\s*>$/i.test(match[0])) return false;
      continue;
    }
    // Frameset documents use different tree-building rules even after the
    // frameset closes. This app emits body documents, so decline them entirely.
    if (tag === "frame" || tag === "frameset") return false;
    const closing = match[0].startsWith("</");
    // Templates and form select contents cannot supply a rendered show-page
    // root. Keep matched contexts so neither can supply page proof.
    if (tag === "template" || tag === "select") {
      if (closing) {
        if (inertElements.pop() !== tag) return false;
      } else {
        inertElements.push(tag);
      }
      continue;
    }
    if (!closing && /^(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)$/.test(tag)) {
      const end = new RegExp(`</${tag}[\\t\\n\\f\\r ]*>`, "gi");
      end.lastIndex = tags.lastIndex;
      const endMatch = end.exec(html);
      if (!endMatch) return false;
      // Legacy script comments can enter HTML's double-escaped script state,
      // where the first </script> is still text. The app emits ordinary scripts;
      // decline this ambiguous serialization instead of trusting apparent tags.
      if (tag === "script" && html.slice(tags.lastIndex, endMatch.index).includes("<!--")) return false;
      tags.lastIndex = end.lastIndex;
      scannedUntil = end.lastIndex;
      continue;
    }
    if (!closing && tag === "plaintext") return false;
    if (closing || inertElements.length || tag !== "div") continue;
    const attributes = new Map();
    const duplicates = new Set();
    const attributeText = match[0].slice(4, -1);
    const attributePattern = /[\t\n\f\r ]+([^\t\n\f\r "'=<>/`]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r "'=<>`]+)))?/gy;
    let attributeEnd = 0;
    while (!/^[\t\n\f\r ]*\/?$/.test(attributeText.slice(attributeEnd))) {
      // Consume attributes without gaps. Searching ahead could mistake proof
      // inside a malformed, slash-delimited or adjacent quoted value for attrs.
      attributePattern.lastIndex = attributeEnd;
      const attribute = attributePattern.exec(attributeText);
      if (!attribute) return false;
      attributeEnd = attributePattern.lastIndex;
      const name = attribute[1].toLowerCase();
      if (attributes.has(name)) duplicates.add(name);
      attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    }
    if (!attributes.has("data-show-slug") && !attributes.has("data-show-source")) continue;
    if (duplicates.size || attributes.get("data-show-slug") !== escapedSlug ||
        attributes.get("data-show-source") !== "database") return false;
    roots += 1;
  }
  return roots === 1 && inertElements.length === 0 && !html.slice(scannedUntil).includes("<");
}

async function showApiMatchesRequest(requestUrl, response, allowConfirmedFallback = false) {
  const url = new URL(requestUrl, self.location.origin);
  const dataSource = response.headers.get("X-Rad-Dad-Data-Source");
  if (!isPublicShowUrl(url) || !response.ok ||
      (dataSource !== "database" && !(allowConfirmedFallback && dataSource === "confirmed-fallback")) ||
      response.headers.get("X-Rad-Dad-Read-Scope") !== "public" ||
      response.headers.get("X-Rad-Dad-Offline") === "1") return false;
  const requestedSlug = url.searchParams.get("show");
  try {
    const payload = await response.clone().json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        payload.dataSource !== dataSource || payload.show?.status !== "published" ||
        typeof payload.show?.id !== "string" || !payload.show.id ||
        typeof payload.show?.slug !== "string" || !payload.show.slug ||
        !Array.isArray(payload.songs) || payload.songs.length > 180 ||
        ["setWriteVersions", "reviewedVersion", "reviewedBase"].some((key) =>
          Object.prototype.hasOwnProperty.call(payload, key))) return false;
    if (requestedSlug && payload.show.slug !== requestedSlug) return false;
    if (
      payload.songs.some((song) => !song || typeof song !== "object" || Array.isArray(song) ||
        song.showId !== payload.show.id || song.rehearsalNotes !== "")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
