import type { SetSlug, ShowSong } from "./show-data";

export type CoachInput = {
  requestId: string; showId: string; showSlug: string; showTitle: string;
  setSlug: SetSlug; setTime: string; songs: ShowSong[];
};

export type CoachFinding = { tone: "good" | "watch" | "action"; title: string; detail: string };

export type CoachResult = {
  requestId: string; source: "smart-check" | "openai"; score: number | null;
  estimatedMinutes: number; scheduledMinutes: number | null;
  findings: CoachFinding[]; aiNotes: string;
};

const SET_SLUGS = new Set(["jeff-story-friends", "stalemate", "rad-dad"]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, limit: number, required = false): value is string {
  return typeof value === "string" && value.length <= limit && !value.includes("\u0000")
    && (!required || Boolean(value.trim()));
}

function identifier(value: unknown, limit: number): value is string {
  return text(value, limit, true) && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

/** Only explicit clock ranges establish a window. No date or meridiem rollover is guessed. */
export function parseScheduledMinutes(value: unknown): number | null {
  if (!text(value, 40)) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const startHour = Number(match[1]), startMinute = Number(match[2]);
  const endHour = Number(match[4]), endMinute = Number(match[5]);
  if (startHour < 1 || startHour > 12 || endHour < 1 || endHour > 12 || startMinute > 59 || endMinute > 59) return null;
  const endPeriod = match[6].toUpperCase();
  const startPeriod = (match[3] || endPeriod).toUpperCase();
  const clockMinutes = (hour: number, minute: number, period: string) =>
    (hour % 12) * 60 + minute + (period === "PM" ? 720 : 0);
  const minutes = clockMinutes(endHour, endMinute, endPeriod) - clockMinutes(startHour, startMinute, startPeriod);
  return minutes > 0 && minutes <= 240 ? minutes : null;
}

/** A review is scoped to one complete owner draft; never silently truncate it. */
export function parseCoachInput(value: unknown): CoachInput | null {
  if (!record(value) || !identifier(value.requestId, 120) || !identifier(value.showId, 140)
    || !identifier(value.showSlug, 180) || !text(value.showTitle, 400, true)
    || typeof value.setSlug !== "string" || !SET_SLUGS.has(value.setSlug) || !text(value.setTime, 40)
    || !Array.isArray(value.songs) || !value.songs.length || value.songs.length > 60) return null;
  const ids = new Set<string>();
  for (const [index, song] of value.songs.entries()) {
    if (!record(song) || song.showId !== value.showId || song.setSlug !== value.setSlug
      || song.position !== index + 1 || !text(song.title, 300, true) || !text(song.artist, 300)
      || typeof song.isOriginal !== "boolean" || typeof song.transition !== "boolean"
      || !Number.isInteger(song.durationSeconds) || (song.durationSeconds as number) < 0 || (song.durationSeconds as number) > 7200
      || !text(song.performanceNote, 3000) || !text(song.youtubeUrl, 3000)) return null;
    const id = typeof song.id === "number" && Number.isSafeInteger(song.id) && song.id > 0
      ? String(song.id) : identifier(song.id, 140) ? song.id : "";
    if (!id || ids.has(id)) return null;
    ids.add(id);
  }
  return value as CoachInput;
}

export function buildCoachCheck(input: CoachInput): CoachResult {
  const scheduledMinutes = parseScheduledMinutes(input.setTime);
  const estimatedMinutes = Math.round(input.songs.reduce((total, song) => total + (song.durationSeconds || 180), 0) / 60);
  const difference = scheduledMinutes === null ? null : scheduledMinutes - estimatedMinutes;
  const findings: CoachFinding[] = difference === null ? [{
    tone: "watch", title: "No verified set window",
    detail: "This show has no clear start-to-end window for this set. Runtime is an estimate; timing has not been scored.",
  }] : [{
    tone: Math.abs(difference) <= 5 ? "good" : "watch", title: `Estimated ${estimatedMinutes} minutes`,
    detail: difference >= 0
      ? `${difference} minutes of room remain in this set's ${scheduledMinutes}-minute window.`
      : `${Math.abs(difference)} minutes over this set's window before talking or delays.`,
  }];
  const transitions = input.songs.filter((song) => song.transition).length;
  findings.push({
    tone: transitions ? "good" : "watch", title: `${transitions} planned transition${transitions === 1 ? "" : "s"}`,
    detail: transitions ? "Flow cues are clearly marked for the band."
      : "Consider whether one direct transition would strengthen the middle of the set.",
  });
  const guestSongs = input.songs.filter((song) => song.performanceNote.trim()).length;
  if (guestSongs) findings.push({
    tone: guestSongs > 3 ? "watch" : "good", title: `${guestSongs} songs carry performance cues`,
    detail: guestSongs > 3 ? "Confirm guest handoffs and endings early so the set does not lose momentum."
      : "The guest load looks manageable for this set.",
  });
  const missingExactVideos = input.songs.filter((song) => !song.isOriginal && !song.youtubeUrl.trim()).length;
  if (missingExactVideos) findings.push({
    tone: "action", title: `${missingExactVideos} covers have no saved YouTube reference`,
    detail: "Paste exact rehearsal versions only where the band needs one specific arrangement.",
  });
  return {
    requestId: input.requestId, source: "smart-check",
    score: difference === null ? null : Math.max(45, Math.min(98, 92 - Math.max(0, Math.abs(difference) - 4) * 3)),
    estimatedMinutes, scheduledMinutes, findings: findings.slice(0, 4), aiNotes: "",
  };
}

/** Treat a mismatched, partial, or non-finite response as an unverified review. */
export function parseCoachResult(value: unknown, expectedRequestId: string): CoachResult | null {
  if (!record(value) || Object.prototype.hasOwnProperty.call(value, "error")
    || !identifier(expectedRequestId, 120) || value.requestId !== expectedRequestId
    || (value.source !== "smart-check" && value.source !== "openai")
    || !Number.isInteger(value.estimatedMinutes) || (value.estimatedMinutes as number) < 0 || (value.estimatedMinutes as number) > 7200
    || !text(value.aiNotes, 6000) || !Array.isArray(value.findings) || !value.findings.length || value.findings.length > 4) return null;
  if (value.scheduledMinutes === null) {
    if (value.score !== null) return null;
  } else if (!Number.isInteger(value.scheduledMinutes) || (value.scheduledMinutes as number) < 1 || (value.scheduledMinutes as number) > 240
    || !Number.isInteger(value.score) || (value.score as number) < 0 || (value.score as number) > 100) return null;
  if (value.findings.some((finding) => !record(finding)
    || typeof finding.tone !== "string" || !["good", "watch", "action"].includes(finding.tone)
    || !text(finding.title, 160, true) || !text(finding.detail, 1000, true))) return null;
  return value as CoachResult;
}
