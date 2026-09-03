import type { ShowSong } from "./show-data";

export const SHOW_SNAPSHOT_VERSION = 1;
export const MAX_SNAPSHOT_SONGS = 180;
export const CONFIRMED_FALLBACK_SHOW_SLUG = "guitars-growlers-2026-09-19";
export const SHOW_TIME_ZONE = "America/Chicago";
export const OFFLINE_CACHE_VERSION = 2;

const SNAPSHOT_SET_SLUGS = new Set<ShowSong["setSlug"]>([
  "jeff-story-friends",
  "stalemate",
  "rad-dad",
]);

export type ShowDataSource = "database" | "confirmed-fallback";
export type ShowDisplaySource = ShowDataSource | "saved-snapshot";

export type StoredShowSnapshot = {
  version: typeof SHOW_SNAPSHOT_VERSION;
  showSlug: string;
  songs: ShowSong[];
  updatedAt: string;
  savedAt: string;
};

export class ShowDataUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Show data is temporarily unavailable.", options);
    this.name = "ShowDataUnavailableError";
  }
}

export function isShowDataUnavailableError(
  error: unknown,
): error is ShowDataUnavailableError {
  return error instanceof ShowDataUnavailableError;
}

/**
 * Only the canonical event has a reviewed, code-backed fallback. A requested
 * clone must never inherit that event's songs when D1 cannot answer.
 */
export function canUseConfirmedShowFallback(
  requestedSlug?: string | null,
  resolvedSlug?: string | null,
): boolean {
  if (resolvedSlug && resolvedSlug !== CONFIRMED_FALLBACK_SHOW_SLUG) {
    return false;
  }
  return !requestedSlug || requestedSlug === CONFIRMED_FALLBACK_SHOW_SLUG;
}

export function shouldReplaceDisplayedSongs(source: ShowDataSource): boolean {
  return source === "database";
}

export function showSnapshotKey(showSlug: string): string {
  return `rad-dad-show-snapshot:${showSlug}`;
}

export function offlineReadyKey(showSlug: string): string {
  return `rad-dad-offline-ready-v${OFFLINE_CACHE_VERSION}:${showSlug}`;
}

export function formatShowTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOW_TIME_ZONE,
  }).format(date);
}

export function createStoredShowSnapshot(
  showSlug: string,
  songs: ShowSong[],
  updatedAt: string,
  savedAt = new Date().toISOString(),
): StoredShowSnapshot {
  return {
    version: SHOW_SNAPSHOT_VERSION,
    showSlug,
    songs,
    updatedAt,
    savedAt,
  };
}

export function parseStoredShowSnapshot(
  raw: string | null,
  expectedShowSlug: string,
): StoredShowSnapshot | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      value.version !== SHOW_SNAPSHOT_VERSION ||
      value.showSlug !== expectedShowSlug ||
      !Array.isArray(value.songs) ||
      value.songs.length > MAX_SNAPSHOT_SONGS ||
      typeof value.updatedAt !== "string" ||
      value.updatedAt.length > 80 ||
      typeof value.savedAt !== "string" ||
      value.savedAt.length > 80 ||
      Number.isNaN(Date.parse(value.savedAt))
    ) {
      return null;
    }

    const songs = value.songs.map(normalizeSnapshotSong);
    if (songs.some((song) => song === null)) return null;

    return {
      version: SHOW_SNAPSHOT_VERSION,
      showSlug: expectedShowSlug,
      songs: songs as ShowSong[],
      updatedAt: value.updatedAt,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

function normalizeSnapshotSong(value: unknown): ShowSong | null {
  if (!value || typeof value !== "object") return null;
  const song = value as Record<string, unknown>;
  const knownSet = SNAPSHOT_SET_SLUGS.has(song.setSlug as ShowSong["setSlug"]);
  const idIsValid =
    (typeof song.id === "string" && song.id.length <= 140) ||
    (typeof song.id === "number" && Number.isFinite(song.id));
  const position = Number(song.position);
  const durationSeconds = Number(song.durationSeconds);

  if (
    !idIsValid ||
    !knownSet ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > 60 ||
    typeof song.title !== "string" ||
    !song.title.trim() ||
    song.title.length > 140
  ) {
    return null;
  }

  return {
    id: song.id as string | number,
    showId: safeText(song.showId, 140),
    setSlug: song.setSlug as ShowSong["setSlug"],
    position,
    title: song.title.trim(),
    artist: safeText(song.artist, 140),
    transition: song.transition === true,
    isOriginal: song.isOriginal === true,
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 1200
        ? Math.round(durationSeconds)
        : 180,
    performanceNote: safeText(song.performanceNote, 300),
    songKey: safeText(song.songKey, 40),
    tuning: safeText(song.tuning, 80),
    youtubeUrl: safeHttpUrl(song.youtubeUrl),
    youtubeVideoId: safeVideoId(song.youtubeVideoId),
    chordsUrl: safeHttpUrl(song.chordsUrl),
    lyricsUrl: safeHttpUrl(song.lyricsUrl),
    rehearsalNotes: safeText(song.rehearsalNotes, 2500),
    updatedAt: safeText(song.updatedAt, 80),
  };
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function safeVideoId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(value)
    ? value
    : "";
}
