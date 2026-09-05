export type RunSongIdentity = { id: string | number };

export type RunPosition<T extends RunSongIdentity> = {
  kind: "unselected" | "selected" | "missing" | "ambiguous";
  currentIndex: number;
  currentSong: T | null;
  previousSong: T | null;
  nextSong: T | null;
};

function identity(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && value.trim() === value
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,139}$/.test(value) ? value : null;
}

/** Local reading position only. Never infer a song from its title or old index. */
export function resolveRunPosition<T extends RunSongIdentity>(
  orderedSongs: readonly T[],
  selectedId: string | null | undefined,
): RunPosition<T> {
  const empty = (kind: RunPosition<T>["kind"]): RunPosition<T> => ({
    kind, currentIndex: -1, currentSong: null, previousSong: null, nextSong: null,
  });
  const ids = orderedSongs.map((song) => identity(song?.id));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return empty("ambiguous");
  if (!selectedId) return empty("unselected");
  if (!identity(selectedId)) return empty("missing");
  const currentIndex = ids.indexOf(selectedId);
  if (currentIndex < 0) return empty("missing");
  return {
    kind: "selected", currentIndex, currentSong: orderedSongs[currentIndex],
    previousSong: currentIndex > 0 ? orderedSongs[currentIndex - 1] : null,
    nextSong: currentIndex < orderedSongs.length - 1 ? orderedSongs[currentIndex + 1] : null,
  };
}
