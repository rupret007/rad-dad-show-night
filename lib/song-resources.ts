const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function buildSongResourceLinks(title: string, artist: string) {
  const query = [artist.trim(), title.trim()].filter(Boolean).join(" ");
  const encoded = encodeURIComponent(query);

  return {
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encoded}`,
    chordsSearchUrl: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encoded}`,
    lyricsSearchUrl: `https://genius.com/search?q=${encoded}`,
  };
}

export function getYouTubeVideoId(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (YOUTUBE_ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return "";
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : "";
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    const queryId = url.searchParams.get("v") ?? "";
    if (YOUTUBE_ID.test(queryId)) return queryId;

    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
      const id = parts[1] ?? "";
      return YOUTUBE_ID.test(id) ? id : "";
    }
  }

  return "";
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return YOUTUBE_ID.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
    : "";
}

