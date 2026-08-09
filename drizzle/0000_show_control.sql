CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_slug` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`artist` text DEFAULT '' NOT NULL,
	`transition` integer DEFAULT false NOT NULL,
	`performance_note` text DEFAULT '' NOT NULL,
	`song_key` text DEFAULT '' NOT NULL,
	`tuning` text DEFAULT '' NOT NULL,
	`youtube_url` text DEFAULT '' NOT NULL,
	`youtube_video_id` text DEFAULT '' NOT NULL,
	`chords_url` text DEFAULT '' NOT NULL,
	`lyrics_url` text DEFAULT '' NOT NULL,
	`rehearsal_notes` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_songs_set_position` ON `songs` (`set_slug`,`position`);

