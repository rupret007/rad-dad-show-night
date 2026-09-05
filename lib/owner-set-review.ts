import type { SetSlug, ShowSong } from "./show-data";

const TEXT_LIMITS = {
  title: 140, artist: 140, performanceNote: 300, songKey: 40, tuning: 80,
  youtubeUrl: 2048, youtubeVideoId: 20, chordsUrl: 2048, lyricsUrl: 2048,
  rehearsalNotes: 2500, updatedAt: 80,
} as const;
const DRAFT_ID = /^draft-[A-Za-z0-9-]*-[1-9][0-9]*$/;
const SETS: SetSlug[] = ["jeff-story-friends", "stalemate", "rad-dad"];

export function readOwnerShowSongs(value: unknown, showId: string): Record<SetSlug, ShowSong[]> | null {
  if (!Array.isArray(value) || value.length > 180 || value.some((row) => !row || typeof row !== "object"
    || !SETS.includes(row.setSlug))) return null;
  const grouped = {} as Record<SetSlug, ShowSong[]>;
  const seen = new Set<number | string>();
  for (const slug of SETS) {
    const songs = readOwnerSetSongs(value.filter((row) => row.setSlug === slug), showId, slug);
    if (!songs || songs.some((song) => seen.has(song.id))) return null;
    songs.forEach((song) => seen.add(song.id));
    grouped[slug] = songs;
  }
  return grouped;
}

/** Read owner rows without public normalization, which deliberately removes notes. */
export function readOwnerSetSongs(value: unknown, showId: string, setSlug: SetSlug): ShowSong[] | null {
  if (!Array.isArray(value) || value.length > 60 || !showId) return null;
  const ids = new Set<number>();
  const positions = new Set<number>();
  const songs: ShowSong[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 || ids.has(row.id)
      || row.showId !== showId || row.setSlug !== setSlug
      || typeof row.position !== "number" || !Number.isInteger(row.position) || row.position < 1 || row.position > 60 || positions.has(row.position)
      || typeof row.transition !== "boolean" || typeof row.isOriginal !== "boolean"
      || typeof row.durationSeconds !== "number" || !Number.isInteger(row.durationSeconds) || row.durationSeconds < 30 || row.durationSeconds > 1200) return null;
    for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
      if (typeof row[field] !== "string" || (row[field] as string).length > limit) return null;
    }
    if (!(row.title as string).trim() || !(row.updatedAt as string).trim()) return null;
    ids.add(row.id); positions.add(row.position);
    songs.push({ ...row } as ShowSong);
  }
  return songs.sort((a, b) => a.position - b.position);
}

export function removedDraftSongs(draft: readonly ShowSong[], saved: readonly ShowSong[]): ShowSong[] {
  const savedIds = new Set(saved.map((song) => song.id));
  return draft.filter((song) => typeof song.id === "number" && !savedIds.has(song.id));
}

/** Only an explicit whole-set replacement choice may stage deleted rows as new. */
export function stageReviewedOwnerDraft(
  draft: readonly ShowSong[], saved: readonly ShowSong[], showId: string, setSlug: SetSlug,
  nextDraftId: () => string,
): ShowSong[] | null {
  const savedIds = new Set(saved.map((song) => song.id));
  const seen = new Set<string | number>();
  const staged: ShowSong[] = [];
  for (const song of draft) {
    if (song.showId !== showId || song.setSlug !== setSlug || seen.has(song.id)) return null;
    seen.add(song.id);
    let id = song.id;
    if (typeof id === "number") {
      if (!Number.isSafeInteger(id) || id <= 0) return null;
      if (!savedIds.has(id)) id = nextDraftId();
    }
    if (typeof id !== "number" && (typeof id !== "string" || id.length > 128 || DRAFT_ID.exec(id)?.[0] !== id)) return null;
    if (staged.some((row) => row.id === id)) return null;
    staged.push({ ...song, id, position: staged.length + 1 });
  }
  return staged;
}

const REVIEW_FIELDS: Array<{ field: keyof ShowSong; label: string }> = [
  { field: "durationSeconds", label: "Duration (seconds)" },
  { field: "performanceNote", label: "Performance cue" },
  { field: "transition", label: "Flows to next" },
  { field: "isOriginal", label: "Original / hide resources" },
  { field: "songKey", label: "Key" }, { field: "tuning", label: "Tuning" },
  { field: "youtubeUrl", label: "YouTube URL" }, { field: "youtubeVideoId", label: "YouTube video ID" },
  { field: "chordsUrl", label: "Chord resource" }, { field: "lyricsUrl", label: "Lyrics URL" },
  { field: "rehearsalNotes", label: "Private rehearsal notes" },
];

export function ownerSongReviewDetails(song: ShowSong, counterpart?: ShowSong): Array<{ label: string; text: string }> {
  return REVIEW_FIELDS.filter(({ field }) => counterpart
    ? !Object.is(song[field], counterpart[field])
    : song[field] !== "" && song[field] !== false)
    .map(({ field, label }) => ({
      label,
      text: typeof song[field] === "boolean" ? (song[field] ? "Yes" : "No") : String(song[field] || "Not recorded"),
    }));
}
