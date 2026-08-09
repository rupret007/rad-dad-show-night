const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1wnw2qENE9v1LVroC-V3sZLyOr1-JKRrHTzr2L2k35kM/gviz/tq?tqx=out:csv&sheet=Form%20Responses%201";

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const response = await fetch(CSV_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Suggestion sheet unavailable");

    const rows = parseCsv(await response.text());
    const headers = rows[0]?.map((header) => header.replace(/^\uFEFF/, "").trim()) ?? [];
    const column = (label: string) => headers.indexOf(label);

    const timestampIndex = column("Timestamp");
    const songIndex = column("Song title");
    const artistIndex = column("Artist");
    const addedByIndex = column("Added by");
    const notesIndex = column("Why this one? / notes");

    if (songIndex < 0 || addedByIndex < 0) {
      throw new Error("Suggestion sheet columns are not ready");
    }

    const suggestions = rows
      .slice(1)
      .map((row, index) => ({
        id: `${row[timestampIndex] ?? ""}-${row[songIndex] ?? ""}-${index}`,
        timestamp: row[timestampIndex] ?? "",
        song: row[songIndex]?.trim() ?? "",
        artist: row[artistIndex]?.trim() ?? "",
        addedBy: row[addedByIndex]?.trim() ?? "",
        notes: row[notesIndex]?.trim() ?? "",
      }))
      .filter((item) => item.song && item.addedBy)
      .reverse();

    return Response.json(
      { suggestions },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { suggestions: [], unavailable: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
