ALTER TABLE `songs` ADD `is_original` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `songs`
SET `is_original` = true
WHERE (`set_slug` = 'jeff-story-friends' AND `title` = 'The Drinking Song')
   OR `set_slug` = 'stalemate'
   OR (`set_slug` = 'rad-dad' AND `title` = 'The Way I Love You');

