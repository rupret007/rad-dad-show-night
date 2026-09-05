import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../lib/admin-access";
import {
  EDITABLE_SET_SLUGS,
  type SetSlug,
  type ShowSong,
} from "../../../lib/show-data";
import {
  ensureShowSeeded,
  getOfficialSongs,
  getShowPayload,
  getShowRecord,
} from "../../../lib/show-store";
import { isShowDataUnavailableError } from "../../../lib/show-read-integrity";
import { isShowNotFoundError } from "../../../lib/show-visibility";
import {
  OfficialSetIdentityError,
  resolveOfficialSetSongIds,
} from "../../../lib/official-set-identity";
import {
  officialSetRevision,
  readReviewedBase,
} from "../../../lib/owner-set-save";
import {
  getYouTubeVideoId,
  hydrateOfficialSongMedia,
} from "../../../lib/song-resources";

export const dynamic = "force-dynamic";

type StoredSongIdentity = { id: number; created_at: string; updated_at: string };

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("show");
  const user = await getAdminUser();
  try {
    const payload = await getShowPayload(slug, user ? "owner" : "public");
    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Rad-Dad-Data-Source": payload.dataSource,
      },
    });
  } catch (error) {
    if (isShowNotFoundError(error)) {
      return Response.json({ error: "Show not found." }, { status: 404 });
    }
    if (isShowDataUnavailableError(error)) {
      return Response.json(
        { error: "This show's verified set data is temporarily unavailable." },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "30" },
        },
      );
    }
    return Response.json({ error: "Could not load the show." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as {
      showSlug?: string;
      setSlug?: string;
      songs?: Partial<ShowSong>[];
      reviewedBase?: unknown;
    };
    const reviewedBase = readReviewedBase(payload.reviewedBase);
    if (!reviewedBase) {
      return Response.json(
        { error: "Reload the official set before saving." },
        { status: 400 },
      );
    }
    if (!payload.showSlug?.trim()) {
      return Response.json({ error: "Choose a show." }, { status: 400 });
    }
    const setSlug = payload.setSlug as SetSlug;
    if (!EDITABLE_SET_SLUGS.includes(setSlug)) {
      return Response.json({ error: "Unknown set." }, { status: 400 });
    }
    if (!Array.isArray(payload.songs) || payload.songs.length > 60) {
      return Response.json(
        { error: "A set must contain between 0 and 60 songs." },
        { status: 400 },
      );
    }

    await ensureShowSeeded();
    const show = await getShowRecord(payload.showSlug, "owner");
    const existing = await env.DB.prepare(
      "SELECT id, created_at, updated_at FROM songs WHERE show_id = ? AND set_slug = ?",
    ).bind(show.id, setSlug).all<StoredSongIdentity>();
    if (
      existing.success === false || !Array.isArray(existing.results) ||
      existing.results.some((row: StoredSongIdentity) => !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.created_at !== "string" || !row.created_at || typeof row.updated_at !== "string" || !row.updated_at)
    ) {
      throw new Error("The official song identities could not be verified.");
    }
    const currentBase = officialSetRevision(existing.results);
    if (!currentBase) {
      throw new Error("The official set receipt could not be verified.");
    }
    if (currentBase !== reviewedBase) {
      return Response.json(
        {
          error: "This set changed since you last loaded it. Check the saved list before writing this draft over it.",
        },
        { status: 409 },
      );
    }
    const retainedIds = resolveOfficialSetSongIds(
      payload.songs, existing.results.map((row: StoredSongIdentity) => row.id), show.id, setSlug,
    );
    const createdAtById = new Map<number, string>(existing.results.map((row: StoredSongIdentity) => [row.id, row.created_at]));
    const normalized = payload.songs.map((song, index) => {
      const retainedId = retainedIds[index];
      const title = cleanText(song.title, 140);
      if (!title) throw new Error(`Song ${index + 1} needs a title.`);
      const youtubeUrl = cleanUrl(song.youtubeUrl);
      const youtubeVideoId =
        getYouTubeVideoId(youtubeUrl) || cleanText(song.youtubeVideoId, 20);
      return hydrateOfficialSongMedia({
        id: retainedId,
        createdAt: retainedId === null ? null : createdAtById.get(retainedId)!,
        position: index + 1,
        title,
        artist: cleanText(song.artist, 140),
        transition: Boolean(song.transition),
        isOriginal: Boolean(song.isOriginal),
        durationSeconds: clampNumber(song.durationSeconds, 30, 1200, 180),
        performanceNote: cleanText(song.performanceNote, 300),
        songKey: cleanText(song.songKey, 40),
        tuning: cleanText(song.tuning, 80),
        youtubeUrl:
          youtubeUrl ||
          (youtubeVideoId
            ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
            : ""),
        youtubeVideoId,
        chordsUrl: cleanUrl(song.chordsUrl),
        lyricsUrl: cleanUrl(song.lyricsUrl),
        rehearsalNotes: cleanText(song.rehearsalNotes, 2500),
      });
    });

    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        "DELETE FROM songs WHERE show_id = ? AND set_slug = ?",
      ).bind(show.id, setSlug),
    ];
    for (const song of normalized) {
      // Only an exact-show/set ID proved above may be reused. New rows omit id
      // entirely so SQLite AUTOINCREMENT remains their sole identity allocator.
      statements.push(
        env.DB.prepare(
          `INSERT INTO songs (
            ${song.id === null ? "" : "id,"}
            show_id, set_slug, position, title, artist, transition, is_original,
            duration_seconds, performance_note, song_key, tuning, youtube_url,
            youtube_video_id, chords_url, lyrics_url, rehearsal_notes,
            updated_by, created_at, updated_at
          ) VALUES (${song.id === null ? "" : "?,"} ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          ...(song.id === null ? [] : [song.id]),
          show.id,
          setSlug,
          song.position,
          song.title,
          song.artist,
          song.transition ? 1 : 0,
          song.isOriginal ? 1 : 0,
          song.durationSeconds,
          song.performanceNote,
          song.songKey,
          song.tuning,
          song.youtubeUrl,
          song.youtubeVideoId,
          song.chordsUrl,
          song.lyricsUrl,
          song.rehearsalNotes,
          user.email,
          song.createdAt ?? now,
          now,
        ),
      );
    }
    await env.DB.batch(statements);
    try {
      const officialSongs = await getOfficialSongs(show.id);
      const saved = officialSongs.filter((song) => song.setSlug === setSlug);
      const savedBase = officialSetRevision(saved);
      if (!savedBase) {
        return Response.json(
          {
            error: "The set was written, but the official list could not be verified. Check the saved list before saving again.",
            written: true,
          },
          { status: 202 },
        );
      }
      return Response.json({
        songs: saved,
        updatedAt: now,
        reviewedBase: savedBase,
      });
    } catch {
      return Response.json(
        {
          error: "The set was written, but the official list could not be verified. Check the saved list before saving again.",
          written: true,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    if (error instanceof OfficialSetIdentityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isShowNotFoundError(error)) {
      return Response.json({ error: "Show not found." }, { status: 404 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save the set." },
      { status: 500 },
    );
  }
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}
