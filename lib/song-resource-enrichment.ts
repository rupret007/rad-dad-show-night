import {
  buildSongResourceLinks,
  getCuratedSongResources,
  normalizeSongValue,
  primarySongArtist,
} from "./song-resources";

type GeniusResult = {
  title?: string;
  primary_artist_names?: string;
  artist_names?: string;
  url?: string;
};

type YouTubeRenderer = {
  videoId?: string;
  title?: TextContainer;
  ownerText?: TextContainer;
  shortBylineText?: TextContainer;
};

type TextContainer = {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
};

type YouTubeMatch = {
  id: string;
  title: string;
  channel: string;
  score: number;
};

export async function enrichSongResources(title: string, artist: string) {
  const searches = buildSongResourceLinks(title, artist);
  const curated = getCuratedSongResources(title, artist);
  if (curated) {
    return {
      source: "curated-exact",
      ...curated,
      youtubeSearchUrl: searches.youtubeSearchUrl,
      chordsUrl: searches.chordsSearchUrl,
      lyricsSearchUrl: searches.lyricsSearchUrl,
      verified: true,
    };
  }

  const [lyrics, youtube] = await Promise.all([
    findGeniusLyrics(title, artist),
    findYouTubeVideo(title, artist),
  ]);

  return {
    source:
      lyrics && youtube
        ? "verified-providers"
        : lyrics || youtube
          ? "partial-provider-match"
          : "search-links",
    youtubeUrl: youtube ? `https://www.youtube.com/watch?v=${youtube.id}` : "",
    youtubeVideoId: youtube?.id ?? "",
    youtubeSearchUrl: searches.youtubeSearchUrl,
    chordsUrl: searches.chordsSearchUrl,
    lyricsUrl: lyrics?.url ?? searches.lyricsSearchUrl,
    lyricsSearchUrl: searches.lyricsSearchUrl,
    videoTitle: youtube?.title ?? "",
    channelTitle: youtube?.channel ?? "",
    verified: Boolean(lyrics && youtube),
  };
}

async function findGeniusLyrics(title: string, artist: string) {
  const primaryArtist = primarySongArtist(artist);
  if (!primaryArtist) return null;

  try {
    const query = `${primaryArtist} ${title}`.trim();
    const response = await fetch(
      `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "RadDadShowNight/1.0" },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      response?: {
        sections?: Array<{ hits?: Array<{ result?: GeniusResult }> }>;
      };
    };
    const results = (payload.response?.sections ?? [])
      .flatMap((section) => section.hits ?? [])
      .map((hit) => hit.result)
      .filter((result): result is GeniusResult => Boolean(result));
    const wantedTitle = normalizeSongValue(title);
    const wantedArtist = normalizeSongValue(primaryArtist);

    const match = results.find((result) => {
      const resultTitle = normalizeSongValue(
        removeSafeParentheticalAlias(result.title ?? ""),
      );
      const resultArtist = normalizeSongValue(
        result.primary_artist_names ?? result.artist_names ?? "",
      );
      return (
        resultTitle === wantedTitle &&
        textMatches(resultArtist, wantedArtist) &&
        isDirectGeniusLyricsUrl(result.url ?? "")
      );
    });

    return match?.url ? { url: match.url } : null;
  } catch {
    return null;
  }
}

async function findYouTubeVideo(title: string, artist: string) {
  const primaryArtist = primarySongArtist(artist);
  if (!primaryArtist) return null;

  const apiMatch = await findYouTubeWithApi(title, primaryArtist);
  if (apiMatch) return apiMatch;

  try {
    const query = `${primaryArtist} ${title} official audio`;
    const response = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`,
      {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: "SOCS=CAI",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const initialData = parseYouTubeInitialData(await response.text());
    if (!initialData) return null;

    const wantedTitle = normalizeSongValue(title);
    const wantedArtist = normalizeSongValue(primaryArtist);
    const matches = collectYouTubeRenderers(initialData)
      .map((renderer) => scoreYouTubeRenderer(renderer, wantedTitle, wantedArtist))
      .filter((match): match is YouTubeMatch => Boolean(match))
      .sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (!best || best.score < 13) return null;

    return (await verifyYouTubeMatch(best, wantedTitle, wantedArtist))
      ? best
      : null;
  } catch {
    return null;
  }
}

async function findYouTubeWithApi(title: string, artist: string) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: `${artist} ${title} official audio`,
      maxResults: "5",
      type: "video",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "moderate",
      key: apiKey,
    });
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;

    const result = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };
    const wantedTitle = normalizeSongValue(title);
    const wantedArtist = normalizeSongValue(artist);
    const matches = (result.items ?? [])
      .map((item) => {
        const id = item.id?.videoId ?? "";
        const videoTitle = item.snippet?.title ?? "";
        const channel = item.snippet?.channelTitle ?? "";
        return scoreYouTubeText(id, videoTitle, channel, wantedTitle, wantedArtist);
      })
      .filter((match): match is YouTubeMatch => Boolean(match))
      .sort((a, b) => b.score - a.score);
    return matches[0]?.score && matches[0].score >= 13 ? matches[0] : null;
  } catch {
    return null;
  }
}

function scoreYouTubeRenderer(
  renderer: YouTubeRenderer,
  wantedTitle: string,
  wantedArtist: string,
) {
  return scoreYouTubeText(
    renderer.videoId ?? "",
    textFromContainer(renderer.title),
    textFromContainer(renderer.ownerText) ||
      textFromContainer(renderer.shortBylineText),
    wantedTitle,
    wantedArtist,
  );
}

function scoreYouTubeText(
  id: string,
  title: string,
  channel: string,
  wantedTitle: string,
  wantedArtist: string,
) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const normalizedTitle = normalizeSongValue(title);
  const normalizedChannel = normalizeSongValue(channel);
  if (!normalizedTitle.includes(wantedTitle)) return null;
  const channelMatchesArtist = normalizedChannel.includes(wantedArtist);
  const trustedMusicChannel = /\b(official|topic|vevo)\b/.test(normalizedChannel);
  if (!channelMatchesArtist && !trustedMusicChannel) return null;

  let score = 8;
  score += channelMatchesArtist ? 5 : 4;
  if (/\b(official|audio|topic|vevo)\b/.test(`${normalizedTitle} ${normalizedChannel}`)) {
    score += 2;
  }
  if (/\b(cover|karaoke|lesson|reaction|tutorial)\b/.test(normalizedTitle)) {
    score -= 10;
  }
  if (/\blive\b/.test(normalizedTitle)) score -= 3;

  return { id, title, channel, score };
}

async function verifyYouTubeMatch(
  match: YouTubeMatch,
  wantedTitle: string,
  wantedArtist: string,
) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${match.id}`,
      )}&format=json`,
      { cache: "no-store" },
    );
    if (!response.ok) return false;
    const metadata = (await response.json()) as {
      title?: string;
      author_name?: string;
    };
    return Boolean(
      scoreYouTubeText(
        match.id,
        metadata.title ?? match.title,
        metadata.author_name ?? match.channel,
        wantedTitle,
        wantedArtist,
      ),
    );
  } catch {
    return false;
  }
}

function parseYouTubeInitialData(html: string): unknown {
  const marker = "var ytInitialData = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = markerIndex + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function collectYouTubeRenderers(value: unknown, results: YouTubeRenderer[] = []) {
  if (!value || typeof value !== "object") return results;
  const record = value as Record<string, unknown>;
  const renderer = record.videoRenderer;
  if (renderer && typeof renderer === "object") {
    results.push(renderer as YouTubeRenderer);
  }
  for (const child of Object.values(record)) {
    collectYouTubeRenderers(child, results);
  }
  return results;
}

function textFromContainer(container?: TextContainer) {
  return (
    container?.runs?.map((run) => run.text ?? "").join("") ??
    container?.simpleText ??
    ""
  );
}

function textMatches(left: string, right: string) {
  return left === right || left.includes(right) || right.includes(left);
}

function removeSafeParentheticalAlias(value: string) {
  const suffix = value.match(/\s*[([]([^\])]+)[\])]\s*$/);
  if (!suffix) return value;
  if (/\b(live|remix|acoustic|demo|cover|edit|version|remaster)\b/i.test(suffix[1])) {
    return value;
  }
  return value.slice(0, suffix.index).trim();
}

function isDirectGeniusLyricsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "genius.com" && /-lyrics\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
