CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS shows (
  id text PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  venue text NOT NULL,
  show_date text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  expected_wrap text DEFAULT '' NOT NULL,
  is_default integer DEFAULT false NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shows_slug ON shows (slug);
CREATE TABLE IF NOT EXISTS show_blocks (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  show_id text NOT NULL,
  position integer NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration text NOT NULL,
  title text NOT NULL,
  note text DEFAULT '' NOT NULL,
  type text NOT NULL,
  accent text DEFAULT 'blue' NOT NULL,
  set_slug text
);
CREATE TABLE IF NOT EXISTS songs (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  show_id text DEFAULT 'show-guitars-growlers-2026-09-19' NOT NULL,
  set_slug text NOT NULL,
  position integer NOT NULL,
  title text NOT NULL,
  artist text DEFAULT '' NOT NULL,
  transition integer DEFAULT 0 NOT NULL,
  is_original integer DEFAULT 0 NOT NULL,
  duration_seconds integer DEFAULT 180 NOT NULL,
  performance_note text DEFAULT '' NOT NULL,
  song_key text DEFAULT '' NOT NULL,
  tuning text DEFAULT '' NOT NULL,
  youtube_url text DEFAULT '' NOT NULL,
  youtube_video_id text DEFAULT '' NOT NULL,
  chords_url text DEFAULT '' NOT NULL,
  lyrics_url text DEFAULT '' NOT NULL,
  rehearsal_notes text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO shows (
  id, slug, title, venue, show_date, start_time, end_time, status,
  expected_wrap, is_default
) VALUES (
  'show-guitars-growlers-2026-09-19',
  'guitars-growlers-2026-09-19',
  'Rad Dad + Friends',
  'Guitars & Growlers',
  '2026-09-19',
  '7:00 PM',
  '10:00 PM',
  'published',
  'Expected wrap near 10:00 PM',
  1
);
INSERT OR IGNORE INTO shows (
  id, slug, title, venue, show_date, start_time, end_time, status,
  expected_wrap, is_default
) VALUES (
  'show-richardson-2026-10-31',
  'richardson-2026-10-31',
  'Richardson Halloween',
  'The Granada',
  '2026-10-31',
  '8:00 PM',
  '11:00 PM',
  'published',
  'Expected wrap near 11:00 PM',
  0
);
INSERT OR IGNORE INTO site_settings (key, value, updated_at)
VALUES ('leftover-honesty-empty-clone', 'published', '2026-09-03T13:10:00.000Z');
