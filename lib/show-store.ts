import { env } from "cloudflare:workers";
import { asc } from "drizzle-orm";
import { getDb } from "../db";
import { songs } from "../db/schema";
import {
  DEFAULT_SONGS,
  SET_DEFINITIONS,
  SHOW_DETAILS,
  type ShowSong,
} from "./show-data";
import { buildSongResourceLinks, getYouTubeVideoId } from "./song-resources";

const SEED_KEY = "show-control-seed-v1";

export async function ensureShowSeeded() {
  if (!env.DB) throw new Error("The show database is not connected.");

  const marker = await env.DB
    .prepare("SELECT value FROM site_settings WHERE key = ? LIMIT 1")
    .bind(SEED_KEY)
    .first<{ value: string }>();

  if (marker) return;

  const now = new Date().toISOString();
  const statements = DEFAULT_SONGS.map((song) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO songs (
        id, set_slug, position, title, artist, transition, is_original, performance_note,
        song_key, tuning, youtube_url, youtube_video_id, chords_url,
        lyrics_url, rehearsal_notes, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      song.id,
      song.setSlug,
      song.position,
      song.title,
      song.artist,
      song.transition ? 1 : 0,
      song.isOriginal ? 1 : 0,
      song.performanceNote,
      song.songKey,
      song.tuning,
      song.youtubeUrl,
      song.youtubeVideoId,
      song.chordsUrl,
      song.lyricsUrl,
      song.rehearsalNotes,
      "Initial show plan",
      now,
      now,
    ),
  );

  statements.push(
    env.DB.prepare(
      "INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)",
    ).bind(SEED_KEY, "complete", now),
  );

  await env.DB.batch(statements);
}

export function hydrateSong(song: ShowSong): ShowSong {
  const resources = buildSongResourceLinks(song.title, song.artist);
  const youtubeVideoId =
    song.youtubeVideoId || getYouTubeVideoId(song.youtubeUrl);

  return {
    ...song,
    youtubeVideoId,
    chordsUrl: song.chordsUrl || resources.chordsSearchUrl,
    lyricsUrl: song.lyricsUrl || resources.lyricsSearchUrl,
  };
}

export async function getOfficialSongs(): Promise<ShowSong[]> {
  try {
    await ensureShowSeeded();
    const rows = await getDb()
      .select()
      .from(songs)
      .orderBy(asc(songs.setSlug), asc(songs.position), asc(songs.id));

    return rows.map((row) =>
      hydrateSong({
        id: row.id,
        setSlug: row.setSlug as ShowSong["setSlug"],
        position: row.position,
        title: row.title,
        artist: row.artist,
        transition: row.transition,
        isOriginal: row.isOriginal,
        performanceNote: row.performanceNote,
        songKey: row.songKey,
        tuning: row.tuning,
        youtubeUrl: row.youtubeUrl,
        youtubeVideoId: row.youtubeVideoId,
        chordsUrl: row.chordsUrl,
        lyricsUrl: row.lyricsUrl,
        rehearsalNotes: row.rehearsalNotes,
        updatedAt: row.updatedAt,
      }),
    );
  } catch {
    return DEFAULT_SONGS.map(hydrateSong);
  }
}

export async function getShowPayload() {
  const officialSongs = await getOfficialSongs();
  const updatedAt = officialSongs.reduce(
    (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
    "",
  );

  return {
    show: SHOW_DETAILS,
    sets: SET_DEFINITIONS,
    songs: officialSongs,
    updatedAt,
  };
}
