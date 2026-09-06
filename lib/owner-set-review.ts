import type { SetSlug, ShowSong } from "./show-data";
import {
  buildSongResourceLinks,
  publicSongResourceActions,
  savedOfficialMediaUrl,
} from "./song-resources.ts";

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

export type OwnerPublicSongReview = {
  kind: "original" | "public-media" | "owner-search-only";
  youtubePublic: boolean;
  lyricsPublic: boolean;
  notesPrivate: boolean;
  summary: string;
  youtubeOwnerHref: string;
  lyricsOwnerHref: string;
  youtubeOwnerLabel: string;
  lyricsOwnerLabel: string;
};

export type OwnerPublicSetReview = {
  coverCount: number;
  originalCount: number;
  publicYouTubeCount: number;
  publicLyricsCount: number;
  searchOnlyCoverCount: number;
  privateNotesCount: number;
  summary: string;
};

function withPrivateNotes(summary: string, notesPrivate: boolean): string {
  return notesPrivate ? `${summary} Rehearsal notes stay in Show Control.` : summary;
}

/** Name what the public list will show. Owner search links are not public actions. */
export function ownerPublicSongReview(song: ShowSong): OwnerPublicSongReview {
  const publicActions = publicSongResourceActions(song);
  const searches = buildSongResourceLinks(song.title, song.artist);
  const notesPrivate = Boolean(song.rehearsalNotes.trim());
  if (song.isOriginal) {
    return {
      kind: "original",
      youtubePublic: false,
      lyricsPublic: false,
      notesPrivate,
      summary: withPrivateNotes("Original — public list hides YouTube and lyrics.", notesPrivate),
      youtubeOwnerHref: "",
      lyricsOwnerHref: "",
      youtubeOwnerLabel: "",
      lyricsOwnerLabel: "",
    };
  }

  const youtubeSaved = savedOfficialMediaUrl(song.youtubeUrl);
  const lyricsSaved = savedOfficialMediaUrl(song.lyricsUrl);
  const youtubePublic = publicActions.youtubeIsDirect;
  const lyricsPublic = publicActions.lyricsIsDirect;
  let summary: string;
  if (youtubePublic && lyricsPublic) {
    summary = "Public list shows saved YouTube and lyrics.";
  } else if (youtubePublic) {
    summary = "Public list shows saved YouTube. Lyrics stay off the public list until a saved page is pasted.";
  } else if (lyricsPublic) {
    summary = "Public list shows saved lyrics. YouTube stays off the public list until a saved video is pasted.";
  } else {
    summary = "Public list hides YouTube and lyrics. Search links stay in Show Control.";
  }

  return {
    kind: youtubePublic || lyricsPublic ? "public-media" : "owner-search-only",
    youtubePublic,
    lyricsPublic,
    notesPrivate,
    summary: withPrivateNotes(summary, notesPrivate),
    youtubeOwnerHref: youtubeSaved || searches.youtubeSearchUrl,
    lyricsOwnerHref: lyricsSaved || searches.lyricsSearchUrl,
    youtubeOwnerLabel: youtubeSaved ? "Open saved YouTube" : "Search YouTube",
    lyricsOwnerLabel: lyricsSaved ? "Open saved lyrics" : "Search lyrics",
  };
}

function countPhrase(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Review this browser draft against the public official-set media contract. */
export function ownerPublicSetReview(songs: readonly ShowSong[]): OwnerPublicSetReview {
  if (!songs.length) {
    return {
      coverCount: 0,
      originalCount: 0,
      publicYouTubeCount: 0,
      publicLyricsCount: 0,
      searchOnlyCoverCount: 0,
      privateNotesCount: 0,
      summary: "Add a song to review what the public list will show. An empty set stays empty.",
    };
  }

  const reviews = songs.map(ownerPublicSongReview);
  const originalCount = reviews.filter((review) => review.kind === "original").length;
  const publicYouTubeCount = reviews.filter((review) => review.youtubePublic).length;
  const publicLyricsCount = reviews.filter((review) => review.lyricsPublic).length;
  const searchOnlyCoverCount = reviews.filter((review) => review.kind === "owner-search-only").length;
  const privateNotesCount = reviews.filter((review) => review.notesPrivate).length;
  const parts = [
    `${countPhrase(songs.length, "song")} in this browser draft`,
    publicYouTubeCount
      ? `${countPhrase(publicYouTubeCount, "song shows", "songs show")} saved YouTube on the public list`
      : "no saved YouTube on the public list",
    publicLyricsCount
      ? `${countPhrase(publicLyricsCount, "song shows", "songs show")} saved lyrics on the public list`
      : "no saved lyrics on the public list",
  ];
  if (originalCount) parts.push(`${countPhrase(originalCount, "original hides", "originals hide")} both`);
  if (searchOnlyCoverCount) {
    parts.push(`${countPhrase(searchOnlyCoverCount, "cover keeps", "covers keep")} search links in Show Control`);
  }
  if (privateNotesCount) parts.push("Rehearsal notes stay in Show Control");
  return {
    coverCount: songs.length - originalCount,
    originalCount,
    publicYouTubeCount,
    publicLyricsCount,
    searchOnlyCoverCount,
    privateNotesCount,
    summary: `${parts.join(". ")}.`,
  };
}
