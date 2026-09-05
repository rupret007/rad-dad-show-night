import type { PublicSuggestion, SuggestionFields } from "./suggestion-board";

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

export type PublicSuggestionFields = SuggestionFields;

const SUGGESTION_READ_DEADLINE_MS = 6000;
const SUGGESTION_WRITE_DEADLINE_MS = 8000;
const MAX_FEED_BYTES = 512 * 1024;
const MAX_FEED_ROWS = 1000;

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
      init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"),
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

export async function writeSanitizedSuggestionToForm(
  suggestion: PublicSuggestionFields,
  fetchImpl?: typeof fetch,
  timeoutMs = SUGGESTION_WRITE_DEADLINE_MS,
): Promise<void> {
  const suggestionFetch = createPublicSuggestionFetch(fetchImpl);
  await beforeDeadline(async (signal) => {
    const response = await suggestionFetch(PUBLIC_SUGGESTION_FORM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildPublicSuggestionFormBody(suggestion),
      redirect: "manual",
      signal,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error("The suggestion delivery could not be confirmed.");
    }
    // HTTP acceptance is not proof that this exact idea reached the Sheet.
    // Never follow a redirect or automatically retry a potentially sent write.
  }, timeoutMs);
}

async function beforeDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The suggestion request timed out."));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([operation(controller.signal), interrupted]);
    if (Date.now() >= deadline) throw new Error("The suggestion request timed out.");
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

/** Read-only injected seam: one allowlisted fetch, including a bounded body read. */
export async function loadPublicSuggestions(fetchImpl?: typeof fetch, timeoutMs = SUGGESTION_READ_DEADLINE_MS): Promise<PublicSuggestion[]> {
  const suggestionFetch = createPublicSuggestionFetch(fetchImpl);
  return beforeDeadline(async (signal) => {
    const response = await suggestionFetch(PUBLIC_SUGGESTION_SHEET_CSV_URL, {
      cache: "no-store", redirect: "manual", signal,
    });
    if (!response.ok) throw new Error("The suggestion board is unavailable.");
    const length = response.headers.get("content-length");
    if (length && Number(length) > MAX_FEED_BYTES) throw new Error("The suggestion board could not be verified.");
    return parsePublicSuggestionCsv(await readBoundedFeedBody(response, signal));
  }, timeoutMs);
}

async function readBoundedFeedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error("The suggestion board could not be verified.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  let text = "";
  try {
    if (signal.aborted) throw new Error("The suggestion request timed out.");
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_FEED_BYTES) throw new Error("The suggestion board could not be verified.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

/** Five positional Form columns; unknown question wording is deliberately not guessed. */
export function parsePublicSuggestionCsv(input: string): PublicSuggestion[] {
  const invalid = () => new Error("The suggestion board could not be verified.");
  if (!input.trim() || new TextEncoder().encode(input).length > MAX_FEED_BYTES) throw invalid();
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  let started = false;
  const csv = input.replace(/^\uFEFF/, "");
  const finishCell = () => {
    row.push(cell); cell = ""; closedQuote = false; started = false;
    if (row.length > 5) throw invalid();
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_FEED_ROWS + 1) throw invalid();
  };
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += character;
    } else if (character === ",") finishCell();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      finishRow();
    } else if (character === '"') {
      if (started || closedQuote) throw invalid();
      quoted = true; started = true;
    } else {
      if (closedQuote) throw invalid();
      cell += character; started = true;
    }
  }
  if (quoted) throw invalid();
  if (cell || row.length || started || closedQuote) finishRow();
  const header = rows.shift();
  if (!header || header.length !== 5 || header[0].trim().toLowerCase() !== "timestamp"
    || header.slice(1).some((value) => !value.trim() || value.length > 300)) throw invalid();

  return rows.map((values, index) => {
    if (values.length !== 5) throw invalid();
    const [submittedAt, title, artist, author, rawNotes] = values.map((value) => value.trim());
    const isOriginal = /^\[ORIGINAL\](?:\s|$)/i.test(rawNotes);
    const notes = isOriginal ? rawNotes.replace(/^\[ORIGINAL\]\s*/i, "") : rawNotes;
    const addedBy = author || "Anonymous";
    if (!submittedAt || submittedAt.length > 100 || !title || title.length > 140
      || artist.length > 140 || addedBy.length > 100 || notes.length > 500) throw invalid();
    return { id: `${submittedAt}-${index}`, submittedAt, title, artist, addedBy, notes, isOriginal };
  }).reverse();
}
