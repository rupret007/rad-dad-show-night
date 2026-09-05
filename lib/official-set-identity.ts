const DRAFT_SONG_ID = /^draft-[A-Za-z0-9-]*-[1-9][0-9]*$/;

export class OfficialSetIdentityError extends Error {
  constructor() {
    super("A song identity could not be verified for this show and set. Reload the official set before saving.");
    this.name = "OfficialSetIdentityError";
  }
}

/**
 * Return only proven, existing row IDs. Null means a genuinely new row whose ID
 * must be allocated by SQLite, never inferred from a title, position, or token.
 * The caller must read ownedIds using the exact show AND set predicate.
 */
export function resolveOfficialSetSongIds(
  submittedSongs: readonly unknown[],
  ownedIds: readonly number[],
  showId: string,
  setSlug: string,
): (number | null)[] {
  const owned = new Set(ownedIds);
  const seen = new Set<number | string>();
  return submittedSongs.map((submitted) => {
    if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
      throw new OfficialSetIdentityError();
    }
    const song = submitted as Record<string, unknown>;
    if (
      (song.showId !== undefined && song.showId !== showId) ||
      (song.setSlug !== undefined && song.setSlug !== setSlug)
    ) {
      throw new OfficialSetIdentityError();
    }
    const id = song.id;
    if (id === undefined) return null;
    if (typeof id === "number") {
      if (!Number.isSafeInteger(id) || id <= 0 || !owned.has(id) || seen.has(id)) {
        throw new OfficialSetIdentityError();
      }
      seen.add(id);
      return id;
    }
    if (
      typeof id !== "string" || id.length > 128 ||
      DRAFT_SONG_ID.exec(id)?.[0] !== id || seen.has(id)
    ) {
      throw new OfficialSetIdentityError();
    }
    seen.add(id);
    return null;
  });
}
