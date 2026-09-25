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

export type ShowFirstOpenAction = {
  kind: "start-set" | "suggest-song";
  title: string;
  copy: string;
  label: string;
  href: string;
  setSlug?: string;
};

export type PublicLeftoverAction = {
  kind: "suggest-song" | "practice-show";
  label: string;
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

export function firstOpenAction(use: ShowNightUse): ShowFirstOpenAction {
  if (!use.hasVerifiedList) {
    return {
      kind: "suggest-song",
      title: "This show has no official set yet.",
      copy: "We will not show another night's songs. Suggest a song for this event.",
      label: "Suggest a song",
      href: "#suggestions",
    };
  }
  const when = use.firstSet?.time ? ` at ${use.firstSet.time}` : "";
  return {
    kind: "start-set",
    title: use.firstSet
      ? `Start with ${use.firstSet.title}${when}.`
      : "See this night's official set.",
    copy: `${use.songCount} verified song${use.songCount === 1 ? "" : "s"} on this show.`,
    label: "See the official sets",
    href: use.firstSet ? `#set-${use.firstSet.slug}` : "#official-sets",
    setSlug: use.firstSet?.slug,
  };
}

export function leftoverPublicActions(
  use: ShowNightUse,
  next: ShowFirstOpenAction,
): PublicLeftoverAction[] {
  if (next.kind === "suggest-song") return [];
  const leftovers: PublicLeftoverAction[] = [
    { kind: "suggest-song", label: "Suggest a song" },
  ];
  if (use.hasVerifiedList) {
    leftovers.push({ kind: "practice-show", label: "Practice this show" });
  }
  return leftovers;
}

export type StageCue = {
  label: string;
  afterPosition: number;
  accent: "solo" | "duet" | "guests";
};

export type OpeningSetFlow = {
  hasStageCues: boolean;
  stageCues: StageCue[];
  hasTbdSlot: boolean;
  tbdSlotPosition: number;
};

const SOLO_PATTERN = /\bsolo\b/i;
const DUET_PATTERN = /\bduet\b/i;
const CANDACE_PATTERN = /\bcandace\b/i;
const TBD_PATTERN = /\bTBD\b/;

export function openingSetStageCues(
  songs: Array<{
    setSlug?: string;
    position: number;
    performanceNote: string;
    title: string;
  }>,
): OpeningSetFlow {
  const opening = songs
    .filter((s) => s.setSlug === "jeff-story-friends")
    .sort((a, b) => a.position - b.position);

  if (opening.length < 3) {
    return { hasStageCues: false, stageCues: [], hasTbdSlot: false, tbdSlotPosition: 0 };
  }

  const phases: Array<{ phase: "solo" | "duet" | "guests"; position: number }> = [];
  for (const song of opening) {
    const note = song.performanceNote;
    if (SOLO_PATTERN.test(note)) {
      phases.push({ phase: "solo", position: song.position });
    } else if (DUET_PATTERN.test(note) || CANDACE_PATTERN.test(note)) {
      phases.push({ phase: "duet", position: song.position });
    } else {
      phases.push({ phase: "guests", position: song.position });
    }
  }

  const cues: StageCue[] = [];
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].phase !== phases[i - 1].phase) {
      const label =
        phases[i].phase === "duet"
          ? "Candace joins Jeff"
          : phases[i].phase === "guests"
            ? "Guest performers"
            : "Solo";
      cues.push({
        label,
        afterPosition: phases[i - 1].position,
        accent: phases[i].phase,
      });
    }
  }

  const tbdSong = opening.find((s) => TBD_PATTERN.test(s.title));

  return {
    hasStageCues: cues.length > 0,
    stageCues: cues,
    hasTbdSlot: Boolean(tbdSong),
    tbdSlotPosition: tbdSong?.position ?? 0,
  };
}

export function publicProductionNotes({
  canonicalShow,
  featuredGuestTitle,
  expectedWrap,
  openingFlow,
}: {
  canonicalShow: boolean;
  featuredGuestTitle?: string | null;
  expectedWrap: string;
  openingFlow?: OpeningSetFlow | null;
}): string[] {
  const notes = ["Share the backline where practical."];
  const guest = featuredGuestTitle?.trim() ?? "";
  if (guest) {
    notes.push(
      /fault lines/i.test(guest)
        ? "Protect the Mason / Fault Lines setup window."
        : `Protect the ${guest} setup window.`,
    );
  }
  if (openingFlow?.hasStageCues) {
    notes.push(
      "Candace joins Jeff after the solo acoustic songs. Cue her before song 3.",
    );
  }
  if (openingFlow?.hasTbdSlot) {
    notes.push(
      `Slot ${openingFlow.tbdSlotPosition} is TBD — Jeff picks the second acoustic song.`,
    );
  }
  notes.push("Confirm guest keys and endings before show day.");
  const wrap = expectedWrap.trim();
  if (canonicalShow) {
    notes.push("10:00 PM is the expected wrap, not a venue curfew.");
  } else if (wrap) {
    notes.push(`${wrap} is the expected wrap, not a venue curfew.`);
  }
  return notes;
}

export function showHasRunOfShow(timeline: unknown): boolean {
  return Array.isArray(timeline) && timeline.length > 0;
}
