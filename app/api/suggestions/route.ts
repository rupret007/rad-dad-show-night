import {
  PUBLIC_SUGGESTION_FORM_URL,
  PUBLIC_SUGGESTION_SHEET_CSV_URL,
  buildPublicSuggestionFormBody,
  createPublicSuggestionFetch,
  sanitizePublicSuggestion,
} from "../../../lib/public-suggestion";

export const dynamic = "force-dynamic";

const suggestionFetch = createPublicSuggestionFetch();

type Suggestion = {
  id: string;
  title: string;
  artist: string;
  addedBy: string;
  notes: string;
  isOriginal: boolean;
  submittedAt: string;
};

export async function GET() {
  try {
    return Response.json(
      { suggestions: await loadSuggestions() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ suggestions: [] });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const isolated = sanitizePublicSuggestion(payload);
    if (isolated.kind === "honeypot") return Response.json({ ok: true });

    const { title, artist, addedBy, notes, isOriginal } = isolated.suggestion;
    if (!title || !addedBy) {
      return Response.json(
        { error: "Song title and your name are required." },
        { status: 400 },
      );
    }

    try {
      const current = await loadSuggestions();
      const duplicate = current.some(
        (song) =>
          song.title.toLowerCase() === title.toLowerCase() &&
          song.artist.toLowerCase() === artist.toLowerCase(),
      );
      if (duplicate) {
        return Response.json(
          { error: "That song is already on the suggestion board." },
          { status: 409 },
        );
      }
    } catch {
      // A temporary feed problem should not block a new suggestion.
    }

    const response = await suggestionFetch(PUBLIC_SUGGESTION_FORM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildPublicSuggestionFormBody({
        title,
        artist,
        addedBy,
        notes,
        isOriginal,
      }),
      redirect: "manual",
    });
    if (response.status >= 400) {
      throw new Error("The suggestion form did not accept the song.");
    }

    const suggestion: Suggestion = {
      id: `${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title,
      artist,
      addedBy,
      notes,
      isOriginal,
      submittedAt: new Date().toISOString(),
    };
    return Response.json({ suggestion }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not add that suggestion right now.",
      },
      { status: 500 },
    );
  }
}

async function loadSuggestions(): Promise<Suggestion[]> {
  const response = await suggestionFetch(PUBLIC_SUGGESTION_SHEET_CSV_URL, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Suggestion feed unavailable.");
  const rows = parseCsv(await response.text());
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const rawNotes = row[4]?.trim() ?? "";
      const isOriginal = /^\[ORIGINAL\](?:\s|$)/i.test(rawNotes);
      return {
        id: `${row[0] || "suggestion"}-${index}`,
        submittedAt: row[0] ?? "",
        title: row[1]?.trim() ?? "",
        artist: row[2]?.trim() ?? "",
        addedBy: row[3]?.trim() ?? "Anonymous",
        notes: isOriginal
          ? rawNotes.replace(/^\[ORIGINAL\]\s*/i, "")
          : rawNotes,
        isOriginal,
      };
    })
    .filter((song) => song.title)
    .reverse();
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
