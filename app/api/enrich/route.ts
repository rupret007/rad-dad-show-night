import { getAdminUser } from "../../../lib/admin-access";
import { buildSongResourceLinks } from "../../../lib/song-resources";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  const payload = (await request.json()) as { title?: string; artist?: string };
  const title = payload.title?.trim().slice(0, 140) ?? "";
  const artist = payload.artist?.trim().slice(0, 140) ?? "";
  if (!title) {
    return Response.json({ error: "Enter a song title first." }, { status: 400 });
  }

  const links = buildSongResourceLinks(title, artist);
  const fallback = {
    source: "search-links",
    youtubeUrl: "",
    youtubeVideoId: "",
    youtubeSearchUrl: links.youtubeSearchUrl,
    chordsUrl: links.chordsSearchUrl,
    lyricsUrl: links.lyricsSearchUrl,
  };

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return Response.json(fallback);

  try {
    const query = [artist, title, "official audio"].filter(Boolean).join(" ");
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      maxResults: "1",
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
    if (!response.ok) return Response.json(fallback);

    const result = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string };
      }>;
    };
    const match = result.items?.[0];
    const videoId = match?.id?.videoId ?? "";
    if (!videoId) return Response.json(fallback);

    return Response.json({
      ...fallback,
      source: "youtube-api",
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      youtubeVideoId: videoId,
      videoTitle: match?.snippet?.title ?? "",
      channelTitle: match?.snippet?.channelTitle ?? "",
    });
  } catch {
    return Response.json(fallback);
  }
}

