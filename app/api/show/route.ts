import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../lib/admin-access";
import {
  EDITABLE_SET_SLUGS,
  type SetSlug,
  type ShowSong,
} from "../../../lib/show-data";
import {
  ensureShowSeeded,
  getOfficialSongs,
  getShowPayload,
} from "../../../lib/show-store";
import { getYouTubeVideoId } from "../../../lib/song-resources";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getShowPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      setSlug?: string;
      songs?: Partial<ShowSong>[];
    };
    const setSlug = payload.setSlug as SetSlug;

    if (!EDITABLE_SET_SLUGS.includes(setSlug)) {
      return Response.json({ error: "Unknown set." }, { status: 400 });
    }
    if (!Array.isArray(payload.songs) || payload.songs.length > 60) {
      return Response.json(
        { error: "A set must contain between 0 and 60 songs." },
        { status: 400 },
      );
    }

    const normalized = payload.songs.map((song, index) => {
      const title = cleanText(song.title, 140);
      if (!title) throw new Error(`Song ${index + 1} needs a title.`);

      const youtubeUrl = cleanUrl(song.youtubeUrl);
      const youtubeVideoId =
        getYouTubeVideoId(youtubeUrl) || cleanText(song.youtubeVideoId, 20);

      return {
        position: index + 1,
        title,
        artist: cleanText(song.artist, 140),
        transition: Boolean(song.transition),
        performanceNote: cleanText(song.performanceNote, 300),
        songKey: cleanText(song.songKey, 40),
        tuning: cleanText(song.tuning, 80),
        youtubeUrl:
          youtubeUrl ||
          (youtubeVideoId
            ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
            : ""),
        youtubeVideoId,
        chordsUrl: cleanUrl(song.chordsUrl),
        lyricsUrl: cleanUrl(song.lyricsUrl),
        rehearsalNotes: cleanText(song.rehearsalNotes, 2500),
      };
    });

    await ensureShowSeeded();
    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare("DELETE FROM songs WHERE set_slug = ?").bind(setSlug),
    ];

    for (const song of normalized) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO songs (
            set_slug, position, title, artist, transition, performance_note,
            song_key, tuning, youtube_url, youtube_video_id, chords_url,
            lyrics_url, rehearsal_notes, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          setSlug,
          song.position,
          song.title,
          song.artist,
          song.transition ? 1 : 0,
          song.performanceNote,
          song.songKey,
          song.tuning,
          song.youtubeUrl,
          song.youtubeVideoId,
          song.chordsUrl,
          song.lyricsUrl,
          song.rehearsalNotes,
          user.email,
          now,
          now,
        ),
      );
    }

    await env.DB.batch(statements);
    const officialSongs = await getOfficialSongs();

    return Response.json({
      songs: officialSongs.filter((song) => song.setSlug === setSlug),
      updatedAt: now,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not save the set.",
      },
      { status: 500 },
    );
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

