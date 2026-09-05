/** Shared, browser-safe suggestion receipts. No storage or network actions. */
export type SuggestionFields = {
  title: string;
  artist: string;
  addedBy: string;
  notes: string;
  isOriginal: boolean;
};

export type PublicSuggestion = SuggestionFields & {
  id: string;
  submittedAt: string;
};

export const MAX_SUGGESTION_ROWS = 1000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number, required = false): value is string {
  return typeof value === "string" && value.length <= max
    && (!required || value.trim().length > 0);
}

export function isSuggestionFields(value: unknown): value is SuggestionFields {
  const row = record(value);
  return Boolean(row && text(row.title, 140, true) && text(row.artist, 140)
    && text(row.addedBy, 100, true) && text(row.notes, 500)
    && typeof row.isOriginal === "boolean");
}

export function isPublicSuggestion(value: unknown): value is PublicSuggestion {
  const row = record(value);
  return Boolean(row && text(row.id, 256, true)
    && text(row.submittedAt, 100, true) && isSuggestionFields(row));
}

/** Reject unavailable/malformed responses instead of converting them to empty. */
export function parseSuggestionFeedPayload(value: unknown): PublicSuggestion[] {
  const payload = record(value);
  if (!payload || Object.prototype.hasOwnProperty.call(payload, "error")
    || Object.prototype.hasOwnProperty.call(payload, "delivery")
    || !Array.isArray(payload.suggestions)
    || payload.suggestions.length > MAX_SUGGESTION_ROWS
    || !payload.suggestions.every(isPublicSuggestion)) {
    throw new Error("The suggestion board could not be verified.");
  }
  const rows = payload.suggestions as PublicSuggestion[];
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error("The suggestion board could not be verified.");
  }
  return rows.map((row) => ({
    id: row.id, submittedAt: row.submittedAt, title: row.title,
    artist: row.artist, addedBy: row.addedBy, notes: row.notes,
    isOriginal: row.isOriginal,
  }));
}

function songText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sameSuggestionSong(
  left: Pick<SuggestionFields, "title" | "artist">,
  right: Pick<SuggestionFields, "title" | "artist">,
): boolean {
  return songText(left.title) === songText(right.title)
    && songText(left.artist) === songText(right.artist);
}

/** A song match alone cannot confirm this person's complete submission. */
export function sameSuggestionSubmission(left: SuggestionFields, right: SuggestionFields): boolean {
  return left.title === right.title && left.artist === right.artist
    && left.addedBy === right.addedBy && left.notes === right.notes
    && left.isOriginal === right.isOriginal;
}
