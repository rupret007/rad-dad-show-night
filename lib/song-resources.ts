import type { ShowSong } from "./show-data";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The owner write's existing normalization, shared with its receipt check. */
export function normalizeOfficialSongContent(song: Partial<ShowSong>) {
  const title = cleanOwnerText(song.title, 140);
  const youtubeUrl = cleanOwnerUrl(song.youtubeUrl);
  const youtubeVideoId = getYouTubeVideoId(youtubeUrl) || cleanOwnerText(song.youtubeVideoId, 20);
  return hydrateOfficialSongMedia({
    title,
    artist: cleanOwnerText(song.artist, 140),
    transition: Boolean(song.transition),
    isOriginal: Boolean(song.isOriginal),
    durationSeconds: clampOwnerNumber(song.durationSeconds, 30, 1200, 180),
    performanceNote: cleanOwnerText(song.performanceNote, 300),
    songKey: cleanOwnerText(song.songKey, 40),
    tuning: cleanOwnerText(song.tuning, 80),
    youtubeUrl: youtubeUrl || (youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : ""),
    youtubeVideoId,
    chordsUrl: cleanOwnerUrl(song.chordsUrl),
    lyricsUrl: cleanOwnerUrl(song.lyricsUrl),
    rehearsalNotes: cleanOwnerText(song.rehearsalNotes, 2500),
  });
}

function cleanOwnerText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanOwnerUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function clampOwnerNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

type SongResourceInput = {
  title: string;
  artist: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  chordsUrl?: string;
  lyricsUrl?: string;
};

type CuratedSongResource = {
  title: string;
  artist: string;
  youtubeVideoId: string;
  lyricsUrl: string;
};

const CURATED_SONG_RESOURCES: CuratedSongResource[] = [
  resource("Badfish", "Sublime", "rmadSGJCzo8", "https://genius.com/Sublime-badfish-lyrics"),
  resource("Nutshell", "Alice in Chains", "9EKi2E9dVY8", "https://genius.com/Alice-in-chains-nutshell-lyrics"),
  resource("Heart-Shaped Box", "Nirvana", "n6P0SitRwy8", "https://genius.com/Nirvana-heart-shaped-box-lyrics"),
  resource("Creep", "Radiohead", "XFkzRNyygfk", "https://genius.com/Radiohead-creep-lyrics"),
  resource("Just a Girl", "No Doubt", "PHzOOQfhPFg", "https://genius.com/No-doubt-just-a-girl-lyrics"),
  resource("Misery Business", "Paramore", "aCyGvGEtOwc", "https://genius.com/Paramore-misery-business-lyrics"),
  resource("Basket Case", "Green Day", "NUTGr5t3MoY", "https://genius.com/Green-day-basket-case-lyrics"),
  resource("The Rock Show", "blink-182", "z7hhDINyBP0", "https://genius.com/Blink-182-the-rock-show-lyrics"),
  resource("Ruby Soho", "Rancid", "0P9QMkm9Eew", "https://genius.com/Rancid-ruby-soho-lyrics"),
  resource("When I Come Around", "Green Day", "i8dh9gDzmz8", "https://genius.com/Green-day-when-i-come-around-lyrics"),
  resource("Stand By Me", "Pennywise", "5xUEjnucc3A", "https://genius.com/Pennywise-stand-by-me-lyrics"),
  resource("Miles Away", "Goldfinger", "QZ2wN6pR4_A", "https://genius.com/Goldfinger-miles-away-lyrics"),
  resource("First Date", "blink-182", "vVy9Lgpg1m8", "https://genius.com/Blink-182-first-date-lyrics"),
  resource("Chick Magnet", "MxPx", "SPcDyl6tCV8", "https://genius.com/Mxpx-chick-magnet-lyrics"),
  resource("Blind", "Face to Face", "xQ8cEx0lRr8", "https://genius.com/Face-to-face-blind-lyrics"),
  resource("The Story Of Us", "Taylor Swift", "nN6VR92V70M", "https://genius.com/Taylor-swift-the-story-of-us-lyrics"),
  resource("The Middle", "Jimmy Eat World", "oKsxPW6i3pM", "https://genius.com/Jimmy-eat-world-the-middle-lyrics"),
  resource("On The Road Again", "Me First and the Gimme Gimmes", "4mFHt3DMydo", "https://genius.com/Me-first-and-the-gimme-gimmes-on-the-road-again-lyrics"),
  resource("Breed", "Nirvana", "J6EDW5WFb2M", "https://genius.com/Nirvana-breed-lyrics"),
  resource("Country Roads", "Me First and the Gimme Gimmes", "066SFOZhaXg", "https://genius.com/Me-first-and-the-gimme-gimmes-country-roads-lyrics"),
  resource("Tomorrow's Another Day", "MxPx", "yOEgBpbf6aY", "https://genius.com/Mxpx-tomorrows-another-day-lyrics"),
  resource("Linoleum", "NOFX", "WnQYgelZllE", "https://genius.com/Nofx-linoleum-lyrics"),
  resource("All The Small Things", "blink-182", "9Ht5RZpzPqw", "https://genius.com/Blink-182-all-the-small-things-lyrics"),
  resource("She", "Green Day", "cXGSKEjR6_U", "https://genius.com/Green-day-she-lyrics"),
];

function resource(
  title: string,
  artist: string,
  youtubeVideoId: string,
  lyricsUrl: string,
): CuratedSongResource {
  return { title, artist, youtubeVideoId, lyricsUrl };
}

export function normalizeSongValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function primarySongArtist(value: string) {
  return value.split(/\s+\/\s+/)[0]?.trim() ?? value.trim();
}

export function getCuratedSongResources(title: string, artist: string) {
  const normalizedTitle = normalizeSongValue(title);
  const normalizedArtist = normalizeSongValue(primarySongArtist(artist));
  const match = CURATED_SONG_RESOURCES.find(
    (entry) =>
      normalizeSongValue(entry.title) === normalizedTitle &&
      normalizeSongValue(entry.artist) === normalizedArtist,
  );
  if (!match) return null;

  return {
    youtubeUrl: `https://www.youtube.com/watch?v=${match.youtubeVideoId}`,
    youtubeVideoId: match.youtubeVideoId,
    lyricsUrl: match.lyricsUrl,
  };
}

export function buildSongResourceLinks(title: string, artist: string) {
  const query = [primarySongArtist(artist), title.trim()].filter(Boolean).join(" ");
  const encoded = encodeURIComponent(query);

  return {
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encoded}`,
    chordsSearchUrl: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encoded}`,
    lyricsSearchUrl: `https://genius.com/search?q=${encoded}`,
  };
}

export function isSearchResourceUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.hostname.endsWith("youtube.com") && url.pathname === "/results") ||
      (url.hostname.endsWith("genius.com") && url.pathname === "/search") ||
      (url.hostname.endsWith("ultimate-guitar.com") && url.pathname === "/search.php")
    );
  } catch {
    return false;
  }
}

export function savedOfficialMediaUrl(value = "") {
  const trimmed = value.trim();
  return trimmed && !isSearchResourceUrl(trimmed) ? trimmed : "";
}

export function hydrateOfficialSongMedia<
  T extends {
    youtubeUrl: string;
    youtubeVideoId: string;
    lyricsUrl: string;
    chordsUrl: string;
  },
>(song: T): T {
  const youtubeUrl = savedOfficialMediaUrl(song.youtubeUrl);
  const lyricsUrl = savedOfficialMediaUrl(song.lyricsUrl);
  const chordsUrl = savedOfficialMediaUrl(song.chordsUrl);

  return {
    ...song,
    youtubeUrl,
    lyricsUrl,
    chordsUrl,
    youtubeVideoId: song.youtubeVideoId.trim() || getYouTubeVideoId(youtubeUrl),
  };
}

export function publicSongResourceActions(
  song: SongResourceInput & { isOriginal?: boolean },
) {
  if (song.isOriginal) {
    return {
      youtubeUrl: "",
      lyricsUrl: "",
      youtubeIsDirect: false,
      lyricsIsDirect: false,
    };
  }

  const youtubeUrl = savedOfficialMediaUrl(song.youtubeUrl);
  const lyricsUrl = savedOfficialMediaUrl(song.lyricsUrl);
  return {
    youtubeUrl,
    lyricsUrl,
    youtubeIsDirect: Boolean(youtubeUrl),
    lyricsIsDirect: Boolean(lyricsUrl),
  };
}

export type OwnerPublicSongReview = {
  kind: "original" | "public-media" | "owner-search-only";
  youtubePublic: boolean;
  lyricsPublic: boolean;
  notesPrivate: boolean;
  summary: string;
  youtubeOwnerHref: string;
  lyricsOwnerHref: string;
  youtubeOwnerLabel: string;
  lyricsOwnerLabel: string;
};

export type OwnerPublicSetReview = {
  coverCount: number;
  originalCount: number;
  publicYouTubeCount: number;
  publicLyricsCount: number;
  searchOnlyCoverCount: number;
  privateNotesCount: number;
  summary: string;
};

type OwnerPublicReviewInput = SongResourceInput & {
  isOriginal?: boolean;
  rehearsalNotes?: string;
};

function withPrivateNotes(summary: string, notesPrivate: boolean): string {
  return notesPrivate ? `${summary} Rehearsal notes stay in Show Control.` : summary;
}

function countPhrase(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Name what the public list will show. Owner search links are not public actions. */
export function ownerPublicSongReview(song: OwnerPublicReviewInput): OwnerPublicSongReview {
  const publicActions = publicSongResourceActions(song);
  const searches = buildSongResourceLinks(song.title, song.artist);
  const notesPrivate = Boolean(song.rehearsalNotes?.trim());
  if (song.isOriginal) {
    return {
      kind: "original",
      youtubePublic: false,
      lyricsPublic: false,
      notesPrivate,
      summary: withPrivateNotes("Original — public list hides YouTube and lyrics.", notesPrivate),
      youtubeOwnerHref: "",
      lyricsOwnerHref: "",
      youtubeOwnerLabel: "",
      lyricsOwnerLabel: "",
    };
  }

  const youtubeSaved = savedOfficialMediaUrl(song.youtubeUrl);
  const lyricsSaved = savedOfficialMediaUrl(song.lyricsUrl);
  const youtubePublic = publicActions.youtubeIsDirect;
  const lyricsPublic = publicActions.lyricsIsDirect;
  let summary: string;
  if (youtubePublic && lyricsPublic) {
    summary = "Public list shows saved YouTube and lyrics.";
  } else if (youtubePublic) {
    summary = "Public list shows saved YouTube. Lyrics stay off the public list until a saved page is pasted.";
  } else if (lyricsPublic) {
    summary = "Public list shows saved lyrics. YouTube stays off the public list until a saved video is pasted.";
  } else {
    summary = "Public list hides YouTube and lyrics. Search links stay in Show Control.";
  }

  return {
    kind: youtubePublic || lyricsPublic ? "public-media" : "owner-search-only",
    youtubePublic,
    lyricsPublic,
    notesPrivate,
    summary: withPrivateNotes(summary, notesPrivate),
    youtubeOwnerHref: youtubeSaved || searches.youtubeSearchUrl,
    lyricsOwnerHref: lyricsSaved || searches.lyricsSearchUrl,
    youtubeOwnerLabel: youtubeSaved ? "Open saved YouTube" : "Search YouTube",
    lyricsOwnerLabel: lyricsSaved ? "Open saved lyrics" : "Search lyrics",
  };
}

/** Review this browser draft against the public official-set media contract. */
export function ownerPublicSetReview(songs: readonly OwnerPublicReviewInput[]): OwnerPublicSetReview {
  if (!songs.length) {
    return {
      coverCount: 0,
      originalCount: 0,
      publicYouTubeCount: 0,
      publicLyricsCount: 0,
      searchOnlyCoverCount: 0,
      privateNotesCount: 0,
      summary: "Add a song to review what the public list will show. An empty set stays empty.",
    };
  }

  const reviews = songs.map(ownerPublicSongReview);
  const originalCount = reviews.filter((review) => review.kind === "original").length;
  const publicYouTubeCount = reviews.filter((review) => review.youtubePublic).length;
  const publicLyricsCount = reviews.filter((review) => review.lyricsPublic).length;
  const searchOnlyCoverCount = reviews.filter((review) => review.kind === "owner-search-only").length;
  const privateNotesCount = reviews.filter((review) => review.notesPrivate).length;
  const parts = [
    `${countPhrase(songs.length, "song")} in this browser draft`,
    publicYouTubeCount
      ? `${countPhrase(publicYouTubeCount, "song shows", "songs show")} saved YouTube on the public list`
      : "no saved YouTube on the public list",
    publicLyricsCount
      ? `${countPhrase(publicLyricsCount, "song shows", "songs show")} saved lyrics on the public list`
      : "no saved lyrics on the public list",
  ];
  if (originalCount) parts.push(`${countPhrase(originalCount, "original hides", "originals hide")} both`);
  if (searchOnlyCoverCount) {
    parts.push(`${countPhrase(searchOnlyCoverCount, "cover keeps", "covers keep")} search links in Show Control`);
  }
  if (privateNotesCount) parts.push("Rehearsal notes stay in Show Control");
  return {
    coverCount: songs.length - originalCount,
    originalCount,
    publicYouTubeCount,
    publicLyricsCount,
    searchOnlyCoverCount,
    privateNotesCount,
    summary: `${parts.join(". ")}.`,
  };
}

export function resolveSongResourceLinks(song: SongResourceInput) {
  const searches = buildSongResourceLinks(song.title, song.artist);
  const curated = getCuratedSongResources(song.title, song.artist);
  const storedYouTube = song.youtubeUrl?.trim() ?? "";
  const storedLyrics = song.lyricsUrl?.trim() ?? "";
  const storedChords = song.chordsUrl?.trim() ?? "";
  const youtubeIsDirect = Boolean(
    curated?.youtubeUrl || (storedYouTube && !isSearchResourceUrl(storedYouTube)),
  );
  const lyricsIsDirect = Boolean(
    curated?.lyricsUrl || (storedLyrics && !isSearchResourceUrl(storedLyrics)),
  );
  const chordsIsDirect = Boolean(storedChords && !isSearchResourceUrl(storedChords));

  return {
    youtubeUrl:
      curated?.youtubeUrl ||
      (youtubeIsDirect ? storedYouTube : searches.youtubeSearchUrl),
    youtubeVideoId:
      curated?.youtubeVideoId ||
      song.youtubeVideoId?.trim() ||
      getYouTubeVideoId(storedYouTube),
    lyricsUrl:
      curated?.lyricsUrl ||
      (lyricsIsDirect ? storedLyrics : searches.lyricsSearchUrl),
    chordsUrl: chordsIsDirect ? storedChords : searches.chordsSearchUrl,
    youtubeSearchUrl: searches.youtubeSearchUrl,
    lyricsSearchUrl: searches.lyricsSearchUrl,
    chordsSearchUrl: searches.chordsSearchUrl,
    youtubeIsDirect,
    lyricsIsDirect,
    chordsIsDirect,
    source: curated ? "curated" : "stored-or-search",
  };
}

export function getYouTubeVideoId(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (YOUTUBE_ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return "";
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : "";
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    const queryId = url.searchParams.get("v") ?? "";
    if (YOUTUBE_ID.test(queryId)) return queryId;

    const parts = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
      const id = parts[1] ?? "";
      return YOUTUBE_ID.test(id) ? id : "";
    }
  }

  return "";
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return YOUTUBE_ID.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
    : "";
}
