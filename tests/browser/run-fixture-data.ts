import type { ShowSong } from "../../lib/show-data";
import type { ShowSetDefinition } from "../../lib/show-read-integrity";

export const RUN_SHOW_ID = "run-fixture-show";
export const RUN_SHOW_SLUG = "run-fixture-night";
export const RUN_UPDATED_AT = "2026-09-05T13:00:00.000Z";
export const RUN_SETS: ShowSetDefinition[] = [
  { slug: "rad-dad", title: "Rad Dad fixture set", time: "9:00 PM", kicker: "Offline fixture", accent: "lime" },
];

export function runSong(id: number, title: string, position: number): ShowSong {
  return {
    id, showId: RUN_SHOW_ID, setSlug: "rad-dad", position, title,
    artist: "Fixture band", transition: false, isOriginal: true, durationSeconds: 180,
    performanceNote: "Fixture cue", songKey: "D", tuning: "Standard",
    youtubeUrl: "", youtubeVideoId: "", chordsUrl: "", lyricsUrl: "", rehearsalNotes: "",
    updatedAt: RUN_UPDATED_AT,
  };
}

export const RUN_SONGS: ShowSong[] = [
  runSong(101, "Fixture opening", 1),
  runSong(102, "Fixture anchor", 2),
  runSong(103, "Fixture closer", 3),
];

export function runPayload(songs: ShowSong[] = RUN_SONGS) {
  return {
    show: { id: RUN_SHOW_ID, slug: RUN_SHOW_SLUG },
    songs, sets: RUN_SETS, dataSource: "database", updatedAt: RUN_UPDATED_AT,
  };
}
