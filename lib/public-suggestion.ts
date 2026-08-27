export const PUBLIC_SUGGESTION_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/formResponse";

export const PUBLIC_SUGGESTION_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1wnw2qENE9v1LVroC-V3sZLyOr1-JKRrHTzr2L2k35kM/gviz/tq?tqx=out:csv&sheet=Form%20Responses%201";

export const OFFICIAL_SET_MUTATION_KEYS = [
  "setSlug",
  "set_slug",
  "showSlug",
  "show_slug",
  "showId",
  "show_id",
  "songs",
  "position",
  "order",
  "songKey",
  "song_key",
  "tuning",
  "transition",
  "durationSeconds",
  "duration_seconds",
  "performanceNote",
  "performance_note",
  "rehearsalNotes",
  "rehearsal_notes",
  "youtubeUrl",
  "youtube_url",
  "youtubeVideoId",
  "youtube_video_id",
  "chordsUrl",
  "chords_url",
  "lyricsUrl",
  "lyrics_url",
  "updatedBy",
  "updated_by",
] as const;

export type PublicSuggestionFields = {
  title: string;
  artist: string;
  addedBy: string;
  notes: string;
  isOriginal: boolean;
};

export type SanitizedPublicSuggestion =
  | { kind: "honeypot" }
  | { kind: "suggestion"; suggestion: PublicSuggestionFields };

export function cleanSuggestionText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function publicSuggestionHasOfficialSetMutationAttempt(
  payload: Record<string, unknown>,
): boolean {
  return OFFICIAL_SET_MUTATION_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key),
  );
}

export function sanitizePublicSuggestion(
  payload: Record<string, unknown>,
): SanitizedPublicSuggestion {
  if (cleanSuggestionText(payload.website, 200)) {
    return { kind: "honeypot" };
  }

  return {
    kind: "suggestion",
    suggestion: {
      title: cleanSuggestionText(payload.title ?? payload.song, 140),
      artist: cleanSuggestionText(payload.artist, 140),
      addedBy: cleanSuggestionText(payload.addedBy, 100),
      notes: cleanSuggestionText(payload.notes, 500),
      isOriginal:
        payload.isOriginal === true || payload.isOriginal === "true",
    },
  };
}

export function assertPublicSuggestionNetworkTarget(
  url: string,
  method = "GET",
): void {
  const href = String(url);
  const verb = method.toUpperCase();
  if (verb === "GET" && href === PUBLIC_SUGGESTION_SHEET_CSV_URL) return;
  if (verb === "POST" && href === PUBLIC_SUGGESTION_FORM_URL) return;
  throw new Error("Public suggestions cannot reach official set storage.");
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function createPublicSuggestionFetch(
  fetchImpl?: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    assertPublicSuggestionNetworkTarget(
      requestUrl(input),
      init?.method ?? "GET",
    );
    const impl = fetchImpl ?? globalThis.fetch;
    return impl(input, init);
  };
}

export function buildPublicSuggestionFormBody(
  suggestion: PublicSuggestionFields,
): URLSearchParams {
  return new URLSearchParams({
    "entry.988161673": suggestion.title,
    "entry.515724080": suggestion.artist,
    "entry.1834262230": suggestion.addedBy,
    "entry.286610891": suggestion.isOriginal
      ? `[ORIGINAL]${suggestion.notes ? ` ${suggestion.notes}` : ""}`
      : suggestion.notes,
  });
}
