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

function cleanShowClock(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Join this night's start and end. Blank clocks stay blank instead of "-". */
export function formatShowHours(startTime = "", endTime = ""): string {
  const start = cleanShowClock(startTime, 40);
  const end = cleanShowClock(endTime, 40);
  if (start && end) return `${start}-${end}`;
  return start || end;
}

export function showHoursLabel(hours = ""): string {
  return hours.trim() || "Hours not set";
}

/**
 * Empty clones do not inherit another night's start, end, or wrap.
 * A full copy keeps the source clocks unless the owner enters both times.
 */
export function cloneShowNightHours({
  copySongs,
  sourceStartTime,
  sourceEndTime,
  sourceExpectedWrap,
  startTime,
  endTime,
}: {
  copySongs: boolean;
  sourceStartTime?: unknown;
  sourceEndTime?: unknown;
  sourceExpectedWrap?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}): { startTime: string; endTime: string; expectedWrap: string } {
  const enteredStart = cleanShowClock(startTime, 40);
  const enteredEnd = cleanShowClock(endTime, 40);
  if (enteredStart && enteredEnd) {
    return {
      startTime: enteredStart,
      endTime: enteredEnd,
      expectedWrap: `Expected wrap near ${enteredEnd}`,
    };
  }
  if (copySongs) {
    return {
      startTime: cleanShowClock(sourceStartTime, 40),
      endTime: cleanShowClock(sourceEndTime, 40),
      expectedWrap: cleanShowClock(sourceExpectedWrap, 140),
    };
  }
  return { startTime: "", endTime: "", expectedWrap: "" };
}

export function publicSongsLeakRehearsalNotes(
  songs: Array<{ rehearsalNotes?: string }>,
): boolean {
  return (Array.isArray(songs) ? songs : []).some((song) =>
    Boolean(song.rehearsalNotes?.trim()),
  );
}
