import {
  loadPublicSuggestions,
  sanitizePublicSuggestion,
  writeSanitizedSuggestionToForm,
} from "../../../lib/public-suggestion";
import { sameSuggestionSong } from "../../../lib/suggestion-board";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json({ suggestions: await loadPublicSuggestions() }, { headers: noStore });
  } catch {
    return Response.json({
      error: "The suggestion board is unavailable. Try checking it again shortly.",
      delivery: "not-sent",
    }, { status: 503, headers: { ...noStore, "Retry-After": "5" } });
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    payload = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Provide a valid song suggestion.", delivery: "not-sent" }, { status: 400, headers: noStore });
  }

  const isolated = sanitizePublicSuggestion(payload);
  if (isolated.kind === "honeypot") return Response.json({ ok: true }, { headers: noStore });
  const submission = isolated.suggestion;
  if (!submission.title || !submission.addedBy) {
    return Response.json({ error: "Song title and your name are required.", delivery: "not-sent" }, { status: 400, headers: noStore });
  }
  if (!submission.isOriginal && /^\[ORIGINAL\](?:\s|$)/i.test(submission.notes)) {
    return Response.json({
      error: "Mark the original/unreleased checkbox, or remove the leading [ORIGINAL] marker from your notes. Nothing was sent.",
      delivery: "not-sent",
    }, { status: 400, headers: noStore });
  }

  try {
    const current = await loadPublicSuggestions();
    const existing = current.find((song) => sameSuggestionSong(song, submission));
    if (existing) {
      return Response.json({
        error: "That song is already on the suggestion board. No new suggestion was sent.",
        existing, delivery: "already-present",
      }, { status: 409, headers: noStore });
    }
  } catch {
    return Response.json({
      error: "The board could not be checked for an existing idea. Nothing was sent; check the board and try again later.",
      delivery: "not-sent",
    }, { status: 503, headers: { ...noStore, "Retry-After": "5" } });
  }

  try {
    await writeSanitizedSuggestionToForm(submission);
    return Response.json({ delivery: "awaiting-board", submission }, { status: 202, headers: noStore });
  } catch {
    return Response.json({
      error: "Delivery is uncertain. Check the board before sending again or using the backup form; the earlier request may have arrived.",
      delivery: "unknown",
    }, { status: 502, headers: noStore });
  }
}
