CREATE TABLE `official_set_revisions` (
  `show_id` text NOT NULL,
  `set_slug` text NOT NULL,
  `version` text NOT NULL,
  PRIMARY KEY (`show_id`, `set_slug`)
);
