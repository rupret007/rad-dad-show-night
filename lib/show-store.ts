import { env } from "cloudflare:workers";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { showBlocks, shows, songs } from "../db/schema";
import {
  DEFAULT_SONGS,
  RUN_OF_SHOW,
  SHOW_DETAILS,
  type ManagedShow,
  type RunOfShowBlock,
  type ShowSong,
} from "./show-data";
import { hydrateOfficialSongMedia } from "./song-resources";
import {
  isShowNotFoundError,
  requireVisibleShow,
  type ShowReadScope,
} from "./show-visibility";
import {
  buildShowSets,
  canUseConfirmedShowFallback,
  isShowDataUnavailableError,
  songsBelongToShow,
  ShowDataUnavailableError,
} from "./show-read-integrity";

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
        id, show_id, set_slug, position, title, artist, transition, is_original,
        duration_seconds, performance_note, song_key, tuning, youtube_url,
        youtube_video_id, chords_url, lyrics_url, rehearsal_notes, updated_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      song.id,
      song.showId,
      song.setSlug,
      song.position,
      song.title,
      song.artist,
      song.transition ? 1 : 0,
      song.isOriginal ? 1 : 0,
      song.durationSeconds,
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
  return hydrateOfficialSongMedia(song);
}

function formatShowDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function mapShow(row: typeof shows.$inferSelect): ManagedShow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    venue: row.venue,
    showDate: row.showDate,
    date: formatShowDate(row.showDate),
    startTime: row.startTime,
    endTime: row.endTime,
    hours: `${row.startTime}-${row.endTime}`,
    expectedWrap: row.expectedWrap,
    status: row.status as ManagedShow["status"],
    isDefault: row.isDefault,
  };
}

export async function getShowRecord(
  slug?: string | null,
  scope: ShowReadScope = "public",
): Promise<ManagedShow> {
  const db = getDb();
  if (slug) {
    const [row] = await db.select().from(shows).where(eq(shows.slug, slug)).limit(1);
    return mapShow(requireVisibleShow(row, scope));
  }

  const [defaultShow] = await db
    .select()
    .from(shows)
    .where(
      scope === "public"
        ? and(eq(shows.isDefault, true), eq(shows.status, "published"))
        : eq(shows.isDefault, true),
    )
    .limit(1);
  if (defaultShow) return mapShow(defaultShow);

  const latestQuery = db.select().from(shows);
  const [latest] = await (scope === "public"
    ? latestQuery.where(eq(shows.status, "published"))
    : latestQuery
  )
    .orderBy(desc(shows.showDate))
    .limit(1);
  return latest ? mapShow(latest) : (SHOW_DETAILS as ManagedShow);
}

export async function getManagedShows(): Promise<ManagedShow[]> {
  await ensureShowSeeded();
  const rows = await getDb().select().from(shows).orderBy(desc(shows.showDate));
  return rows.map(mapShow);
}

export async function getOfficialSongs(
  showId: string = SHOW_DETAILS.id,
): Promise<ShowSong[]> {
  await ensureShowSeeded();
  const rows = await getDb()
    .select()
    .from(songs)
    .where(eq(songs.showId, showId))
    .orderBy(asc(songs.setSlug), asc(songs.position), asc(songs.id));

  return rows.map((row) =>
    hydrateSong({
      id: row.id,
      showId: row.showId,
      setSlug: row.setSlug as ShowSong["setSlug"],
      position: row.position,
      title: row.title,
      artist: row.artist,
      transition: row.transition,
      isOriginal: row.isOriginal,
      durationSeconds: row.durationSeconds,
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
}

export async function getShowPayload(
  slug?: string | null,
  scope: ShowReadScope = "public",
) {
  let resolvedShowSlug: string | null = null;
  try {
    await ensureShowSeeded();
    const show = await getShowRecord(slug, scope);
    resolvedShowSlug = show.slug;
    const [officialSongs, blocks] = await Promise.all([
      getOfficialSongs(show.id),
      getDb()
        .select()
        .from(showBlocks)
        .where(eq(showBlocks.showId, show.id))
        .orderBy(asc(showBlocks.position)),
    ]);
    const mappedTimeline = blocks.map((block) => ({
      time: `${block.startTime}-${block.endTime}`,
      duration: block.duration,
      title: block.title,
      note: block.note,
      type: block.type as "performance" | "changeover",
      accent: block.accent as "blue" | "lime" | "pink",
      setSlug: block.setSlug,
    })) as RunOfShowBlock[];
    const timeline = mappedTimeline.length
      ? mappedTimeline
      : canUseConfirmedShowFallback(slug, resolvedShowSlug)
        ? [...RUN_OF_SHOW]
        : [];
    if (!songsBelongToShow(officialSongs, show)) {
      throw new ShowDataUnavailableError();
    }
    const updatedAt = officialSongs.reduce(
      (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
      "",
    );
    return {
      show,
      timeline,
      sets: buildShowSets(timeline),
      songs: officialSongs,
      updatedAt,
      dataSource: "database" as const,
    };
  } catch (error) {
    if (isShowNotFoundError(error)) throw error;
    if (isShowDataUnavailableError(error)) throw error;
    if (!canUseConfirmedShowFallback(slug, resolvedShowSlug)) {
      throw new ShowDataUnavailableError({ cause: error });
    }
    const officialSongs = DEFAULT_SONGS.map(hydrateSong);
    return {
      show: SHOW_DETAILS,
      timeline: [...RUN_OF_SHOW],
      sets: buildShowSets(RUN_OF_SHOW),
      songs: officialSongs,
      updatedAt: officialSongs[0]?.updatedAt ?? "",
      dataSource: "confirmed-fallback" as const,
    };
  }
}
