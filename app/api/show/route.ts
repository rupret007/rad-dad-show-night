import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../lib/admin-access";
import {
  EDITABLE_SET_SLUGS,
  type SetSlug,
  type ShowSong,
} from "../../../lib/show-data";
import {
  ensureShowSeeded,
  getShowPayload,
  getShowRecord,
  OFFICIAL_SONG_COLUMNS,
  readOfficialSongRows,
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
  INITIAL_OFFICIAL_SET_VERSION,
  readReviewedVersion,
} from "../../../lib/owner-set-save";
import { normalizeOfficialSongContent } from "../../../lib/song-resources";

export const dynamic = "force-dynamic";

type StoredSongIdentity = { id: number; created_at: string; updated_at: string };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const slug = query.get("show");
  const scope = query.get("scope") === "owner" ? "owner" : "public";
  const headers = { "Cache-Control": scope === "owner" ? "private, no-store" : "no-store", "X-Rad-Dad-Read-Scope": scope };
  if (scope === "owner" && !await getAdminUser()) {
    return Response.json({ error: "Owner access required." }, { status: 401, headers });
  }
  try {
    const payload = await getShowPayload(slug, scope);
    return Response.json(payload, {
      headers: {
        ...headers,
        "X-Rad-Dad-Data-Source": scope === "owner" ? "owner-database" : payload.dataSource,
      },
    });
  } catch (error) {
    if (isShowNotFoundError(error)) {
      return Response.json({ error: "Show not found." }, { status: 404, headers });
    }
    if (isShowDataUnavailableError(error)) {
      return Response.json(
        { error: "This show's verified set data is temporarily unavailable." },
        {
          status: 503,
          headers: { ...headers, "Retry-After": "30" },
        },
      );
    }
    return Response.json({ error: "Could not load the show." }, { status: 500, headers });
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
      reviewedVersion?: unknown;
    };
    const reviewedBase = readReviewedBase(payload.reviewedBase);
    const reviewedVersion = readReviewedVersion(payload.reviewedVersion);
    if (!reviewedBase || !reviewedVersion) {
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
      const content = normalizeOfficialSongContent(song);
      if (!content.title) throw new Error(`Song ${index + 1} needs a title.`);
      return {
        ...content,
        id: retainedId,
        createdAt: retainedId === null ? null : createdAtById.get(retainedId)!,
        position: index + 1,
      };
    });

    const now = new Date().toISOString();
    const writeVersion = crypto.randomUUID();
    // Claim the exact reviewed version AND rows inside the replacement batch.
    // The read above gives useful early feedback, but grants no write authority.
    const rowGuard = `(SELECT COUNT(*) FROM songs WHERE show_id = ? AND set_slug = ?) = ?
      AND NOT EXISTS (
        SELECT 1 FROM songs WHERE show_id = ? AND set_slug = ?
        AND NOT EXISTS (SELECT 1 FROM json_each(?) AS expected
          WHERE songs.id = json_extract(expected.value, '$.id')
          AND songs.updated_at = json_extract(expected.value, '$.updated_at'))
      )`;
    const rowGuardValues = [show.id, setSlug, existing.results.length, show.id, setSlug,
      JSON.stringify(existing.results.map((row: StoredSongIdentity) => ({ id: row.id, updated_at: row.updated_at })))];
    const wonGuard = "EXISTS (SELECT 1 FROM official_set_revisions WHERE show_id = ? AND set_slug = ? AND version = ?)";
    const wonValues = [show.id, setSlug, writeVersion];
    const claim = reviewedVersion === INITIAL_OFFICIAL_SET_VERSION
      ? env.DB.prepare(`INSERT INTO official_set_revisions (show_id, set_slug, version)
          SELECT ?, ?, ? WHERE NOT EXISTS (
            SELECT 1 FROM official_set_revisions WHERE show_id = ? AND set_slug = ?
          ) AND ${rowGuard} ON CONFLICT (show_id, set_slug) DO NOTHING`)
          .bind(show.id, setSlug, writeVersion, show.id, setSlug, ...rowGuardValues)
      : env.DB.prepare(`UPDATE official_set_revisions SET version = ?
          WHERE show_id = ? AND set_slug = ? AND version = ? AND ${rowGuard}`)
          .bind(writeVersion, show.id, setSlug, reviewedVersion, ...rowGuardValues);
    const statements = [
      claim,
      env.DB.prepare(
        `DELETE FROM songs WHERE show_id = ? AND set_slug = ? AND ${wonGuard}`,
      ).bind(show.id, setSlug, ...wonValues),
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
          ) SELECT ${song.id === null ? "" : "?,"} ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${wonGuard}`,
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
          ...wonValues,
        ),
      );
    }
    // D1 returns this transaction's read snapshot, never a later writer's rows.
    statements.push(
      env.DB.prepare("SELECT version FROM official_set_revisions WHERE show_id = ? AND set_slug = ?").bind(show.id, setSlug),
      env.DB.prepare(`SELECT ${OFFICIAL_SONG_COLUMNS} FROM songs WHERE show_id = ? AND set_slug = ? ORDER BY position, id`).bind(show.id, setSlug),
    );
    const result = await env.DB.batch(statements);
    if (!Array.isArray(result) || result.length !== statements.length || result.some((part: { success?: boolean }) => part.success !== true)) {
      throw new Error("The save could not be confirmed. Check the saved list before trying again.");
    }
    if (result[0].meta?.changes === 0) {
      return Response.json({ error: "This set changed since you last loaded it. Check the saved list before writing this draft over it." }, { status: 409 });
    }
    if (result[0].meta?.changes !== 1) {
      throw new Error("The save could not be confirmed. Check the saved list before trying again.");
    }
    try {
      const versions = result[result.length - 2].results;
      if (!Array.isArray(versions) || versions.length !== 1 || versions[0].version !== writeVersion) {
        throw new Error("The written version could not be verified.");
      }
      const saved = readOfficialSongRows(result[result.length - 1].results, show.id, setSlug);
      const savedBase = officialSetRevision(saved);
      if (!savedBase || saved.length !== normalized.length) {
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
        reviewedVersion: writeVersion,
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
