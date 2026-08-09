const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1wnw2qENE9v1LVroC-V3sZLyOr1-JKRrHTzr2L2k35kM/gviz/tq?tqx=out:csv&sheet=Form%20Responses%201";
const FORM_RESPONSE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/formResponse";

export const dynamic = "force-dynamic";

type Suggestion = {
  id: string;
  title: string;
  artist: string;
  addedBy: string;
  notes: string;
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
    const payload = (await request.json()) as {
      title?: string;
      artist?: string;
      addedBy?: string;
      notes?: string;
      website?: string;
    };
    if (payload.website) return Response.json({ ok: true });

    const title = clean(payload.title, 140);
    const artist = clean(payload.artist, 140);
    const addedBy = clean(payload.addedBy, 100);
    const notes = clean(payload.notes, 500);
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

    const formBody = new URLSearchParams({
      "entry.988161673": title,
      "entry.515724080": artist,
      "entry.1834262230": addedBy,
      "entry.286610891": notes,
    });
    const response = await fetch(FORM_RESPONSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
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
  const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Suggestion feed unavailable.");
  const rows = parseCsv(await response.text());
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => ({
      id: `${row[0] || "suggestion"}-${index}`,
      submittedAt: row[0] ?? "",
      title: row[1]?.trim() ?? "",
      artist: row[2]?.trim() ?? "",
      addedBy: row[3]?.trim() ?? "Anonymous",
      notes: row[4]?.trim() ?? "",
    }))
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

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

