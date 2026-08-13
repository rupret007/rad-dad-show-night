const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

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
