import { parseScheduledMinutes } from "./set-coach.ts";
import type { SetSlug, ShowSong } from "./show-data";

const OPENING_SET_SLUG: SetSlug = "jeff-story-friends";
const TBD_TITLE_PATTERN = /\bTBD\b/;

export type AcousticCandidate = {
  id: string;
  title: string;
  artist?: string;
  /** Seconds, or null/undefined when no rehearsed runtime is confirmed yet. Never guessed. */
  estimatedSeconds?: number | null;
  note?: string;
};

export type AcousticCandidateFit =
  | "fits"
  | "over-budget"
  | "duration-unconfirmed"
  | "window-unconfirmed";

export type AcousticCandidateAssessment = AcousticCandidate & {
  fit: AcousticCandidateFit;
  detail: string;
};

export type TbdAcousticSlot = {
  hasTbdSlot: boolean;
  song: { id: ShowSong["id"]; position: number; title: string } | null;
};

export type TbdAcousticHelperResult = {
  slot: TbdAcousticSlot;
  scheduledMinutes: number | null;
  confirmedSeconds: number;
  /** Seconds left in the set's own window after every confirmed song, excluding the TBD slot. Null when the window is unconfirmed. */
  remainingSeconds: number | null;
  candidates: AcousticCandidateAssessment[];
  readinessChecklist: string[];
  decisionRequired: boolean;
};

/**
 * Earlier options recorded in the September 15 opener revision
 * (see docs/OPENING_SET_20260915.md and docs/SHOW_PLAN.md). Neither has a
 * confirmed rehearsed runtime, so estimatedSeconds stays null rather than
 * guessed. This list is a starting point for the owner, not an automatic pick.
 */
export const KNOWN_TBD_ACOUSTIC_OPTIONS: readonly AcousticCandidate[] = [
  {
    id: "badfish",
    title: "Badfish",
    artist: "Sublime",
    estimatedSeconds: null,
    note: "Earlier option for slot 2; no confirmed rehearsed runtime yet.",
  },
  {
    id: "nutshell",
    title: "Nutshell",
    artist: "Alice in Chains",
    estimatedSeconds: null,
    note: "Earlier option for slot 2; no confirmed rehearsed runtime yet.",
  },
];

function sortedOpeningSongs(songs: readonly ShowSong[]): ShowSong[] {
  return songs
    .filter((song) => song.setSlug === OPENING_SET_SLUG)
    .slice()
    .sort((a, b) => a.position - b.position);
}

/** Finds the placeholder "TBD" slot in Jeff Story & Friends. Never guesses which song fills it. */
export function findTbdAcousticSlot(songs: readonly ShowSong[]): TbdAcousticSlot {
  const song = sortedOpeningSongs(songs).find((candidate) =>
    TBD_TITLE_PATTERN.test(candidate.title),
  );
  return {
    hasTbdSlot: Boolean(song),
    song: song ? { id: song.id, position: song.position, title: song.title } : null,
  };
}

function safeDurationSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function assessCandidate(
  candidate: AcousticCandidate,
  remainingSeconds: number | null,
): AcousticCandidateAssessment {
  if (remainingSeconds === null) {
    return {
      ...candidate,
      fit: "window-unconfirmed",
      detail:
        "This set has no confirmed start-to-end window yet, so runtime fit is not scored.",
    };
  }
  const seconds = candidate.estimatedSeconds;
  if (seconds === null || seconds === undefined) {
    return {
      ...candidate,
      fit: "duration-unconfirmed",
      detail: "No confirmed rehearsed runtime for this song yet. Time it before counting on it.",
    };
  }
  if (seconds <= remainingSeconds) {
    const spareMinutes = Math.round(((remainingSeconds - seconds) / 60) * 10) / 10;
    return {
      ...candidate,
      fit: "fits",
      detail: `Fits with about ${spareMinutes} minute${spareMinutes === 1 ? "" : "s"} of room left in the set.`,
    };
  }
  const overMinutes = Math.ceil((seconds - remainingSeconds) / 60);
  return {
    ...candidate,
    fit: "over-budget",
    detail: `About ${overMinutes} minute${overMinutes === 1 ? "" : "s"} over the set's remaining time budget.`,
  };
}

/**
 * Pure, local advisory for the TBD acoustic slot in Jeff Story & Friends.
 * Never writes, never auto-selects a song, and never invents a runtime.
 * The owner still makes the choice and saves it in Show Control.
 */
export function assessTbdAcousticSlot({
  songs,
  setTime,
  candidates = KNOWN_TBD_ACOUSTIC_OPTIONS,
}: {
  songs: readonly ShowSong[];
  setTime: string;
  candidates?: readonly AcousticCandidate[];
}): TbdAcousticHelperResult {
  const slot = findTbdAcousticSlot(songs);
  const opening = sortedOpeningSongs(songs);
  const confirmedSeconds = opening
    .filter((song) => !slot.song || song.id !== slot.song.id)
    .reduce((total, song) => total + safeDurationSeconds(song.durationSeconds), 0);
  const scheduledMinutes = parseScheduledMinutes(setTime);
  const remainingSeconds =
    scheduledMinutes === null ? null : scheduledMinutes * 60 - confirmedSeconds;

  const assessed = slot.hasTbdSlot
    ? candidates.map((candidate) => assessCandidate(candidate, remainingSeconds))
    : [];

  const readinessChecklist: string[] = [];
  if (slot.hasTbdSlot) {
    readinessChecklist.push("Confirm the second acoustic song with Jeff before show night.");
    if (!candidates.length) {
      readinessChecklist.push(
        "No candidate songs recorded yet. Add one below or in this song's rehearsal notes.",
      );
    }
    readinessChecklist.push(
      "Once chosen, replace the TBD title and clear this placeholder rehearsal note.",
    );
    readinessChecklist.push(
      "Add the confirmed key, tuning, and rehearsed runtime for the chosen song.",
    );
    readinessChecklist.push("Save Jeff Story & Friends in Show Control to make the pick official.");
  }

  return {
    slot,
    scheduledMinutes,
    confirmedSeconds,
    remainingSeconds,
    candidates: assessed,
    readinessChecklist,
    decisionRequired: slot.hasTbdSlot,
  };
}
