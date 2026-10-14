import { parseScheduledMinutes } from "./set-coach.ts";
import { SHOW_TIME_ZONE } from "./show-read-integrity.ts";
import type { SetSlug, ShowSong } from "./show-data";

const OPENING_SET_SLUG: SetSlug = "jeff-story-friends";
/** The September 15 opener keeps the second acoustic song in position 2. */
export const DESIGNATED_ACOUSTIC_SLOT_POSITION = 2;
export const SHOW_SLOT_TIME_ZONE = SHOW_TIME_ZONE;
const ACOUSTIC_PLACEHOLDER_TITLE = /^acoustic song\s*[-–—]\s*tbd$/i;
const SHOW_ZONE_LABEL = /^(?:CT|CDT|CST|America\/Chicago)$/i;
const LABELED_CLOCK =
  /^(.*\b(?:AM|PM))\s+([A-Za-z]{2,5}|[A-Za-z]+\/[A-Za-z_]+)$/i;
const CLOCK_RANGE =
  /^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

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

export type ParsedSetTimeSlot = {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  timeZone: typeof SHOW_SLOT_TIME_ZONE;
};

export type TimeSlotRelation = "equal" | "adjacent" | "overlap" | "separate";

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
 * Recorded candidate titles if the second acoustic slot is opened as TBD.
 * On the seeded September 19 set those songs are already placed (see
 * docs/SHOW_PLAN.md). Neither has a confirmed rehearsed runtime in this
 * helper, so estimatedSeconds stays null rather than guessed. This list is a
 * starting point for the owner, not an automatic pick.
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
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return String(a.id).localeCompare(String(b.id), "en");
    });
}

function isAcousticPlaceholderTitle(title: string): boolean {
  return ACOUSTIC_PLACEHOLDER_TITLE.test(title.trim());
}

function clockMinutes(hour: number, minute: number, period: string): number {
  return (hour % 12) * 60 + minute + (period === "PM" ? 720 : 0);
}

function parseClockRange(clock: string): { startMinutes: number; endMinutes: number } | null {
  const match = clock.trim().match(CLOCK_RANGE);
  if (!match) return null;
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[4]);
  const endMinute = Number(match[5]);
  if (
    startHour < 1 || startHour > 12 || endHour < 1 || endHour > 12
    || startMinute > 59 || endMinute > 59
  ) {
    return null;
  }
  const endPeriod = match[6].toUpperCase();
  const startPeriod = (match[3] || endPeriod).toUpperCase();
  return {
    startMinutes: clockMinutes(startHour, startMinute, startPeriod),
    endMinutes: clockMinutes(endHour, endMinute, endPeriod),
  };
}

/**
 * Parse one set window as America/Chicago wall-clock minutes.
 * Missing times stay unconfirmed. A show-zone label is accepted and ignored.
 * A foreign timezone is rejected rather than converted.
 */
export function parseSetTimeSlot(value: unknown): ParsedSetTimeSlot | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let clock = trimmed;
  const labeled = trimmed.match(LABELED_CLOCK);
  if (labeled) {
    if (!SHOW_ZONE_LABEL.test(labeled[2])) return null;
    clock = labeled[1].trim();
  }

  const durationMinutes = parseScheduledMinutes(clock);
  const bounds = parseClockRange(clock);
  if (durationMinutes === null || !bounds) return null;
  if (bounds.endMinutes - bounds.startMinutes !== durationMinutes) return null;

  return {
    ...bounds,
    durationMinutes,
    timeZone: SHOW_SLOT_TIME_ZONE,
  };
}

export function relateTimeSlots(
  left: ParsedSetTimeSlot,
  right: ParsedSetTimeSlot,
): TimeSlotRelation {
  if (left.startMinutes === right.startMinutes && left.endMinutes === right.endMinutes) {
    return "equal";
  }
  if (left.endMinutes === right.startMinutes || right.endMinutes === left.startMinutes) {
    return "adjacent";
  }
  if (left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes) {
    return "overlap";
  }
  return "separate";
}

/**
 * One confirmed window only. Equal copies of the same clock range are fine.
 * Adjacent or overlapping windows are not merged or converted.
 */
export function confirmedSetTime(times: readonly unknown[]): string {
  const parsed: Array<{ raw: string; slot: ParsedSetTimeSlot }> = [];
  for (const value of times) {
    const slot = parseSetTimeSlot(value);
    if (!slot || typeof value !== "string") continue;
    parsed.push({ raw: value.trim(), slot });
  }
  if (!parsed.length) return "";
  const first = parsed[0];
  for (const other of parsed.slice(1)) {
    if (relateTimeSlots(first.slot, other.slot) !== "equal") return "";
  }
  return first.raw;
}

/**
 * Finds the placeholder acoustic slot in Jeff Story & Friends by the designated
 * second-acoustic position only. Songs at any other position — including an
 * exact "Acoustic song - TBD" title — never open this helper. Adjacent
 * TBD-looking titles and overlapping songs at another position never steal
 * the slot. Never guesses a fill by scanning titles.
 */
export function findTbdAcousticSlot(songs: readonly ShowSong[]): TbdAcousticSlot {
  const opening = sortedOpeningSongs(songs);
  const atDesignated = opening.filter(
    (song) => song.position === DESIGNATED_ACOUSTIC_SLOT_POSITION,
  );
  const placeholder = atDesignated.find((song) => isAcousticPlaceholderTitle(song.title));
  if (!placeholder) {
    return { hasTbdSlot: false, song: null };
  }
  return {
    hasTbdSlot: true,
    song: { id: placeholder.id, position: placeholder.position, title: placeholder.title },
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
  setTime: string | readonly string[];
  candidates?: readonly AcousticCandidate[];
}): TbdAcousticHelperResult {
  const slot = findTbdAcousticSlot(songs);
  const opening = sortedOpeningSongs(songs);
  const confirmedSeconds = opening
    .filter((song) => !slot.song || song.id !== slot.song.id)
    .reduce((total, song) => total + safeDurationSeconds(song.durationSeconds), 0);
  const window = Array.isArray(setTime) ? confirmedSetTime(setTime) : confirmedSetTime([setTime]);
  const scheduledMinutes = parseSetTimeSlot(window)?.durationMinutes ?? null;
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
