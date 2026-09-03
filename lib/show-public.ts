import type { ShowSong } from "./show-data";
import type { ShowSetDefinition } from "./show-read-integrity";

export function toPublicShowSong<T extends { rehearsalNotes?: string }>(
  song: T,
): T {
  return { ...song, rehearsalNotes: "" };
}

export function toPublicShowSongs<T extends { rehearsalNotes?: string }>(
  songs: T[],
): T[] {
  return (Array.isArray(songs) ? songs : []).map(toPublicShowSong);
}

export function visibleOfficialSets(
  sets: ShowSetDefinition[],
  songs: Array<{ setSlug?: string }>,
): ShowSetDefinition[] {
  const list = Array.isArray(songs) ? songs : [];
  return (Array.isArray(sets) ? sets : []).filter(
    (set) =>
      Boolean(set.time?.trim()) ||
      list.some((song) => song.setSlug === set.slug),
  );
}

export function shouldCopyCloneSongs(copySongs: unknown): boolean {
  if (copySongs === false || copySongs === "false" || copySongs === 0) {
    return false;
  }
  return true;
}

export function publicSongsLeakRehearsalNotes(
  songs: Array<{ rehearsalNotes?: string }>,
): boolean {
  return (Array.isArray(songs) ? songs : []).some((song) =>
    Boolean(song.rehearsalNotes?.trim()),
  );
}
