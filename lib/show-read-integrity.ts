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

export type ShowSetDefinition = {
  slug: ShowSong["setSlug"];
  title: string;
  time: string;
  kicker: string;
  accent: "blue" | "lime" | "pink";
};

const OFFICIAL_SET_SHELLS: Array<Omit<ShowSetDefinition, "time">> = [
  {
    slug: "jeff-story-friends",
    title: "Jeff Story & Friends",
    kicker: "Opening set",
    accent: "blue",
  },
  {
    slug: "stalemate",
    title: "Stalemate",
    kicker: "Original set",
    accent: "pink",
  },
  {
    slug: "rad-dad",
    title: "Rad Dad",
    kicker: "Closing set",
    accent: "lime",
  },
];

export type ShowTimelineBlock = {
  time: string;
  duration: string;
  title: string;
  note: string;
  type: "performance" | "changeover";
  accent: "blue" | "lime" | "pink";
  setSlug?: string | null;
};

export type StoredShowSnapshot = {
  version: typeof SHOW_SNAPSHOT_VERSION;
  showSlug: string;
  showId?: string;
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

export function isCanonicalShowSlug(slug?: string | null): boolean {
  return slug === CONFIRMED_FALLBACK_SHOW_SLUG;
}

export function shouldReplaceDisplayedSongs(source?: string): boolean {
  return source === "database";
}

export function songsBelongToShow(
  songs: Array<{ showId?: string | number }>,
  show?: { id?: string } | null,
): boolean {
  if (!Array.isArray(songs)) return false;
  const showId = typeof show?.id === "string" ? show.id : "";
  const songIds = songs
    .map((song) => (typeof song.showId === "string" ? song.showId : ""))
    .filter(Boolean);
  if (new Set(songIds).size > 1) return false;
  return !showId || songIds.every((id) => id === showId);
}

export function showPayloadBelongsToShow(
  payload: {
    show?: { slug?: string; id?: string };
    songs?: Array<{ showId?: string | number }>;
  },
  expectedShowSlug: string,
): boolean {
  if (!expectedShowSlug || payload.show?.slug !== expectedShowSlug) {
    return false;
  }
  return songsBelongToShow(payload.songs ?? [], payload.show);
}

export function canAcceptVerifiedShowPayload(
  payload: {
    dataSource?: string;
    show?: { slug?: string; id?: string };
    songs?: Array<{ showId?: string | number }>;
  },
  expectedShowSlug: string,
): boolean {
  return (
    shouldReplaceDisplayedSongs(payload.dataSource) &&
    showPayloadBelongsToShow(payload, expectedShowSlug)
  );
}

export function formatShowSetTime(time: string): string {
  const trimmed = time.trim();
  if (!trimmed) return "";
  return /\b(AM|PM)\b/i.test(trimmed) ? trimmed : `${trimmed} PM`;
}

export function buildShowSets(
  timeline: Array<{
    time: string;
    title: string;
    note?: string;
    type?: string;
    setSlug?: string | null;
  }>,
): ShowSetDefinition[] {
  return OFFICIAL_SET_SHELLS.map((definition) => {
    const block =
      timeline.find((item) => item.setSlug === definition.slug) ??
      timeline.find(
        (item) =>
          item.type === "performance" && item.title === definition.title,
      );
    return {
      slug: definition.slug,
      title: definition.title,
      time: block ? formatShowSetTime(block.time) : "",
      kicker: definition.kicker,
      accent: definition.accent,
    };
  });
}

export function featuredGuestSet(timeline: ShowTimelineBlock[]) {
  const performance = timeline.find(
    (block) =>
      block.type === "performance" && /fault lines/i.test(block.title),
  );
  if (!performance) return null;
  const setup = timeline.find(
    (block) =>
      block.type === "changeover" && /fault lines/i.test(block.title),
  );
  return { performance, setup };
}

export function parseShowSets(value: unknown): ShowSetDefinition[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    return null;
  }

  const sets = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const set = item as Record<string, unknown>;
    const slug = set.slug as ShowSong["setSlug"];
    if (!SNAPSHOT_SET_SLUGS.has(slug)) return null;
    if (typeof set.title !== "string" || !set.title.trim() || set.title.length > 140) {
      return null;
    }
    if (typeof set.time !== "string" || set.time.length > 40) return null;
    if (typeof set.kicker !== "string" || set.kicker.length > 80) return null;
    if (set.accent !== "blue" && set.accent !== "lime" && set.accent !== "pink") {
      return null;
    }
    return {
      slug,
      title: set.title.trim(),
      time: set.time,
      kicker: set.kicker,
      accent: set.accent,
    } satisfies ShowSetDefinition;
  });

  if (sets.some((set) => set === null)) return null;
  return sets as ShowSetDefinition[];
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
  showId?: string,
): StoredShowSnapshot {
  return {
    version: SHOW_SNAPSHOT_VERSION,
    showSlug,
    ...(showId ? { showId } : {}),
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
    const snapshotShowId =
      typeof value.showId === "string" && value.showId.length <= 140
        ? value.showId
        : "";
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
    if (!songsBelongToShow(songs as ShowSong[], { id: snapshotShowId })) {
      return null;
    }

    return {
      version: SHOW_SNAPSHOT_VERSION,
      showSlug: expectedShowSlug,
      ...(snapshotShowId ? { showId: snapshotShowId } : {}),
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
    rehearsalNotes: "",
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
