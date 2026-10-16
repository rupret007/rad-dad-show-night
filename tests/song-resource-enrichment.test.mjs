import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as resources from "../lib/song-resources.ts";

const source = await readFile(process.env.SONG_RESOURCE_SOURCE ?? new URL("../lib/song-resource-enrichment.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const video = { id: "fixture0001", title: "Hello (Official Audio)", channel: "Adele - Topic" };
const lyricsUrl = "https://genius.com/Adele-hello-lyrics";

function fixture({ path = "search", candidate = video, metadata, oembedStatus = 200, oembedThrows = false, lyrics = true, searchCandidate = candidate } = {}) {
  const fixtureModule = { exports: {} };
  const calls = [];
  const unexpected = [];
  vm.runInNewContext(compiled, {
    module: fixtureModule, exports: fixtureModule.exports, URL, URLSearchParams,
    process: { env: { YOUTUBE_API_KEY: path === "api" ? "synthetic-never-sent" : "" } },
    require(id) {
      assert.equal(id, "./song-resources");
      return resources;
    },
    async fetch(input) {
      const url = new URL(input);
      calls.push(url);
      if (url.hostname === "genius.com" && url.pathname === "/api/search/multi") {
        return Response.json({ response: { sections: [{ hits: lyrics ? [{ result: {
          title: "Hello", primary_artist_names: "Adele", url: lyricsUrl,
        } }] : [] }] } });
      }
      if (url.hostname === "www.googleapis.com" && url.pathname === "/youtube/v3/search") {
        return Response.json({ items: [{ id: { videoId: candidate.id }, snippet: {
          title: candidate.title, channelTitle: candidate.channel,
        } }] });
      }
      if (url.hostname === "www.youtube.com" && url.pathname === "/results") {
        const data = { contents: searchCandidate ? [{ videoRenderer: {
          videoId: searchCandidate.id, title: { runs: [{ text: searchCandidate.title }] },
          ownerText: { simpleText: searchCandidate.channel },
        } }] : [] };
        return new Response(`<script>var ytInitialData = ${JSON.stringify(data)};</script>`);
      }
      if (url.hostname === "www.youtube.com" && url.pathname === "/oembed") {
        if (oembedThrows) throw new Error("Fixture provider unavailable");
        return Response.json(metadata ?? {
          title: searchCandidate.title, author_name: searchCandidate.channel,
        }, { status: oembedStatus });
      }
      unexpected.push(input);
      throw new Error("Unexpected fixture request; real network is unavailable");
    },
  });
  return {
    calls,
    async enrich(title = "Hello", artist = "Adele") {
      const result = await fixtureModule.exports.enrichSongResources(title, artist);
      assert.deepEqual(unexpected, []);
      return result;
    },
  };
}

function assertRejected(result, lyrics = true) {
  for (const field of ["youtubeUrl", "youtubeVideoId", "videoTitle", "channelTitle"]) {
    assert.equal(result[field], "", field);
  }
  assert.equal(result.verified, false);
  assert.equal(result.source, lyrics ? "partial-provider-match" : "search-links");
  const searches = resources.buildSongResourceLinks("Hello", "Adele");
  assert.equal(result.youtubeSearchUrl, searches.youtubeSearchUrl);
  assert.equal(result.lyricsSearchUrl, searches.lyricsSearchUrl);
  assert.equal(result.chordsUrl, searches.chordsSearchUrl);
  assert.equal(result.lyricsUrl, lyrics ? lyricsUrl : searches.lyricsSearchUrl);
}

function assertAccepted(result, candidate = video) {
  assert.equal(result.youtubeVideoId, candidate.id);
  assert.equal(result.youtubeUrl, `https://www.youtube.com/watch?v=${candidate.id}`);
  assert.equal(result.videoTitle, candidate.title);
  assert.equal(result.channelTitle, candidate.channel);
  assert.equal(result.source, "verified-providers");
  assert.equal(result.verified, true);
}

for (const path of ["api", "search"]) {
  for (const channel of ["Lionel Richie - Topic", "Lionel Richie Official", "Lionel Richie VEVO", "NotAdele - Topic"]) {
    test(`${path}: trusted-looking wrong-artist channel ${channel} leaves only search links`, async () => {
      const provider = fixture({ path, candidate: { ...video, channel } });
      assertRejected(await provider.enrich());
      assert.equal(provider.calls.some((url) => url.pathname === "/oembed"), false);
      assert.equal(provider.calls.some((url) => url.hostname === "www.googleapis.com"), path === "api");
    });
  }
  for (const channel of ["Adele", "Adele - Topic", "Adele Official", "AdeleVEVO"]) {
    test(`${path}: exact artist channel ${channel} still matches`, async () => {
      const candidate = { ...video, channel };
      const provider = fixture({ path, candidate });
      assertAccepted(await provider.enrich(), candidate);
      assert.equal(provider.calls.some((url) => url.pathname === "/oembed"), path === "search");
    });
  }
  for (const title of ["Hello (Adele cover)", "Hello (Live)", "Different Song (Official Audio)"]) {
    test(`${path}: artist evidence does not override rejected title ${title}`, async () => {
      assertRejected(await fixture({ path, candidate: { ...video, title } }).enrich());
    });
  }
  test(`${path}: an artist mentioned in the video title cannot replace channel identity`, async () => {
    assertRejected(await fixture({
      path,
      candidate: { ...video, title: "Adele - Hello (Official Audio)", channel: "Lionel Richie Official" },
    }).enrich());
  });
  for (const channel of ["Machine Official", "NotFlorence and the Machine - Topic"]) {
    test(`${path}: incomplete multiword artist identity ${channel} is rejected`, async () => {
      const artist = "Florence and the Machine";
      const result = await fixture({ path, lyrics: false, candidate: { ...video, channel } }).enrich("Hello", artist);
      assert.equal(result.youtubeVideoId, "");
      assert.equal(result.verified, false);
      assert.equal(result.source, "search-links");
      assert.equal(result.youtubeSearchUrl, resources.buildSongResourceLinks("Hello", artist).youtubeSearchUrl);
    });
  }
  for (const channel of ["Florence & the Machine - Topic", "Florence and the MachineVEVO"]) {
    test(`${path}: complete multiword artist identity ${channel} is accepted`, async () => {
      const result = await fixture({ path, lyrics: false, candidate: { ...video, channel } }).enrich("Hello", "Florence and the Machine");
      assert.equal(result.youtubeVideoId, video.id);
      assert.equal(result.channelTitle, channel);
      assert.equal(result.source, "partial-provider-match");
      assert.equal(result.verified, false);
    });
  }
}

for (const [name, metadata] of [
  ["wrong artist", { title: video.title, author_name: "Lionel Richie - Topic" }],
  ["cover penalty", { title: "Hello (Adele cover)", author_name: video.channel }],
  ["live penalty", { title: "Hello (Live)", author_name: video.channel }],
  ["different title", { title: "Different Song", author_name: video.channel }],
  ["missing author", { title: video.title }],
  ["missing title", { author_name: video.channel }],
  ["empty metadata", {}],
]) {
  test(`search: oEmbed ${name} cannot verify a promising search result`, async () => {
    const provider = fixture({ metadata });
    assertRejected(await provider.enrich());
    assert.equal(provider.calls.filter((url) => url.pathname === "/oembed").length, 1);
  });
}

for (const options of [{ oembedStatus: 404 }, { oembedThrows: true }]) {
  test(`search: rejected oEmbed ${JSON.stringify(options)} retains search links`, async () => {
    assertRejected(await fixture(options).enrich());
  });
}

test("no matching providers retains all search links without verification", async () => {
  assertRejected(await fixture({ lyrics: false, candidate: { ...video, channel: "Lionel Richie - Topic" } }).enrich(), false);
});

test("a rejected API artist can fall back to a verified exact-artist search result", async () => {
  const provider = fixture({ path: "api", candidate: { ...video, channel: "Lionel Richie - Topic" }, searchCandidate: video });
  assertAccepted(await provider.enrich());
  assert.ok(provider.calls.some((url) => url.pathname === "/oembed"));
});

test("blank normalized artist cannot establish identity", async () => {
  const result = await fixture().enrich("Hello", "!!!");
  assert.equal(result.youtubeVideoId, "");
  assert.equal(result.verified, false);
});

test("accepted lookup stays hidden on originals and requires saving for public covers", async () => {
  const result = await fixture().enrich();
  assertAccepted(result);
  const song = { title: "Hello", artist: "Adele", ...result };
  assert.equal(resources.publicSongResourceActions({ ...song, isOriginal: true }).youtubeUrl, "");
  assert.equal(resources.publicSongResourceActions({ ...song, isOriginal: true }).lyricsUrl, "");
  assert.equal(resources.publicSongResourceActions({ title: "Hello", artist: "Adele", isOriginal: false }).youtubeUrl, "");
  assert.equal(resources.publicSongResourceActions({ ...song, isOriginal: false }).youtubeUrl, result.youtubeUrl);
});
