import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const shows = sqliteTable(
  "shows",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    venue: text("venue").notNull(),
    showDate: text("show_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    status: text("status").notNull().default("draft"),
    expectedWrap: text("expected_wrap").notNull().default(""),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_shows_slug").on(table.slug)],
);

export const showBlocks = sqliteTable(
  "show_blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: text("show_id").notNull(),
    position: integer("position").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    duration: text("duration").notNull(),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    type: text("type").notNull(),
    accent: text("accent").notNull().default("blue"),
    setSlug: text("set_slug"),
  },
  (table) => [
    index("idx_show_blocks_show_position").on(table.showId, table.position),
  ],
);

export const songs = sqliteTable(
  "songs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: text("show_id")
      .notNull()
      .default("show-guitars-growlers-2026-09-19"),
    setSlug: text("set_slug").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    transition: integer("transition", { mode: "boolean" })
      .notNull()
      .default(false),
    isOriginal: integer("is_original", { mode: "boolean" })
      .notNull()
      .default(false),
    durationSeconds: integer("duration_seconds").notNull().default(180),
    performanceNote: text("performance_note").notNull().default(""),
    songKey: text("song_key").notNull().default(""),
    tuning: text("tuning").notNull().default(""),
    youtubeUrl: text("youtube_url").notNull().default(""),
    youtubeVideoId: text("youtube_video_id").notNull().default(""),
    chordsUrl: text("chords_url").notNull().default(""),
    lyricsUrl: text("lyrics_url").notNull().default(""),
    rehearsalNotes: text("rehearsal_notes").notNull().default(""),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_songs_show_set_position").on(
      table.showId,
      table.setSlug,
      table.position,
    ),
  ],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
