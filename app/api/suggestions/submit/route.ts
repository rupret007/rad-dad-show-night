import {
  PUBLIC_SUGGESTION_FORM_URL,
  PUBLIC_SUGGESTION_SHEET_CSV_URL,
  createPublicSuggestionFetch,
  sanitizePublicSuggestion,
} from "../../../../lib/public-suggestion";

const suggestionFetch = createPublicSuggestionFetch();
const recentAttempts = new Map<string, number>();
const RATE_LIMIT_MS = 8000;

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function alreadySuggested(song: string, artist: string) {
  try {
    const response = await suggestionFetch(PUBLIC_SUGGESTION_SHEET_CSV_URL, {
      cache: "no-store",
    });
    if (!response.ok) return false;

    const rows = parseCsv(await response.text());
    const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, "").trim()) ?? [];
    const songIndex = headers.indexOf("Song title");
    const artistIndex = headers.indexOf("Artist");
    if (songIndex < 0 || artistIndex < 0) return false;

    const targetSong = normalize(song);
    const targetArtist = normalize(artist);

    return rows.slice(1).some(
      (row) =>
        normalize(row[songIndex] ?? "") === targetSong &&
        normalize(row[artistIndex] ?? "") === targetArtist,
    );
  } catch {
    return false;
  }
}

function getClientId(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "That submission could not be read." }, { status: 400 });
  }

  const isolated = sanitizePublicSuggestion(body);
  if (isolated.kind === "honeypot") {
    return Response.json({ ok: true });
  }

  const song = isolated.suggestion.title.slice(0, 120);
  const artist = isolated.suggestion.artist.slice(0, 120);
  const addedBy = isolated.suggestion.addedBy.slice(0, 80);
  const notes = isolated.suggestion.notes.slice(0, 400);

  if (song.length < 2 || artist.length < 2 || addedBy.length < 2) {
    return Response.json(
      { error: "Add the song, artist, and your name before sending." },
      { status: 400 },
    );
  }

  const clientId = getClientId(request);
  const now = Date.now();
  if (clientId) {
    const lastAttempt = recentAttempts.get(clientId) ?? 0;
    if (now - lastAttempt < RATE_LIMIT_MS) {
      return Response.json(
        { error: "Give it a few seconds before adding another song." },
        { status: 429 },
      );
    }
    recentAttempts.set(clientId, now);
  }

  if (await alreadySuggested(song, artist)) {
    return Response.json(
      { error: "That song and artist are already on the board.", duplicate: true },
      { status: 409 },
    );
  }

  const form = new URLSearchParams({
    "entry.988161673": song,
    "entry.515724080": artist,
    "entry.1834262230": addedBy,
    "entry.286610891": notes,
    submit: "Submit",
  });

  try {
    const response = await suggestionFetch(PUBLIC_SUGGESTION_FORM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form.toString(),
      redirect: "follow",
    });

    if (!response.ok) throw new Error("Google Form rejected the submission");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "The board could not accept that song just now. Please try again." },
      { status: 502 },
    );
  }
}
