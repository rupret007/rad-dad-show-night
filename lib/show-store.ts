import { env } from "cloudflare:workers";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { showBlocks, shows, songs } from "../db/schema";
import {
  DEFAULT_SONGS,
  EDITABLE_SET_SLUGS,
  RUN_OF_SHOW,
  SHOW_DETAILS,
  type ManagedShow,
  type RunOfShowBlock,
  type ShowSong,
  type SetSlug,
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
import { formatShowHours, toPublicShowSongs } from "./show-public";
import { INITIAL_OFFICIAL_SET_VERSION, officialSetRevision, readReviewedVersion, type SetWriteVersions } from "./owner-set-save";

const SEED_KEY = "show-control-seed-v1";

/** Shared SQL projection for a transaction's own canonical readback. */
export const OFFICIAL_SONG_COLUMNS = `id, show_id AS showId, set_slug AS setSlug,
  position, title, artist, transition, is_original AS isOriginal,
  duration_seconds AS durationSeconds, performance_note AS performanceNote,
  song_key AS songKey, tuning, youtube_url AS youtubeUrl,
  youtube_video_id AS youtubeVideoId, chords_url AS chordsUrl,
  lyrics_url AS lyricsUrl, rehearsal_notes AS rehearsalNotes, updated_at AS updatedAt`;

export function readOfficialSongRows(value: unknown, showId: string, setSlug?: SetSlug): ShowSong[] {
  if (!Array.isArray(value) || value.length > 180 || !officialSetRevision(value)) {
    throw new ShowDataUnavailableError();
  }
  const positions = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ShowDataUnavailableError();
    const row = item as Record<string, unknown>;
    if (row.showId !== showId || !EDITABLE_SET_SLUGS.includes(row.setSlug as SetSlug) ||
      (setSlug !== undefined && row.setSlug !== setSlug) ||
      !Number.isSafeInteger(row.position) || (row.position as number) < 1 || (row.position as number) > 60 ||
      positions.has(`${row.setSlug}:${row.position}`) ||
      !Number.isSafeInteger(row.durationSeconds) || (row.durationSeconds as number) < 30 || (row.durationSeconds as number) > 1200 ||
      ![true, false, 0, 1].includes(row.transition as boolean | number) ||
      ![true, false, 0, 1].includes(row.isOriginal as boolean | number) ||
      ["title", "artist", "performanceNote", "songKey", "tuning", "youtubeUrl", "youtubeVideoId", "chordsUrl", "lyricsUrl", "rehearsalNotes", "updatedAt"].some((field) => typeof row[field] !== "string")) {
      throw new ShowDataUnavailableError();
    }
    positions.add(`${row.setSlug}:${row.position}`);
    const textLimits: Record<string, number> = { title: 140, artist: 140, performanceNote: 300, songKey: 40, tuning: 80, youtubeVideoId: 20, rehearsalNotes: 2500 };
    if (!(row.title as string).trim() || Object.entries(textLimits).some(([field, limit]) => (row[field] as string).length > limit)) throw new ShowDataUnavailableError();
    return hydrateSong({ ...row, transition: Boolean(row.transition), isOriginal: Boolean(row.isOriginal) } as ShowSong);
  });
}

/** Read-only: absence is initial authority; malformed or failed reads are not. */
export async function getOwnerOfficialSnapshot(showId: string): Promise<{ songs: ShowSong[]; setWriteVersions: SetWriteVersions }> {
  const result = await env.DB.batch([
    env.DB.prepare(`SELECT ${OFFICIAL_SONG_COLUMNS} FROM songs WHERE show_id = ? ORDER BY set_slug, position, id`).bind(showId),
    env.DB.prepare("SELECT show_id, set_slug, version FROM official_set_revisions WHERE show_id = ?").bind(showId),
  ]);
  if (!Array.isArray(result) || result.length !== 2 || result.some((part: { success?: boolean; results?: unknown }) => part.success !== true || !Array.isArray(part.results))) {
    throw new ShowDataUnavailableError();
  }
  const setWriteVersions = Object.fromEntries(EDITABLE_SET_SLUGS.map((slug) => [slug, INITIAL_OFFICIAL_SET_VERSION])) as SetWriteVersions;
  const seen = new Set<string>();
  for (const item of result[1].results as Array<Record<string, unknown>>) {
    if (!item || item.show_id !== showId || !EDITABLE_SET_SLUGS.includes(item.set_slug as SetSlug) || seen.has(item.set_slug as string)) throw new ShowDataUnavailableError();
    const version = readReviewedVersion(item.version);
    if (!version || version === INITIAL_OFFICIAL_SET_VERSION) throw new ShowDataUnavailableError();
    seen.add(item.set_slug as string);
    setWriteVersions[item.set_slug as SetSlug] = version;
  }
  return { songs: readOfficialSongRows(result[0].results, showId), setWriteVersions };
}

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
    hours: formatShowHours(row.startTime, row.endTime),
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
    .where(eq(shows.isDefault, true))
    .limit(1);
  if (defaultShow) return mapShow(requireVisibleShow(defaultShow, scope));

  const [anyShow] = await db.select({ id: shows.id }).from(shows).limit(1);
  if (anyShow) throw new ShowNotFoundError();
  return SHOW_DETAILS as ManagedShow;
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
    const [officialSnapshot, blocks] = await Promise.all([
      scope === "owner" ? getOwnerOfficialSnapshot(show.id) : getOfficialSongs(show.id).then((songs) => ({ songs, setWriteVersions: undefined })),
      getDb()
        .select()
        .from(showBlocks)
        .where(eq(showBlocks.showId, show.id))
        .orderBy(asc(showBlocks.position)),
    ]);
    const officialSongs = officialSnapshot.songs;
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
    const songsForScope =
      scope === "public" ? toPublicShowSongs(officialSongs) : officialSongs;
    return {
      show,
      timeline,
      sets: buildShowSets(timeline),
      songs: songsForScope,
      updatedAt,
      dataSource: "database" as const,
      ...(scope === "owner" ? { setWriteVersions: officialSnapshot.setWriteVersions } : {}),
    };
  } catch (error) {
    if (isShowNotFoundError(error)) throw error;
    if (isShowDataUnavailableError(error)) throw error;
    // Owner editing can never acquire write authority from a repository fallback.
    if (scope === "owner") throw new ShowDataUnavailableError({ cause: error });
    if (!canUseConfirmedShowFallback(slug, resolvedShowSlug)) {
      throw new ShowDataUnavailableError({ cause: error });
    }
    const officialSongs = DEFAULT_SONGS.map(hydrateSong);
    const songsForScope =
      scope === "public" ? toPublicShowSongs(officialSongs) : officialSongs;
    return {
      show: SHOW_DETAILS,
      timeline: [...RUN_OF_SHOW],
      sets: buildShowSets(RUN_OF_SHOW),
      songs: songsForScope,
      updatedAt: officialSongs[0]?.updatedAt ?? "",
      dataSource: "confirmed-fallback" as const,
    };
  }
}
