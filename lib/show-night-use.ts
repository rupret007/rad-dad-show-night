import type { ShowSetDefinition } from "./show-read-integrity";

export type ShowNightSetUse = ShowSetDefinition & {
  songCount: number;
};

export type ShowNightUse = {
  hasVerifiedList: boolean;
  songCount: number;
  sets: ShowNightSetUse[];
  firstSet: ShowNightSetUse | null;
};

export type PracticeSongRef = {
  id: string | number;
  title: string;
};

export function practicePositionKey(showSlug: string): string {
  return `rad-dad-practice-position:${showSlug}`;
}

export function buildShowNightUse(
  songs: Array<{ setSlug?: string }>,
  sets: ShowSetDefinition[],
): ShowNightUse {
  const list = Array.isArray(songs) ? songs : [];
  const setUses = (Array.isArray(sets) ? sets : []).map((set) => ({
    ...set,
    songCount: list.filter((song) => song.setSlug === set.slug).length,
  }));
  return {
    hasVerifiedList: list.length > 0,
    songCount: list.length,
    sets: setUses,
    firstSet: setUses.find((set) => set.songCount > 0) ?? null,
  };
}

export function resumeSongFromSavedPosition(
  savedId: string | null | undefined,
  songs: PracticeSongRef[],
): PracticeSongRef | null {
  if (!savedId) return null;
  return songs.find((song) => String(song.id) === savedId) ?? null;
}

export function fanNextStepCopy(use: ShowNightUse): {
  title: string;
  copy: string;
} {
  if (!use.hasVerifiedList) {
    return {
      title: "This show has no official set yet.",
      copy: "We will not show another night's songs. Suggest a song for this event.",
    };
  }
  const when = use.firstSet?.time ? ` at ${use.firstSet.time}` : "";
  return {
    title: use.firstSet
      ? `Start with ${use.firstSet.title}${when}.`
      : "See this night, then suggest a song.",
    copy: `${use.songCount} verified song${use.songCount === 1 ? "" : "s"} on this show. Then suggest a song if you have one.`,
  };
}

export function bandNextStepCopy(use: ShowNightUse): {
  title: string;
  copy: string;
} {
  if (!use.hasVerifiedList) {
    return {
      title: "This show has no verified list yet.",
      copy: "Practice stays empty rather than borrowing another show.",
    };
  }
  return {
    title: "Practice this show's verified list.",
    copy: `${use.songCount} songs on this event. Keys and handoffs stay here.`,
  };
}
