import { getAdminUser } from "../../../lib/admin-access";
import { buildCoachCheck, parseCoachInput, parseCoachResult } from "../../../lib/set-coach";

export const dynamic = "force-dynamic";

function coachResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function providerBeforeDeadline<T>(request: Request, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const deadline = setTimeout(abort, 8_000);
  request.signal.addEventListener("abort", abort, { once: true });
  let rejectAborted: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => reject(new Error("Coach request interrupted"));
    controller.signal.addEventListener("abort", rejectAborted, { once: true });
  });
  try {
    if (request.signal.aborted) controller.abort();
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Coach request interrupted");
        return read(controller.signal);
      }),
      interrupted,
    ]);
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", abort);
    if (rejectAborted) controller.signal.removeEventListener("abort", rejectAborted);
  }
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return coachResponse({ error: "Owner access required." }, 401);

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return coachResponse({ error: "Choose a complete current draft before reviewing." }, 400); }
  const input = parseCoachInput(raw);
  if (!input) return coachResponse({ error: "Choose a complete current draft from one show and set before reviewing." }, 400);
  const base = buildCoachCheck(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return coachResponse(base);

  try {
    return await providerBeforeDeadline(request, async (signal) => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
          store: false,
          max_output_tokens: 500,
          instructions:
            "You are a concise live-band set coach. Review pacing, runtime, transitions, guest handoffs, and closing strength. Never rewrite the set or claim certainty. Give at most four practical observations in plain text. Do not quote lyrics. A null scheduledMinutes means this show has no verified set window: do not invent a window, spare minutes, overtime, or a timing score.",
          input: JSON.stringify({
            show: input.showTitle,
            set: input.setSlug,
            scheduledMinutes: base.scheduledMinutes,
            estimatedMinutes: base.estimatedMinutes,
            songs: input.songs.map((song) => ({
              position: song.position, title: song.title, artist: song.artist,
              original: song.isOriginal, transition: song.transition,
              durationSeconds: song.durationSeconds, cue: song.performanceNote,
            })),
          }),
        }),
      });
      if (!response.ok) return coachResponse(base);
      const data = (await response.json()) as {
        output_text?: string;
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      const aiNotes = data.output_text || data.output?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n") || "";
      const reviewed = aiNotes.trim() ? parseCoachResult({ ...base, source: "openai", aiNotes }, input.requestId) : null;
      return coachResponse(reviewed || base);
    });
  } catch {
    return coachResponse(base);
  }
}
