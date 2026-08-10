import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const songs = sqliteTable(
  "songs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    index("idx_songs_set_position").on(table.setSlug, table.position),
  ],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
