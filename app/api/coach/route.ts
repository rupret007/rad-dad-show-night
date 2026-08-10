import { getAdminUser } from "../../../lib/admin-access";
import { SET_DEFINITIONS, type ShowSong } from "../../../lib/show-data";

export const dynamic = "force-dynamic";

type Finding = {
  tone: "good" | "watch" | "action";
  title: string;
  detail: string;
};

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    setSlug?: string;
    showTitle?: string;
    songs?: ShowSong[];
  };
  const songs = Array.isArray(payload.songs) ? payload.songs.slice(0, 60) : [];
  const set = SET_DEFINITIONS.find((item) => item.slug === payload.setSlug);
  if (!set || !songs.length) {
    return Response.json({ error: "Choose a set with songs first." }, { status: 400 });
  }

  const scheduledMinutes =
    set.slug === "rad-dad" ? 60 : set.slug === "stalemate" ? 20 : 35;
  const totalSeconds = songs.reduce(
    (total, song) => total + (song.durationSeconds || 180),
    0,
  );
  const estimatedMinutes = Math.round(totalSeconds / 60);
  const findings: Finding[] = [];
  const difference = scheduledMinutes - estimatedMinutes;

  findings.push({
    tone: Math.abs(difference) <= 5 ? "good" : "watch",
    title: `Estimated ${estimatedMinutes} minutes`,
    detail:
      difference >= 0
        ? `${difference} minutes of room remain in the ${scheduledMinutes}-minute window.`
        : `${Math.abs(difference)} minutes over the scheduled window before talking or delays.`,
  });

  const transitions = songs.filter((song) => song.transition).length;
  findings.push({
    tone: transitions ? "good" : "watch",
    title: `${transitions} planned transition${transitions === 1 ? "" : "s"}`,
    detail: transitions
      ? "Flow cues are clearly marked for the band."
      : "Consider whether one direct transition would strengthen the middle of the set.",
  });

  const guestSongs = songs.filter((song) => song.performanceNote.trim()).length;
  if (guestSongs) {
    findings.push({
      tone: guestSongs > 3 ? "watch" : "good",
      title: `${guestSongs} songs carry performance cues`,
      detail:
        guestSongs > 3
          ? "Confirm guest handoffs and endings early so the set does not lose momentum."
          : "The guest load looks manageable for this set.",
    });
  }

  const missingExactVideos = songs.filter(
    (song) => !song.isOriginal && !song.youtubeUrl,
  ).length;
  if (missingExactVideos) {
    findings.push({
      tone: "action",
      title: `${missingExactVideos} covers use YouTube search`,
      detail: "Paste exact rehearsal versions only where the band needs one specific arrangement.",
    });
  }

  const base = {
    source: "smart-check" as "smart-check" | "openai",
    score: Math.max(
      45,
      Math.min(98, 92 - Math.max(0, Math.abs(difference) - 4) * 3),
    ),
    estimatedMinutes,
    scheduledMinutes,
    findings: findings.slice(0, 4),
    aiNotes: "",
  };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json(base);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        store: false,
        max_output_tokens: 500,
        instructions:
          "You are a concise live-band set coach. Review pacing, runtime, transitions, guest handoffs, and closing strength. Never rewrite the set or claim certainty. Give at most four practical observations in plain text. Do not quote lyrics.",
        input: JSON.stringify({
          show: payload.showTitle,
          set: set.title,
          scheduledMinutes,
          estimatedMinutes,
          songs: songs.map((song) => ({
            position: song.position,
            title: song.title,
            artist: song.artist,
            original: song.isOriginal,
            transition: song.transition,
            durationSeconds: song.durationSeconds,
            cue: song.performanceNote,
          })),
        }),
      }),
    });
    if (!response.ok) return Response.json(base);
    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    const aiNotes =
      data.output_text ||
      data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text ?? "")
        .join("\n") ||
      "";
    return Response.json({ ...base, source: "openai", aiNotes });
  } catch {
    return Response.json(base);
  }
}

