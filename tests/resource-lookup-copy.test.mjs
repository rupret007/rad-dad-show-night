import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { enrichSongResources } = await import("../lib/song-resource-enrichment.ts");
const { resourceLookupCompletionNotice } = await import("../lib/resource-lookup-notice.ts");
const { savedOfficialMediaUrl } = await import("../lib/song-resources.ts");

const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const technicalGuideUrl = new URL("../docs/TECHNICAL_GUIDE.md", import.meta.url);
const ownerGuideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);
const handoffUrl = new URL("../docs/OWNER_PUBLIC_SET_REVIEW_HANDOFF.md", import.meta.url);

const DIRECT_VIDEO = "https://www.youtube.com/watch?v=FixVideo000";
const DIRECT_LYRICS = "https://genius.com/The-fixture-band-harbor-lights-lyrics";
const SEARCH_LYRICS = "https://genius.com/search?q=Harbor+Lights";
const SEARCH_YOUTUBE = "https://www.youtube.com/results?search_query=Harbor+Lights";

const pastePrompt = /Paste the video you want to feature/;
const oldKeylessOnlySearch = /creates a YouTube search link and lets the owner/;

test("completion copy names an applied direct match as a candidate, not a paste prompt", () => {
  const curated = resourceLookupCompletionNotice("Harbor Lights", {
    source: "curated-exact",
    youtubeUrl: DIRECT_VIDEO,
    lyricsUrl: DIRECT_LYRICS,
  });
  assert.doesNotMatch(curated, pastePrompt);
  assert.match(curated, /Candidate YouTube and lyrics filled in for Harbor Lights/);
  assert.match(curated, /Save to put them on the public list/);
  assert.doesNotMatch(curated, /verified|owner-confirmed|publicly saved/i);

  const providers = resourceLookupCompletionNotice("Harbor Lights", {
    source: "verified-providers",
    youtubeUrl: DIRECT_VIDEO,
    lyricsUrl: DIRECT_LYRICS,
  });
  assert.equal(providers, curated);

  const videoOnly = resourceLookupCompletionNotice("Harbor Lights", {
    source: "partial-provider-match",
    youtubeUrl: DIRECT_VIDEO,
    lyricsUrl: SEARCH_LYRICS,
  });
  assert.doesNotMatch(videoOnly, pastePrompt);
  assert.match(videoOnly, /Candidate YouTube filled in for Harbor Lights/);
  assert.match(videoOnly, /Save to put it on the public list/);
  assert.doesNotMatch(videoOnly, /lyrics filled in/);
});

test("completion copy asks to paste only when no direct resource was applied", () => {
  const searchLinks = resourceLookupCompletionNotice("Harbor Lights", {
    source: "search-links",
    youtubeUrl: "",
    lyricsUrl: SEARCH_LYRICS,
  });
  assert.match(searchLinks, pastePrompt);
  assert.doesNotMatch(searchLinks, /Candidate/);
  assert.equal(savedOfficialMediaUrl(SEARCH_LYRICS), "");
  assert.equal(savedOfficialMediaUrl(SEARCH_YOUTUBE), "");

  const lyricsOnly = resourceLookupCompletionNotice("Harbor Lights", {
    source: "partial-provider-match",
    youtubeUrl: "",
    lyricsUrl: DIRECT_LYRICS,
  });
  assert.doesNotMatch(lyricsOnly, pastePrompt);
  assert.match(lyricsOnly, /Candidate lyrics filled in for Harbor Lights/);
  assert.match(lyricsOnly, /Paste a YouTube video if you want one, then Save/);
});

test("a youtube-api source does not override whether a direct video was applied", () => {
  const withVideo = resourceLookupCompletionNotice("Harbor Lights", {
    source: "youtube-api",
    youtubeUrl: DIRECT_VIDEO,
  });
  assert.doesNotMatch(withVideo, pastePrompt);
  assert.match(withVideo, /Candidate YouTube filled in/);

  const withoutVideo = resourceLookupCompletionNotice("Harbor Lights", {
    source: "youtube-api",
    youtubeUrl: "",
    lyricsUrl: SEARCH_LYRICS,
  });
  assert.match(withoutVideo, pastePrompt);
});

test("Show Control uses lookup availability instead of a youtube-api source", async () => {
  const source = await readFile(controlUrl, "utf8");
  assert.doesNotMatch(source, /youtube-api/);
  assert.match(source, /resourceLookupCompletionNotice\(song\.title, result\)/);
  assert.match(source, /lib\/resource-lookup-notice/);
  assert.match(source, /savedOfficialMediaUrl\(result\.youtubeUrl\)/);
  assert.doesNotMatch(source, /lib\/song-resource-enrichment/);
});

test("README and owner docs describe optional-key and public-lookup paths", async () => {
  const [readme, guide, ownerGuide, handoff] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(technicalGuideUrl, "utf8"),
    readFile(ownerGuideUrl, "utf8"),
    readFile(handoffUrl, "utf8"),
  ]);

  assert.doesNotMatch(readme, oldKeylessOnlySearch);
  assert.match(readme, /public YouTube search plus oEmbed/);
  assert.match(readme, /Genius lyrics lookup/);
  assert.match(readme, /draft candidate until\s+Save/);
  assert.match(readme, /never appear on the public list until the owner Saves/);

  assert.match(guide, /curated-exact/);
  assert.match(guide, /verified-providers/);
  assert.match(guide, /partial-provider-match/);
  assert.match(guide, /search-links/);
  assert.match(guide, /public YouTube search plus oEmbed/);
  assert.match(guide, /draft candidate\s+until the owner Saves/);
  assert.doesNotMatch(
    guide,
    /Without a key or match, it returns a safe\s+search fallback/,
  );

  assert.match(ownerGuide, /without it, Find resources still uses public YouTube search/);
  assert.match(ownerGuide, /A filled-in URL is a candidate until you Save/);
  assert.match(handoff, /Search links are not stored as official media/);
  assert.match(handoff, /Save\s+remains the publication step/);
});

test("keyless lookup still uses public YouTube search, oEmbed, and Genius", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;
  const requested = [];

  globalThis.fetch = async (input) => {
    const href = String(input);
    requested.push(href);
    assert.equal(href.includes("googleapis.com/youtube"), false, href);

    if (href.includes("genius.com/api/search/multi")) {
      return jsonOk({
        response: {
          sections: [
            {
              hits: [
                {
                  result: {
                    title: "Harbor Lights",
                    primary_artist_names: "The Fixture Band",
                    url: DIRECT_LYRICS,
                  },
                },
              ],
            },
          ],
        },
      });
    }

    if (href.includes("youtube.com/results")) {
      return textOk(youtubeSearchHtml("FixVideo000", "Harbor Lights Official Audio", "The Fixture Band"));
    }

    if (href.includes("youtube.com/oembed")) {
      return jsonOk({
        title: "Harbor Lights Official Audio",
        author_name: "The Fixture Band",
      });
    }

    throw new Error(`unexpected fetch ${href}`);
  };

  try {
    const result = await enrichSongResources("Harbor Lights", "The Fixture Band");
    assert.equal(result.source, "verified-providers");
    assert.equal(result.youtubeUrl, DIRECT_VIDEO);
    assert.equal(result.lyricsUrl, DIRECT_LYRICS);
    assert.equal(result.verified, true);
    assert.ok(requested.some((href) => href.includes("genius.com/api/search/multi")));
    assert.ok(requested.some((href) => href.includes("youtube.com/results")));
    assert.ok(requested.some((href) => href.includes("youtube.com/oembed")));
    assert.match(
      resourceLookupCompletionNotice("Harbor Lights", result),
      /Candidate YouTube and lyrics filled in/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});

test("keyless lookup keeps search links when providers do not match", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const href = String(input);
    assert.equal(href.includes("googleapis.com/youtube"), false, href);
    if (href.includes("genius.com/api/search/multi")) {
      return jsonOk({ response: { sections: [] } });
    }
    if (href.includes("youtube.com/results")) {
      return textOk("var ytInitialData = {\"contents\":{}};");
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  try {
    const result = await enrichSongResources("Harbor Lights", "The Fixture Band");
    assert.equal(result.source, "search-links");
    assert.equal(result.youtubeUrl, "");
    assert.equal(savedOfficialMediaUrl(result.lyricsUrl), "");
    assert.match(
      resourceLookupCompletionNotice("Harbor Lights", result),
      pastePrompt,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});

test("curated exact matches skip provider fetches", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    throw new Error(`curated match must not fetch ${String(input)}`);
  };
  try {
    const result = await enrichSongResources("Badfish", "Sublime");
    assert.equal(result.source, "curated-exact");
    assert.match(result.youtubeUrl, /youtube\.com\/watch\?v=/);
    assert.match(result.lyricsUrl, /genius\.com/);
    assert.doesNotMatch(
      resourceLookupCompletionNotice("Badfish", result),
      pastePrompt,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an accepted API video is a draft candidate and skips public YouTube lookup", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;
  const requested = [];
  process.env.YOUTUBE_API_KEY = "test-placeholder";
  globalThis.fetch = async (input) => {
    const href = String(input);
    requested.push(href);
    if (href.includes("genius.com/api/search/multi")) {
      return jsonOk({ response: { sections: [] } });
    }
    if (href.includes("googleapis.com/youtube/v3/search")) {
      return jsonOk({
        items: [{
          id: { videoId: "FixVideo000" },
          snippet: {
            title: "Harbor Lights Official Audio",
            channelTitle: "The Fixture Band",
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  try {
    const result = await enrichSongResources("Harbor Lights", "The Fixture Band");
    assert.equal(result.youtubeUrl, DIRECT_VIDEO);
    assert.equal(result.source, "partial-provider-match");
    assert.equal(requested.length, 2);
    assert.equal(requested.some((href) => href.includes("youtube.com/")), false);
    assert.match(resourceLookupCompletionNotice("Harbor Lights", result),
      /Candidate YouTube filled in.*Save to put it on the public list/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});

for (const apiResult of ["no-match", "unavailable"]) {
  test(`API ${apiResult} still falls back to public search and oEmbed`, async () => {
    const previousKey = process.env.YOUTUBE_API_KEY;
    const originalFetch = globalThis.fetch;
    const requested = [];
    process.env.YOUTUBE_API_KEY = "test-placeholder";
    globalThis.fetch = async (input) => {
      const href = String(input);
      requested.push(href);
      if (href.includes("genius.com/api/search/multi")) {
        return jsonOk({ response: { sections: [] } });
      }
      if (href.includes("googleapis.com/youtube/v3/search")) {
        return apiResult === "unavailable" ? { ok: false } : jsonOk({ items: [] });
      }
      if (href.includes("youtube.com/results")) {
        return textOk(youtubeSearchHtml("FixVideo000", "Harbor Lights Official Audio", "The Fixture Band"));
      }
      if (href.includes("youtube.com/oembed")) {
        return jsonOk({ title: "Harbor Lights Official Audio", author_name: "The Fixture Band" });
      }
      throw new Error(`unexpected fetch ${href}`);
    };
    try {
      const result = await enrichSongResources("Harbor Lights", "The Fixture Band");
      assert.equal(result.youtubeUrl, DIRECT_VIDEO);
      assert.equal(result.source, "partial-provider-match");
      assert.equal(requested.length, 4);
      const apiIndex = requested.findIndex((href) => href.includes("googleapis.com/youtube"));
      const publicIndex = requested.findIndex((href) => href.includes("youtube.com/results"));
      const oembedIndex = requested.findIndex((href) => href.includes("youtube.com/oembed"));
      assert.ok(apiIndex >= 0 && publicIndex > apiIndex && oembedIndex > publicIndex);
      assert.doesNotMatch(resourceLookupCompletionNotice("Harbor Lights", result), pastePrompt);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
      else process.env.YOUTUBE_API_KEY = previousKey;
    }
  });
}

test("a public search video rejected by oEmbed is not announced as filled in", async () => {
  const previousKey = process.env.YOUTUBE_API_KEY;
  const originalFetch = globalThis.fetch;
  const requested = [];
  delete process.env.YOUTUBE_API_KEY;
  globalThis.fetch = async (input) => {
    const href = String(input);
    requested.push(href);
    if (href.includes("genius.com/api/search/multi")) {
      return jsonOk({ response: { sections: [] } });
    }
    if (href.includes("youtube.com/results")) {
      return textOk(youtubeSearchHtml("FixVideo000", "Harbor Lights Official Audio", "The Fixture Band"));
    }
    if (href.includes("youtube.com/oembed")) {
      return jsonOk({ title: "Different Song", author_name: "Another Artist" });
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  try {
    const result = await enrichSongResources("Harbor Lights", "The Fixture Band");
    assert.ok(requested.some((href) => href.includes("youtube.com/oembed")));
    assert.equal(result.youtubeUrl, "");
    assert.equal(result.source, "search-links");
    assert.match(resourceLookupCompletionNotice("Harbor Lights", result), pastePrompt);
    assert.doesNotMatch(resourceLookupCompletionNotice("Harbor Lights", result), /filled in/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
  }
});

function jsonOk(payload) {
  return {
    ok: true,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function textOk(body) {
  return {
    ok: true,
    json: async () => {
      throw new Error("text response has no JSON");
    },
    text: async () => body,
  };
}

function youtubeSearchHtml(videoId, title, channel) {
  const data = {
    contents: {
      videoRenderer: {
        videoId,
        title: { simpleText: title },
        ownerText: { simpleText: channel },
      },
    },
  };
  return `<!doctype html><script>var ytInitialData = ${JSON.stringify(data)};</script>`;
}
