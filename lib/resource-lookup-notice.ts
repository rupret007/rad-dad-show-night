import { savedOfficialMediaUrl } from "./song-resources.ts";
import type { ShowLifecycleStatus } from "./show-lifecycle";

export type ResourceLookupResult = {
  source?: string;
  youtubeUrl?: string;
  lyricsUrl?: string;
};

export function resourceLookupCompletionNotice(
  title: string,
  result: ResourceLookupResult,
  status: ShowLifecycleStatus,
) {
  const songTitle = title.trim() || "this song";
  const appliedVideo = Boolean(savedOfficialMediaUrl(result.youtubeUrl ?? ""));
  const appliedLyrics = Boolean(savedOfficialMediaUrl(result.lyricsUrl ?? ""));
  const saveNotice = status === "published"
    ? `Save to put ${appliedVideo && appliedLyrics ? "them" : "it"} on the public list.`
    : "Save to keep the candidate resources on this private show. Publish opens its public list.";

  if (appliedVideo && appliedLyrics) {
    return `Candidate YouTube and lyrics filled in for ${songTitle}. ${saveNotice}`;
  }
  if (appliedVideo) {
    return `Candidate YouTube filled in for ${songTitle}. ${saveNotice}`;
  }
  if (appliedLyrics) {
    const privateNotice = status === "published" ? "" : " This show stays private until you Publish.";
    return `Candidate lyrics filled in for ${songTitle}. Paste a YouTube video if you want one, then Save.${privateNotice}`;
  }
  return `YouTube search is ready for ${songTitle}. Paste the video you want to feature.`;
}
