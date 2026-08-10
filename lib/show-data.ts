export type SetSlug = "jeff-story-friends" | "stalemate" | "rad-dad";

export type ShowSong = {
  id: number | string;
  showId: string;
  setSlug: SetSlug;
  position: number;
  title: string;
  artist: string;
  transition: boolean;
  isOriginal: boolean;
  durationSeconds: number;
  performanceNote: string;
  songKey: string;
  tuning: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  chordsUrl: string;
  lyricsUrl: string;
  rehearsalNotes: string;
  updatedAt: string;
};

export const SHOW_DETAILS = {
  id: "show-guitars-growlers-2026-09-19",
  slug: "guitars-growlers-2026-09-19",
  title: "Rad Dad + Friends",
  showDate: "2026-09-19",
  date: "Saturday, September 19, 2026",
  startTime: "7:00 PM",
  endTime: "10:00 PM",
  hours: "7:00-10:00 PM",
  venue: "Guitars & Growlers",
  expectedWrap: "Expected wrap near 10:00 PM",
  status: "published",
} as const;

export type ManagedShow = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  showDate: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: string;
  expectedWrap: string;
  status: "draft" | "published" | "archived";
  isDefault: boolean;
};

export type RunOfShowBlock = (typeof RUN_OF_SHOW)[number];

export const RUN_OF_SHOW = [
  {
    time: "7:00-7:35",
    duration: "35 min",
    title: "Jeff Story & Friends",
    note: "Opening set",
    type: "performance",
    accent: "blue",
  },
  {
    time: "7:35-7:45",
    duration: "10 min",
    title: "Mason / The Fault Lines setup",
    note: "Dedicated setup window",
    type: "changeover",
    accent: "blue",
  },
  {
    time: "7:45-8:25",
    duration: "40 min",
    title: "Mason / The Fault Lines",
    note: "Featured set",
    type: "performance",
    accent: "lime",
  },
  {
    time: "8:25-8:35",
    duration: "10 min",
    title: "Stalemate setup",
    note: "Stage reset",
    type: "changeover",
    accent: "pink",
  },
  {
    time: "8:35-8:55",
    duration: "20 min",
    title: "Stalemate",
    note: "Original set",
    type: "performance",
    accent: "pink",
  },
  {
    time: "8:55-9:00",
    duration: "5 min",
    title: "Rad Dad quick change",
    note: "Keep the stage moving",
    type: "changeover",
    accent: "lime",
  },
  {
    time: "9:00-10:00",
    duration: "60 min",
    title: "Rad Dad",
    note: "Punk-rock closer",
    type: "performance",
    accent: "lime",
  },
] as const;

export const SET_DEFINITIONS = [
  {
    slug: "jeff-story-friends" as const,
    title: "Jeff Story & Friends",
    time: "7:00-7:35 PM",
    kicker: "Opening set",
    accent: "blue",
  },
  {
    slug: "stalemate" as const,
    title: "Stalemate",
    time: "8:35-8:55 PM",
    kicker: "Original set",
    accent: "pink",
  },
  {
    slug: "rad-dad" as const,
    title: "Rad Dad",
    time: "9:00-10:00 PM",
    kicker: "Closing set",
    accent: "lime",
  },
] as const;

export const EDITABLE_SET_SLUGS = SET_DEFINITIONS.map((set) => set.slug);

const seededAt = "2026-08-09T00:00:00.000Z";

function makeSong(
  id: number,
  setSlug: SetSlug,
  position: number,
  title: string,
  artist = "",
  options: Partial<ShowSong> = {},
): ShowSong {
  return {
    id,
    showId: SHOW_DETAILS.id,
    setSlug,
    position,
    title,
    artist,
    transition: false,
    isOriginal: false,
    durationSeconds: 180,
    performanceNote: "",
    songKey: "",
    tuning: "",
    youtubeUrl: "",
    youtubeVideoId: "",
    chordsUrl: "",
    lyricsUrl: "",
    rehearsalNotes: "",
    updatedAt: seededAt,
    ...options,
  };
}

export const DEFAULT_SONGS: ShowSong[] = [
  makeSong(1001, "jeff-story-friends", 1, "Badfish", "Sublime"),
  makeSong(1002, "jeff-story-friends", 2, "Nutshell", "Alice in Chains"),
  makeSong(1003, "jeff-story-friends", 3, "The Drinking Song", "", {
    isOriginal: true,
  }),
  makeSong(1004, "jeff-story-friends", 4, "Heart-Shaped Box", "Nirvana", {
    performanceNote: "Travis Story - guitar",
  }),
  makeSong(1005, "jeff-story-friends", 5, "Creep", "Radiohead", {
    performanceNote: "Carly - vocals / Travis Worsham - guitar",
  }),
  makeSong(1006, "jeff-story-friends", 6, "Just a Girl", "No Doubt", {
    performanceNote: "Zella - vocals / Kelly - guitar",
  }),
  makeSong(1007, "jeff-story-friends", 7, "Misery Business", "Paramore", {
    performanceNote: "Zella - vocals",
  }),

  makeSong(1101, "stalemate", 1, "Turn Over the Flag", "Stalemate", {
    isOriginal: true,
  }),
  makeSong(1102, "stalemate", 2, "TBFH", "Stalemate", {
    isOriginal: true,
  }),
  makeSong(1103, "stalemate", 3, "Manic", "Stalemate", {
    isOriginal: true,
  }),
  makeSong(1104, "stalemate", 4, "Be With You", "Stalemate", {
    isOriginal: true,
  }),
  makeSong(1105, "stalemate", 5, "Better Than Now", "Stalemate", {
    isOriginal: true,
  }),
  makeSong(1106, "stalemate", 6, "Take the Step", "Stalemate", {
    isOriginal: true,
  }),

  makeSong(1201, "rad-dad", 1, "Basket Case", "Green Day"),
  makeSong(1202, "rad-dad", 2, "The Rock Show", "blink-182"),
  makeSong(1203, "rad-dad", 3, "Ruby Soho", "Rancid"),
  makeSong(1204, "rad-dad", 4, "When I Come Around", "Green Day"),
  makeSong(1205, "rad-dad", 5, "Stand By Me", "Pennywise"),
  makeSong(1206, "rad-dad", 6, "Miles Away", "Goldfinger"),
  makeSong(1207, "rad-dad", 7, "First Date", "blink-182", {
    transition: true,
  }),
  makeSong(1208, "rad-dad", 8, "Chick Magnet", "MxPx"),
  makeSong(1209, "rad-dad", 9, "Blind", "Face to Face"),
  makeSong(1210, "rad-dad", 10, "The Way I Love You", "Paco Estrada", {
    transition: true,
    isOriginal: true,
  }),
  makeSong(1211, "rad-dad", 11, "The Story Of Us", "Taylor Swift / Rad Dad"),
  makeSong(1212, "rad-dad", 12, "The Middle", "Jimmy Eat World"),
  makeSong(
    1213,
    "rad-dad",
    13,
    "On The Road Again",
    "Me First and the Gimme Gimmes",
  ),
  makeSong(1214, "rad-dad", 14, "Breed", "Nirvana"),
  makeSong(
    1215,
    "rad-dad",
    15,
    "Country Roads",
    "Me First and the Gimme Gimmes",
  ),
  makeSong(1216, "rad-dad", 16, "Tomorrow's Another Day", "MxPx"),
  makeSong(1217, "rad-dad", 17, "Linoleum", "NOFX"),
  makeSong(1218, "rad-dad", 18, "All The Small Things", "blink-182"),
  makeSong(1219, "rad-dad", 19, "She", "Green Day"),
];
