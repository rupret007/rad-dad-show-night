import { savedOfficialMediaUrl } from "./song-resources.ts";

export type ResourceLookupResult = {
  source?: string;
  youtubeUrl?: string;
  lyricsUrl?: string;
};

export function resourceLookupCompletionNotice(
  title: string,
  result: ResourceLookupResult,
) {
  const songTitle = title.trim() || "this song";
  const appliedVideo = Boolean(savedOfficialMediaUrl(result.youtubeUrl ?? ""));
  const appliedLyrics = Boolean(savedOfficialMediaUrl(result.lyricsUrl ?? ""));

  if (appliedVideo && appliedLyrics) {
    return `Candidate YouTube and lyrics filled in for ${songTitle}. Save to put them on the public list.`;
  }
  if (appliedVideo) {
    return `Candidate YouTube filled in for ${songTitle}. Save to put it on the public list.`;
  }
  if (appliedLyrics) {
    return `Candidate lyrics filled in for ${songTitle}. Paste a YouTube video if you want one, then Save.`;
  }
  return `YouTube search is ready for ${songTitle}. Paste the video you want to feature.`;
}
