import type { SetSlug, ShowSong } from "./show-data";

export const EMPTY_OFFICIAL_SET_REVISION = "empty:0";
export const OWNER_SAVE_DEADLINE_MS = 10_000;

export type OwnerSaveHold = "uncertain" | "conflict";

export type BoundUndoRemove = {
  showSlug: string;
  setSlug: SetSlug;
  song: ShowSong;
  index: number;
};

export type OwnerSaveClassification =
  | { kind: "saved"; songs: ShowSong[]; reviewedBase: string }
  | { kind: "refused"; status: number; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "uncertain"; message: string };

const CONTENT_FIELDS = [
  "title",
  "artist",
  "transition",
  "isOriginal",
  "durationSeconds",
  "performanceNote",
  "songKey",
  "tuning",
  "youtubeUrl",
  "youtubeVideoId",
  "chordsUrl",
  "lyricsUrl",
  "rehearsalNotes",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function officialSongId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function officialUpdatedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const updated = value.trim();
  return updated && updated.length <= 40 && !/[\n\r|]/.test(updated)
    ? updated
    : null;
}

/**
 * Receipt for the last verified official set. This is the sorted id:updatedAt
 * pairs, not a max timestamp. Removing a song therefore cannot move the receipt
 * backward onto an older remaining row.
 */
export function officialSetRevision(songs: readonly unknown[]): string | null {
  if (!Array.isArray(songs)) return null;
  if (songs.length === 0) return EMPTY_OFFICIAL_SET_REVISION;

  const entries: Array<{ id: number; updated: string }> = [];
  const seen = new Set<number>();
  for (const song of songs) {
    const record = asRecord(song);
    if (!record) return null;
    const id = officialSongId(record.id);
    const updated =
      officialUpdatedAt(record.updatedAt) ?? officialUpdatedAt(record.updated_at);
    if (id === null || updated === null || seen.has(id)) return null;
    seen.add(id);
    entries.push({ id, updated });
  }
  entries.sort((left, right) => left.id - right.id);
  return `${entries.length}:${entries.map((entry) => `${entry.id}:${entry.updated}`).join("|")}`;
}

export function readReviewedBase(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reviewedBase = value.trim();
  if (!reviewedBase || reviewedBase.length > 4000 || /[\n\r]/.test(reviewedBase)) {
    return null;
  }
  if (reviewedBase === EMPTY_OFFICIAL_SET_REVISION) return reviewedBase;
  const separator = reviewedBase.indexOf(":");
  const count = Number(reviewedBase.slice(0, separator));
  if (!Number.isSafeInteger(count) || count < 1) return null;
  const parts = reviewedBase.slice(separator + 1).split("|");
  if (parts.length !== count) return null;
  const parsed = parts.map((part) => {
    const idSeparator = part.indexOf(":");
    return {
      id: Number(part.slice(0, idSeparator)),
      updatedAt: part.slice(idSeparator + 1),
    };
  });
  return officialSetRevision(parsed) === reviewedBase ? reviewedBase : null;
}

export function ownerSetContentEquals(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((song, index) => {
    const a = asRecord(song);
    const b = asRecord(right[index]);
    if (!a || !b) return false;
    return CONTENT_FIELDS.every((field) => Object.is(a[field], b[field]));
  });
}

export function ownerSetDraftEquals(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  if (!ownerSetContentEquals(left, right)) return false;
  return left.every((song, index) => {
    const a = asRecord(song);
    const b = asRecord(right[index]);
    return Boolean(a && b && String(a.id) === String(b.id));
  });
}

export function remapSavedOfficialIdentities<T extends ShowSong>(
  currentSongs: readonly T[],
  sentSongs: readonly T[],
  savedSongs: readonly T[],
): T[] {
  const savedBySentId = new Map<string, T>();
  sentSongs.forEach((song, index) => {
    const saved = savedSongs[index];
    if (saved) savedBySentId.set(String(song.id), saved);
  });
  return currentSongs.map((song) => {
    const saved = savedBySentId.get(String(song.id));
    if (!saved) return song;
    return {
      ...song,
      id: saved.id,
      showId: saved.showId,
      setSlug: saved.setSlug,
      updatedAt: saved.updatedAt,
    };
  });
}

export function applySuccessfulOfficialSave<T extends ShowSong>({
  currentSongs,
  sentSongs,
  savedSongs,
}: {
  currentSongs: readonly T[];
  sentSongs: readonly T[];
  savedSongs: readonly T[];
}): { songs: T[]; stillDirty: boolean; reviewedBase: string } | null {
  const reviewedBase = officialSetRevision(savedSongs);
  if (!reviewedBase || savedSongs.length !== sentSongs.length) return null;
  if (ownerSetDraftEquals(currentSongs, sentSongs)) {
    return { songs: [...savedSongs], stillDirty: false, reviewedBase };
  }
  return {
    songs: remapSavedOfficialIdentities(currentSongs, sentSongs, savedSongs),
    stillDirty: true,
    reviewedBase,
  };
}

export function songsBelongToOfficialSet(
  songs: readonly unknown[],
  showId: string,
  setSlug: string,
): boolean {
  if (!Array.isArray(songs) || !showId || !setSlug) return false;
  return songs.every((song) => {
    const record = asRecord(song);
    if (!record) return false;
    if (record.showId !== undefined && record.showId !== showId) return false;
    if (record.setSlug !== undefined && record.setSlug !== setSlug) return false;
    return officialSongId(record.id) !== null;
  });
}

export function classifyOwnerSaveResult({
  ok,
  status,
  body,
  showId,
  setSlug,
}: {
  ok: boolean;
  status: number;
  body: unknown;
  showId: string;
  setSlug: string;
}): OwnerSaveClassification {
  const record = asRecord(body) ?? {};
  const message =
    typeof record.error === "string" && record.error.trim()
      ? record.error.trim()
      : "";

  if (status === 409) {
    return {
      kind: "conflict",
      message:
        message ||
        "This set changed since you last loaded it. Check the saved list before writing this draft over it.",
    };
  }

  if (status === 401 || status === 403 || status === 400 || status === 404) {
    return {
      kind: "refused",
      status,
      message: message || "The set could not be saved.",
    };
  }

  if (status === 202 && record.written === true) {
    return {
      kind: "uncertain",
      message:
        message ||
        "The set was written, but the official list could not be verified. Check that saved list before saving again.",
    };
  }

  if (ok && status === 200) {
    const songs = record.songs;
    const reviewedBase =
      readReviewedBase(record.reviewedBase) ??
      (Array.isArray(songs) ? officialSetRevision(songs) : null);
    if (
      Array.isArray(songs) &&
      reviewedBase &&
      (songs.length === 0 || songsBelongToOfficialSet(songs, showId, setSlug))
    ) {
      return { kind: "saved", songs: songs as ShowSong[], reviewedBase };
    }
    return {
      kind: "uncertain",
      message:
        "The save response did not include a verified official list. Check that saved list before saving again.",
    };
  }

  return {
    kind: "uncertain",
    message:
      message ||
      "The last save did not come back with a verified official list. Check that saved list before saving again. The earlier write may have landed.",
  };
}

export function reconcileCheckedOfficialSet<T extends ShowSong>({
  draftSongs,
  officialSongs,
}: {
  draftSongs: readonly T[];
  officialSongs: readonly T[];
}): { songs: T[]; stillDirty: boolean; reviewedBase: string } | null {
  const reviewedBase = officialSetRevision(officialSongs);
  if (!reviewedBase) return null;
  if (ownerSetContentEquals(draftSongs, officialSongs)) {
    return { songs: [...officialSongs], stillDirty: false, reviewedBase };
  }
  return { songs: [...draftSongs], stillDirty: true, reviewedBase };
}

export function bindUndoRemove(
  showSlug: string,
  setSlug: SetSlug,
  song: ShowSong,
  index: number,
): BoundUndoRemove | null {
  if (!showSlug.trim() || !Number.isInteger(index) || index < 0) return null;
  return { showSlug, setSlug, song, index };
}

export function canApplyUndoRemove(
  undo: BoundUndoRemove | null | undefined,
  showSlug: string,
  setSlug: SetSlug,
): undo is BoundUndoRemove {
  return Boolean(
    undo &&
      undo.showSlug === showSlug &&
      undo.setSlug === setSlug &&
      undo.song &&
      Number.isInteger(undo.index) &&
      undo.index >= 0,
  );
}

export function revisionsFromOfficialSets(
  songsBySet: Record<SetSlug, readonly unknown[]>,
): Record<SetSlug, string | null> {
  return {
    "jeff-story-friends": officialSetRevision(songsBySet["jeff-story-friends"] ?? []),
    stalemate: officialSetRevision(songsBySet.stalemate ?? []),
    "rad-dad": officialSetRevision(songsBySet["rad-dad"] ?? []),
  };
}
