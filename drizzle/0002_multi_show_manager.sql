CREATE TABLE `shows` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`venue` text NOT NULL,
	`show_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`expected_wrap` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shows_slug` ON `shows` (`slug`);
--> statement-breakpoint
CREATE TABLE `show_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` text NOT NULL,
	`position` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`duration` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`accent` text DEFAULT 'blue' NOT NULL,
	`set_slug` text
);
--> statement-breakpoint
CREATE INDEX `idx_show_blocks_show_position` ON `show_blocks` (`show_id`,`position`);
--> statement-breakpoint
ALTER TABLE `songs` ADD `show_id` text DEFAULT 'show-guitars-growlers-2026-09-19' NOT NULL;
--> statement-breakpoint
ALTER TABLE `songs` ADD `duration_seconds` integer DEFAULT 180 NOT NULL;
--> statement-breakpoint
DROP INDEX `idx_songs_set_position`;
--> statement-breakpoint
CREATE INDEX `idx_songs_show_set_position` ON `songs` (`show_id`,`set_slug`,`position`);
--> statement-breakpoint
INSERT OR IGNORE INTO `shows` (
	`id`, `slug`, `title`, `venue`, `show_date`, `start_time`, `end_time`,
	`status`, `expected_wrap`, `is_default`
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
	true
);
--> statement-breakpoint
INSERT INTO `show_blocks` (
	`show_id`, `position`, `start_time`, `end_time`, `duration`, `title`,
	`note`, `type`, `accent`, `set_slug`
) VALUES
	('show-guitars-growlers-2026-09-19', 1, '7:00', '7:35', '35 min', 'Jeff Story & Friends', 'Opening set', 'performance', 'blue', 'jeff-story-friends'),
	('show-guitars-growlers-2026-09-19', 2, '7:35', '7:45', '10 min', 'Mason / The Fault Lines setup', 'Dedicated setup window', 'changeover', 'blue', NULL),
	('show-guitars-growlers-2026-09-19', 3, '7:45', '8:25', '40 min', 'Mason / The Fault Lines', 'Featured set', 'performance', 'lime', NULL),
	('show-guitars-growlers-2026-09-19', 4, '8:25', '8:35', '10 min', 'Stalemate setup', 'Stage reset', 'changeover', 'pink', NULL),
	('show-guitars-growlers-2026-09-19', 5, '8:35', '8:55', '20 min', 'Stalemate', 'Original set', 'performance', 'pink', 'stalemate'),
	('show-guitars-growlers-2026-09-19', 6, '8:55', '9:00', '5 min', 'Rad Dad quick change', 'Keep the stage moving', 'changeover', 'lime', NULL),
	('show-guitars-growlers-2026-09-19', 7, '9:00', '10:00', '60 min', 'Rad Dad', 'Punk-rock closer', 'performance', 'lime', 'rad-dad');

