import { env } from "cloudflare:workers";
import { getAdminUser } from "../../../lib/admin-access";
import { shouldCopyCloneSongs } from "../../../lib/show-public";
import { ensureShowSeeded, getManagedShows } from "../../../lib/show-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }
  try {
    return Response.json({ shows: await getManagedShows() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load shows." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  try {
    await ensureShowSeeded();
    const payload = (await request.json()) as {
      action?: string;
      sourceSlug?: string;
      showSlug?: string;
      title?: string;
      venue?: string;
      showDate?: string;
      status?: string;
      copySongs?: boolean | string | number;
    };

    if (payload.action === "clone") {
      const source = await env.DB
        .prepare("SELECT * FROM shows WHERE slug = ? LIMIT 1")
        .bind(payload.sourceSlug)
        .first<Record<string, string | number>>();
      if (!source) {
        return Response.json({ error: "Source show not found." }, { status: 404 });
      }

      const title = clean(payload.title, 140) || String(source.title);
      const venue = clean(payload.venue, 140) || String(source.venue);
      const showDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.showDate ?? "")
        ? payload.showDate!
        : "";
      if (!showDate) {
        return Response.json({ error: "Choose a show date." }, { status: 400 });
      }

      const slug = await uniqueSlug(`${venue}-${showDate}`);
      const id = `show-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const copySongs = shouldCopyCloneSongs(payload.copySongs);
      const statements = [
        env.DB.prepare(
          `INSERT INTO shows (
            id, slug, title, venue, show_date, start_time, end_time, status,
            expected_wrap, is_default, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?)`,
        ).bind(
          id,
          slug,
          title,
          venue,
          showDate,
          source.start_time,
          source.end_time,
          source.expected_wrap,
          now,
          now,
        ),
      ];
      if (copySongs) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO show_blocks (
              show_id, position, start_time, end_time, duration, title, note,
              type, accent, set_slug
            ) SELECT ?, position, start_time, end_time, duration, title, note,
              type, accent, set_slug FROM show_blocks WHERE show_id = ?`,
          ).bind(id, source.id),
          env.DB.prepare(
            `INSERT INTO songs (
              show_id, set_slug, position, title, artist, transition, is_original,
              duration_seconds, performance_note, song_key, tuning, youtube_url,
              youtube_video_id, chords_url, lyrics_url, rehearsal_notes,
              updated_by, created_at, updated_at
            ) SELECT ?, set_slug, position, title, artist, transition, is_original,
              duration_seconds, performance_note, song_key, tuning, youtube_url,
              youtube_video_id, chords_url, lyrics_url, rehearsal_notes, ?, ?, ?
            FROM songs WHERE show_id = ?`,
          ).bind(id, user.email, now, now, source.id),
        );
      }
      await env.DB.batch(statements);
      const created = (await getManagedShows()).find((show) => show.slug === slug);
      return Response.json({ show: created }, { status: 201 });
    }

    if (payload.action === "status") {
      const status = payload.status;
      if (!status || !["draft", "published", "archived"].includes(status)) {
        return Response.json({ error: "Unknown show status." }, { status: 400 });
      }
      if (!payload.showSlug?.trim()) {
        return Response.json({ error: "Choose a show." }, { status: 400 });
      }
      const existing = await env.DB
        .prepare("SELECT slug FROM shows WHERE slug = ? LIMIT 1")
        .bind(payload.showSlug)
        .first();
      if (!existing) {
        return Response.json({ error: "Show not found." }, { status: 404 });
      }
      await env.DB
        .prepare("UPDATE shows SET status = ?, updated_at = ? WHERE slug = ?")
        .bind(status, new Date().toISOString(), payload.showSlug)
        .run();
      const updated = (await getManagedShows()).find(
        (show) => show.slug === payload.showSlug,
      );
      return Response.json({ show: updated });
    }

    return Response.json({ error: "Unknown show action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update shows." },
      { status: 500 },
    );
  }
}

async function uniqueSlug(value: string): Promise<string> {
  const base = slugify(value) || `show-${Date.now()}`;
  let candidate = base;
  let suffix = 2;
  while (
    await env.DB.prepare("SELECT id FROM shows WHERE slug = ? LIMIT 1")
      .bind(candidate)
      .first()
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

