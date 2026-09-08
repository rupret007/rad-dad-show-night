"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SET_DEFINITIONS,
  SHOW_DETAILS,
  type ManagedShow,
  type SetSlug,
  type ShowSong,
} from "../../lib/show-data";
import { parseShowSets, showPayloadBelongsToShow, type ShowSetDefinition } from "../../lib/show-read-integrity";
import {
  buildSongResourceLinks,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  normalizeOfficialSongContent,
  ownerPublicSetReview,
  ownerPublicSongReview,
  savedOfficialMediaUrl,
} from "../../lib/song-resources";
import {
  showEditorLiveState,
  showOwnerCheckedKeptDraftNotice,
  showOwnerDirtyNotice,
  showOwnerLifecycleHint,
  showOwnerReadyNotice,
  showOwnerSavedNotice,
  showOwnerSavedWithLaterEditsNotice,
  showOwnerSaveHoldNotice,
  showOwnerSavingNotice,
  showShareLinkLabel,
  showStatusBadge,
  showStatusChangeBlockReason,
  showStatusChangeConfirmation,
  type ShowLifecycleStatus,
} from "../../lib/show-lifecycle";
import {
  buildShowControlPosture,
  type ShowControlLeftoverAction,
  type ShowControlNextAction,
} from "../../lib/show-control-posture";
import { showHoursLabel } from "../../lib/show-public";
import {
  applySuccessfulOfficialSave,
  bindUndoRemove,
  canApplyUndoRemove,
  classifyOwnerSaveResult,
  OWNER_SAVE_DEADLINE_MS,
  officialSetRevision,
  readReviewedVersion,
  readSetWriteVersions,
  reconcileCheckedOfficialSet,
  revisionsFromOfficialSets,
  type BoundUndoRemove,
  type OwnerSaveHold,
} from "../../lib/owner-set-save";
import {
  ownerSongReviewDetails,
  readOwnerSetSongs, readOwnerShowSongs, removedDraftSongs,
  stageReviewedOwnerDraft,
} from "../../lib/owner-set-review";
import type { Suggestion } from "../song-board";
import { parseSuggestionFeedPayload } from "../../lib/suggestion-board";
import styles from "./show-control.module.css";
import SetCoach from "./set-coach";

type SongMap = Record<SetSlug, ShowSong[]>;
type DeletedSong = BoundUndoRemove | null;
type SetReview = {
  showId: string; showSlug: string; setSlug: SetSlug; songs: ShowSong[];
  reviewedBase: string; reviewedVersion: string;
};
type OwnerOperation = { controller: AbortController; showSlug: string; showId: string; setSlug: SetSlug };

const emptySongMap = (): SongMap => ({
  "jeff-story-friends": [],
  stalemate: [],
  "rad-dad": [],
});

// An offline/public copy is never authority for an owner write or review.
function verifiedOwnerResponse(response: Response): boolean {
  return response.ok
    && response.headers.get("X-Rad-Dad-Read-Scope") === "owner"
    && response.headers.get("X-Rad-Dad-Data-Source") === "owner-database"
    && response.headers.get("X-Rad-Dad-Offline") !== "1";
}

// The deadline covers headers and body, even if a late response ignores abort.
function withinOwnerDeadline<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("The saved list could not be verified before the check timed out. Check again; your draft is kept."));
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export default function ShowControlClient({
  userName,
  userEmail,
  signOutHref,
}: {
  userName: string;
  userEmail: string;
  signOutHref: string;
}) {
  const [songsBySet, setSongsBySet] = useState<SongMap>(emptySongMap);
  const [activeSet, setActiveSet] = useState<SetSlug>("rad-dad");
  const [dirtySets, setDirtySets] = useState<Set<SetSlug>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showVerified, setShowVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftArtist, setDraftArtist] = useState("");
  const [enriching, setEnriching] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShowSong | null>(null);
  const [deleted, setDeleted] = useState<DeletedSong>(null);
  const [reviewedBases, setReviewedBases] = useState<Record<SetSlug, string | null>>({
    "jeff-story-friends": null,
    stalemate: null,
    "rad-dad": null,
  });
  const [saveHolds, setSaveHolds] = useState<Partial<Record<SetSlug, OwnerSaveHold>>>({});
  const [reviewedVersions, setReviewedVersions] = useState<Partial<Record<SetSlug, string>>>({});
  const [setReviews, setSetReviews] = useState<Partial<Record<SetSlug, SetReview>>>({});
  const [reviewReadFailed, setReviewReadFailed] = useState<Partial<Record<SetSlug, boolean>>>({});
  const [checkingSet, setCheckingSet] = useState<SetSlug | null>(null);
  const ownerOperation = useRef<OwnerOperation | null>(null);
  const retiredVersions = useRef<Partial<Record<SetSlug, string[]>>>({});
  const mounted = useRef(true);
  const reviewRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ownerOperation.current?.controller.abort(); ownerOperation.current = null; };
  }, []);
  const songsBySetRef = useRef<SongMap>(emptySongMap());
  useEffect(() => {
    songsBySetRef.current = songsBySet;
  }, [songsBySet]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsVerified, setSuggestionsVerified] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsRefresh, setSuggestionsRefresh] = useState(0);
  const [shows, setShows] = useState<ManagedShow[]>([]);
  const [activeShowSlug, setActiveShowSlug] = useState<string>(SHOW_DETAILS.slug);
  const [showSets, setShowSets] = useState<ShowSetDefinition[]>([...SET_DEFINITIONS]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneHoursError, setCloneHoursError] = useState("");
  const [cloning, setCloning] = useState(false);
  const [coachSets, setCoachSets] = useState<ShowSetDefinition[]>([]);
  const [statusChanging, setStatusChanging] = useState<ShowLifecycleStatus | null>(null);
  const dragIndex = useRef<number | null>(null);
  const draftTitleRef = useRef<HTMLInputElement | null>(null);
  const draftIdPrefix = useId().replace(/[^a-z0-9-]/gi, "");
  const draftIdCounter = useRef(0);

  useEffect(() => {
    let active = true;
    const requestedShow =
      new URLSearchParams(window.location.search).get("show") || SHOW_DETAILS.slug;
    Promise.all([
      fetch(`/api/show?show=${encodeURIComponent(requestedShow)}&scope=owner`, { cache: "no-store" }).then((response) => {
        if (!verifiedOwnerResponse(response)) throw new Error("Could not verify the current owner set data.");
        return response.json() as Promise<{
          songs: ShowSong[];
          show: ManagedShow;
          sets?: ShowSetDefinition[];
          setWriteVersions?: unknown;
        }>;
      }),
      fetch("/api/shows", { cache: "no-store" }).then((response) =>
        response.json() as Promise<{ shows?: ManagedShow[] }>,
      ),
    ])
      .then(([showData, showList]) => {
        if (!active) return;
        if (!showPayloadBelongsToShow(showData, requestedShow)) {
          throw new Error("That show's set could not be verified.");
        }
        const grouped = readOwnerShowSongs(showData.songs, showData.show.id);
        const versions = readSetWriteVersions(showData.setWriteVersions);
        if (!grouped || !versions) throw new Error("That show's official lists and write versions could not be verified.");
        setSongsBySet(grouped);
        setReviewedBases(revisionsFromOfficialSets(grouped));
        setReviewedVersions(versions);
        retiredVersions.current = {};
        setSetReviews({}); setReviewReadFailed({});
        setSaveHolds({});
        setDeleted(null);
        setShows(showList.shows ?? [showData.show]);
        setActiveShowSlug(showData.show.slug);
        if (showData.sets?.length) setShowSets(showData.sets);
        setCoachSets(parseShowSets(showData.sets) ?? []);
        setShowVerified(true);
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load Show Control.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // The public inbox is independent of the verified owner show. A failed feed
  // must neither pretend to be empty nor strand otherwise usable official sets.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10_000);
    fetch("/api/suggestions", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Suggestion inbox unavailable.");
        return parseSuggestionFeedPayload(await response.json());
      })
      .then((rows) => {
        if (!active) return;
        setSuggestions(rows);
        setSuggestionsVerified(true);
        setSuggestionsError(false);
      })
      .catch(() => {
        if (active) setSuggestionsError(true);
      })
      .finally(() => {
        clearTimeout(deadline);
        if (active) setSuggestionsLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [suggestionsRefresh]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtySets.size) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtySets]);

  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  const activeDefinition = SET_DEFINITIONS.find((set) => set.slug === activeSet)!;
  const activeSetTime =
    showSets.find((set) => set.slug === activeSet)?.time?.trim() || "This show";
  const activeShow =
    shows.find((show) => show.slug === activeShowSlug) ??
    (SHOW_DETAILS as ManagedShow);
  const activeSongs = songsBySet[activeSet];
  const activeCoachSets = coachSets.filter((set) => set.slug === activeSet);
  const currentShow = useRef({ id: activeShow.id, slug: activeShowSlug });
  useLayoutEffect(() => {
    currentShow.current = { id: activeShow.id, slug: activeShowSlug };
  }, [activeShow.id, activeShowSlug]);
  const totalSongs = useMemo(
    () => Object.values(songsBySet).reduce((total, setSongs) => total + setSongs.length, 0),
    [songsBySet],
  );

  function markDirty(setSlug = activeSet) {
    setDirtySets((current) => new Set(current).add(setSlug));
    setNotice(showOwnerDirtyNotice(activeShow.status));
  }

  function replaceSet(setSlug: SetSlug, nextSongs: ShowSong[]) {
    setSongsBySet((current) => ({
      ...current,
      [setSlug]: nextSongs.map((song, index) => ({
        ...song,
        setSlug,
        position: index + 1,
      })),
    }));
    markDirty(setSlug);
  }

  function updateSong(id: number | string, patch: Partial<ShowSong>, setSlug = activeSet) {
    setSongsBySet((current) => ({
      ...current,
      [setSlug]: current[setSlug].map((song, index) =>
        String(song.id) === String(id)
          ? { ...song, ...patch, position: index + 1 }
          : { ...song, position: index + 1 },
      ),
    }));
    markDirty(setSlug);
  }

  function moveSong(from: number, to: number) {
    if (to < 0 || to >= activeSongs.length || from === to) return;
    const reordered = [...activeSongs];
    const [song] = reordered.splice(from, 1);
    reordered.splice(to, 0, song);
    replaceSet(activeSet, reordered);
  }

  async function addSong(
    title: string,
    artist: string,
    performanceNote = "",
    isOriginal = false,
    findYouTube = !isOriginal,
  ) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    draftIdCounter.current += 1;
    const song: ShowSong = {
      id: `draft-${draftIdPrefix}-${draftIdCounter.current}`,
      showId: activeShow.id,
      setSlug: activeSet,
      position: activeSongs.length + 1,
      title: cleanTitle,
      artist: artist.trim(),
      transition: false,
      isOriginal,
      durationSeconds: 180,
      performanceNote,
      songKey: "",
      tuning: "",
      youtubeUrl: "",
      youtubeVideoId: "",
      chordsUrl: "",
      lyricsUrl: "",
      rehearsalNotes: "",
      updatedAt: new Date().toISOString(),
    };
    replaceSet(activeSet, [...activeSongs, song]);
    setDraftTitle("");
    setDraftArtist("");
    if (findYouTube) {
      await findResources(song);
    } else {
      setNotice(
        `${cleanTitle} was added as a draft. YouTube is optional; add a link only if there is a useful reference.`,
      );
    }
  }

  async function addFromComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addSong(draftTitle, draftArtist);
  }

  async function findResources(song: ShowSong) {
    if (!song.title.trim()) return;
    if (song.isOriginal) {
      setNotice(`${song.title} is marked original, so public resource links stay hidden.`);
      return;
    }
    setEnriching(String(song.id));
    setNotice(`Finding YouTube for ${song.title}...`);
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: song.title, artist: song.artist }),
      });
      const result = (await response.json()) as {
        error?: string;
        source?: string;
        youtubeUrl?: string;
        youtubeVideoId?: string;
        chordsUrl?: string;
        lyricsUrl?: string;
      };
      if (!response.ok) throw new Error(result.error || "Resource lookup failed.");
      updateSong(
        song.id,
        {
          youtubeUrl: savedOfficialMediaUrl(result.youtubeUrl) || song.youtubeUrl,
          youtubeVideoId: result.youtubeVideoId || song.youtubeVideoId,
          chordsUrl: savedOfficialMediaUrl(result.chordsUrl) || song.chordsUrl,
          lyricsUrl: savedOfficialMediaUrl(result.lyricsUrl) || song.lyricsUrl,
        },
        song.setSlug,
      );
      setNotice(
        result.source === "youtube-api"
          ? `YouTube match found for ${song.title}.`
          : `YouTube search is ready for ${song.title}. Paste the video you want to feature.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Resource lookup failed.");
    } finally {
      setEnriching(null);
    }
  }

  function removeSong(index: number) {
    const song = activeSongs[index];
    if (!window.confirm(`Remove "${song.title}" from ${activeDefinition.title}?`)) return;
    setDeleted(bindUndoRemove(activeShowSlug, activeSet, song, index));
    replaceSet(
      activeSet,
      activeSongs.filter((_, songIndex) => songIndex !== index),
    );
  }

  function undoDelete() {
    if (!canApplyUndoRemove(deleted, activeShowSlug, activeSet)) {
      setDeleted(null);
      return;
    }
    const restored = [...activeSongs];
    restored.splice(Math.min(deleted.index, restored.length), 0, deleted.song);
    replaceSet(activeSet, restored);
    setDeleted(null);
  }

  function holdSave(setSlug: SetSlug, kind: OwnerSaveHold, message: string) {
    setSaveHolds((current) => ({ ...current, [setSlug]: kind }));
    setNotice(message);
  }

  function clearSaveHold(setSlug: SetSlug) {
    setSaveHolds((current) => {
      if (!current[setSlug]) return current;
      const next = { ...current };
      delete next[setSlug];
      return next;
    });
    setSetReviews((current) => { const next = { ...current }; delete next[setSlug]; return next; });
    setReviewReadFailed((current) => { const next = { ...current }; delete next[setSlug]; return next; });
  }

  function operationIsCurrent(operation: OwnerOperation) {
    return operationStillOwned(operation) && !operation.controller.signal.aborted;
  }

  function operationStillOwned(operation: OwnerOperation) {
    return mounted.current && ownerOperation.current === operation
      && currentShow.current.id === operation.showId && currentShow.current.slug === operation.showSlug;
  }

  function adoptSetAuthority(setSlug: SetSlug, reviewedBase: string, reviewedVersion: string) {
    const old = reviewedVersions[setSlug];
    if (old && old !== reviewedVersion) {
      retiredVersions.current[setSlug] = [...(retiredVersions.current[setSlug] ?? []), old].slice(-16);
    }
    setReviewedBases((current) => ({ ...current, [setSlug]: reviewedBase }));
    setReviewedVersions((current) => ({ ...current, [setSlug]: reviewedVersion }));
  }

  async function saveSet(setSlug: SetSlug) {
    if (saveHolds[setSlug] || setReviews[setSlug] || checkingSet || ownerOperation.current || !showVerified) return;
    const setDefinition =
      showSets.find((set) => set.slug === setSlug) ??
      SET_DEFINITIONS.find((set) => set.slug === setSlug)!;
    const sentSongs = songsBySet[setSlug];
    const reviewedBase = reviewedBases[setSlug];
    const reviewedVersion = readReviewedVersion(reviewedVersions[setSlug]);
    if (!reviewedBase || !reviewedVersion) {
      setNotice("This official set could not be verified. Retry the verified load before saving.");
      return;
    }
    const controller = new AbortController();
    const operation = { controller, showSlug: activeShowSlug, showId: activeShow.id, setSlug };
    ownerOperation.current = operation;
    setSaving(true);
    setNotice(showOwnerSavingNotice(setDefinition.title, activeShow.status));
    const deadline = window.setTimeout(() => controller.abort(), OWNER_SAVE_DEADLINE_MS);
    try {
      let response: Response;
      try {
        response = await withinOwnerDeadline(fetch("/api/show", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            showSlug: operation.showSlug,
            setSlug,
            songs: sentSongs,
            reviewedBase,
            reviewedVersion,
          }),
        }), controller.signal);
      } catch {
        if (!operationStillOwned(operation)) return;
        holdSave(setSlug, "uncertain", showOwnerSaveHoldNotice("uncertain", setDefinition.title));
        return;
      }
      let body: unknown = null;
      try {
        body = await withinOwnerDeadline(response.json(), controller.signal);
      } catch {
        if (!operationStillOwned(operation)) return;
        holdSave(setSlug, "uncertain", showOwnerSaveHoldNotice("uncertain", setDefinition.title));
        return;
      }
      if (!operationIsCurrent(operation)) {
        if (operationStillOwned(operation)) holdSave(setSlug, "uncertain", showOwnerSaveHoldNotice("uncertain", setDefinition.title));
        return;
      }
      const classified = classifyOwnerSaveResult({
        ok: response.ok,
        status: response.status,
        body,
        showId: operation.showId,
        setSlug,
      });
      if (classified.kind === "refused") {
        setNotice(classified.message);
        return;
      }
      if (classified.kind === "conflict") {
        holdSave(setSlug, "conflict", showOwnerSaveHoldNotice("conflict", setDefinition.title));
        return;
      }
      if (classified.kind === "uncertain") {
        holdSave(setSlug, "uncertain", classified.message);
        return;
      }
      const savedRows = readOwnerSetSongs(classified.songs, operation.showId, setSlug);
      if (!savedRows || classified.reviewedVersion === reviewedVersion
        || retiredVersions.current[setSlug]?.includes(classified.reviewedVersion)) {
        holdSave(setSlug, "uncertain", showOwnerSaveHoldNotice("uncertain", setDefinition.title));
        return;
      }
      const applied = applySuccessfulOfficialSave({
        currentSongs: songsBySetRef.current[setSlug],
        sentSongs,
        expectedSavedSongs: sentSongs.map(normalizeOfficialSongContent),
        savedSongs: savedRows,
        reviewedVersion: classified.reviewedVersion,
      });
      if (!applied) {
        holdSave(setSlug, "uncertain", showOwnerSaveHoldNotice("uncertain", setDefinition.title));
        return;
      }
      setSongsBySet((current) => ({ ...current, [setSlug]: applied.songs }));
      adoptSetAuthority(setSlug, applied.reviewedBase, applied.reviewedVersion);
      clearSaveHold(setSlug);
      setDirtySets((current) => {
        const next = new Set(current);
        if (applied.stillDirty) next.add(setSlug);
        else next.delete(setSlug);
        return next;
      });
      if (setSlug === activeSet && !applied.stillDirty) setDeleted(null);
      setNotice(
        applied.stillDirty
          ? showOwnerSavedWithLaterEditsNotice(setDefinition.title, activeShow.status)
          : showOwnerSavedNotice(setDefinition.title, activeShow.status),
      );
    } finally {
      window.clearTimeout(deadline);
      if (ownerOperation.current === operation) {
        ownerOperation.current = null;
        if (mounted.current) setSaving(false);
      }
    }
  }

  async function checkSavedSet(setSlug: SetSlug) {
    if (saving || checkingSet || ownerOperation.current || !showVerified) return;
    const setDefinition =
      showSets.find((set) => set.slug === setSlug) ??
      SET_DEFINITIONS.find((set) => set.slug === setSlug)!;
    const controller = new AbortController();
    const operation = { controller, showSlug: activeShowSlug, showId: activeShow.id, setSlug };
    ownerOperation.current = operation;
    setCheckingSet(setSlug);
    setReviewReadFailed((current) => ({ ...current, [setSlug]: true }));
    setNotice(`Checking the saved ${setDefinition.title} list...`);
    const deadline = window.setTimeout(() => controller.abort(), OWNER_SAVE_DEADLINE_MS);
    try {
      const response = await withinOwnerDeadline(fetch(`/api/show?show=${encodeURIComponent(operation.showSlug)}&scope=owner`, {
        cache: "no-store",
        signal: controller.signal,
      }), controller.signal);
      if (!verifiedOwnerResponse(response)) throw new Error("The saved official list could not be checked from current owner data.");
      const data = (await withinOwnerDeadline(response.json(), controller.signal)) as {
        songs: ShowSong[];
        show: ManagedShow;
        setWriteVersions?: unknown;
      };
      if (!operationIsCurrent(operation)) throw new Error("The saved official list could not be checked. Try checking again.");
      if (!showPayloadBelongsToShow(data, operation.showSlug) || data.show.id !== operation.showId) {
        throw new Error("The saved official list could not be verified.");
      }
      const grouped = readOwnerShowSongs(data.songs, operation.showId);
      const versions = readSetWriteVersions(data.setWriteVersions);
      if (!grouped || !versions) throw new Error("The saved official list and write version could not be verified. Try checking again.");
      const official = grouped[setSlug];
      const version = versions[setSlug];
      if ((retiredVersions.current[setSlug]?.includes(version) && version !== reviewedVersions[setSlug])
        || (version === reviewedVersions[setSlug] && officialSetRevision(official) !== reviewedBases[setSlug])) {
        throw new Error("That check returned an older or inconsistent saved version. Your draft is kept; check again.");
      }
      const reconciled = reconcileCheckedOfficialSet({
        draftSongs: songsBySetRef.current[setSlug],
        officialSongs: official,
        reviewedVersion: version,
      });
      if (!reconciled) {
        setNotice("The saved official list could not be verified. Try checking again.");
        return;
      }
      setShows((current) => current.map((show) => show.id === operation.showId ? data.show : show));
      if (reconciled.stillDirty) {
        setSetReviews((current) => ({ ...current, [setSlug]: {
          showId: operation.showId, showSlug: operation.showSlug, setSlug, songs: official,
          reviewedBase: reconciled.reviewedBase, reviewedVersion: reconciled.reviewedVersion,
        } }));
        setSaveHolds((current) => ({ ...current, [setSlug]: current[setSlug] ?? "conflict" }));
        setReviewReadFailed((current) => ({ ...current, [setSlug]: false }));
        setActiveSet(setSlug);
        setNotice(`Review the saved ${setDefinition.title} list beside your browser draft. Nothing has been overwritten.`);
        window.requestAnimationFrame(() => {
          if (!mounted.current || currentShow.current.id !== operation.showId
            || reviewRef.current?.dataset.reviewSet !== setSlug) return;
          reviewRef.current?.focus({ preventScroll: true });
          reviewRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
        });
        return;
      }
      adoptSetAuthority(setSlug, reconciled.reviewedBase, reconciled.reviewedVersion);
      if (!reconciled.stillDirty) {
        setSongsBySet((current) => ({ ...current, [setSlug]: reconciled.songs }));
      }
      setDirtySets((current) => {
        const next = new Set(current);
        if (reconciled.stillDirty) next.add(setSlug);
        else next.delete(setSlug);
        return next;
      });
      clearSaveHold(setSlug);
      if (setSlug === activeSet && !reconciled.stillDirty) setDeleted(null);
      setNotice(
        reconciled.stillDirty
          ? showOwnerCheckedKeptDraftNotice(setDefinition.title)
          : showOwnerSavedNotice(setDefinition.title, data.show.status),
      );
    } catch (error) {
      if (operationStillOwned(operation)) {
        setNotice(error instanceof Error ? error.message : "The saved official list could not be checked.");
      }
    } finally {
      window.clearTimeout(deadline);
      if (ownerOperation.current === operation) {
        ownerOperation.current = null;
        if (mounted.current) setCheckingSet(null);
      }
    }
  }

  function chooseReviewedSet(choice: "saved" | "draft") {
    const candidate = setReviews[activeSet];
    if (!candidate || ownerOperation.current || reviewReadFailed[activeSet]
      || candidate.showId !== activeShow.id || candidate.showSlug !== activeShowSlug || candidate.setSlug !== activeSet
      || !readReviewedVersion(candidate.reviewedVersion)
      || officialSetRevision(candidate.songs) !== candidate.reviewedBase) return;
    let songs = candidate.songs;
    let stillDirty = false;
    if (choice === "draft") {
      const staged = stageReviewedOwnerDraft(songsBySetRef.current[activeSet], candidate.songs, activeShow.id, activeSet, () => {
        draftIdCounter.current += 1;
        return `draft-${draftIdPrefix}-${draftIdCounter.current}`;
      });
      if (!staged) { setNotice("The draft identities could not be staged safely. Keep your draft and check the saved list again."); return; }
      const reconciled = reconcileCheckedOfficialSet({ draftSongs: staged, officialSongs: candidate.songs, reviewedVersion: candidate.reviewedVersion });
      if (!reconciled) return;
      songs = reconciled.songs; stillDirty = reconciled.stillDirty;
    }
    setSongsBySet((current) => ({ ...current, [activeSet]: songs }));
    adoptSetAuthority(activeSet, candidate.reviewedBase, candidate.reviewedVersion);
    setDirtySets((current) => { const next = new Set(current); if (stillDirty) next.add(activeSet); else next.delete(activeSet); return next; });
    clearSaveHold(activeSet); setDeleted(null);
    setNotice(stillDirty ? showOwnerCheckedKeptDraftNotice(activeDefinition.title)
      : `Using the checked saved ${activeDefinition.title} list. No write was made.`);
  }

  async function saveActiveSet() {
    await saveSet(activeSet);
  }

  function addSuggestion(song: Suggestion) {
    const alreadyAdded = activeSongs.some(
      (current) =>
        current.title.toLowerCase() === song.title.toLowerCase() &&
        current.artist.toLowerCase() === song.artist.toLowerCase(),
    );
    if (alreadyAdded) {
      setNotice(`${song.title} is already in ${activeDefinition.title}.`);
      return;
    }
    void addSong(
      song.title,
      song.artist,
      `Suggested by ${song.addedBy}${song.notes ? ` / ${song.notes}` : ""}`,
      song.isOriginal,
    );
  }

  async function switchShow(slug: string) {
    if (ownerOperation.current) return;
    if (dirtySets.size && !window.confirm("Switch shows and discard unsaved changes?")) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/show?show=${encodeURIComponent(slug)}&scope=owner`, {
        cache: "no-store",
      });
      if (!verifiedOwnerResponse(response)) throw new Error("Could not verify that show's current owner data.");
      const data = (await response.json()) as {
        songs: ShowSong[];
        show: ManagedShow;
        sets?: ShowSetDefinition[];
        setWriteVersions?: unknown;
      };
      if (!showPayloadBelongsToShow(data, slug)) {
        throw new Error("That show's set could not be verified.");
      }
      const grouped = readOwnerShowSongs(data.songs, data.show.id);
      const versions = readSetWriteVersions(data.setWriteVersions);
      if (!grouped || !versions) throw new Error("That show's official lists and write versions could not be verified.");
      setSongsBySet(grouped);
      setReviewedBases(revisionsFromOfficialSets(grouped));
      setReviewedVersions(versions); retiredVersions.current = {};
      setSetReviews({}); setReviewReadFailed({});
      setSaveHolds({});
      setDeleted(null);
      setActiveShowSlug(data.show.slug);
      setShowSets(data.sets?.length ? data.sets : [...SET_DEFINITIONS]);
      setCoachSets(parseShowSets(data.sets) ?? []);
      setDirtySets(new Set());
      window.history.replaceState(null, "", `/show-control?show=${encodeURIComponent(data.show.slug)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load that show.");
    } finally {
      setLoading(false);
    }
  }

  async function cloneShow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const hasStart = Boolean(String(data.startTime ?? "").trim());
    const hasEnd = Boolean(String(data.endTime ?? "").trim());
    if (hasStart !== hasEnd) {
      setCloneHoursError("Enter both start and end times, or clear both to leave hours optional. No draft was created.");
      form.querySelector<HTMLInputElement>(`[name="${hasStart ? "endTime" : "startTime"}"]`)?.focus();
      return;
    }
    setCloneHoursError("");
    setCloning(true);
    setNotice("Cloning the show plan...");
    try {
      const response = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          sourceSlug: activeShowSlug,
          title: data.title,
          venue: data.venue,
          showDate: data.showDate,
          startTime: data.startTime,
          endTime: data.endTime,
          copySongs: data.copySongs === "on",
        }),
      });
      const result = (await response.json()) as { show?: ManagedShow; error?: string };
      if (!response.ok || !result.show) throw new Error(result.error || "Could not clone the show.");
      setShows((current) => [result.show!, ...current]);
      setCloneOpen(false);
      await switchShow(result.show.slug);
      setNotice(
        data.copySongs === "on"
          ? "New draft created. It has its own copy of the sets. The original show is unchanged. The public share link stays closed until you publish."
          : "New empty draft created. It does not inherit another show's songs, set times, or night hours. The public share link stays closed until you publish.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not clone the show.");
    } finally {
      setCloning(false);
    }
  }

  async function changeShowStatus(status: ManagedShow["status"]) {
    if (ownerOperation.current || saving || checkingSet || Object.keys(saveHolds).length || Object.keys(setReviews).length) {
      setNotice("Finish the saved-list check or review before changing this show's public link. No lifecycle change was made.");
      return;
    }
    const blocker = showStatusChangeBlockReason({
      currentStatus: activeShow.status,
      targetStatus: status,
      isDefault: activeShow.isDefault,
      dirtySetCount: dirtySets.size,
    });
    if (blocker) {
      setNotice(blocker);
      return;
    }
    if (!window.confirm(showStatusChangeConfirmation(activeShow.title, status))) return;

    setStatusChanging(status);
    setNotice(`${status === "published" ? "Publishing" : "Archiving"} ${activeShow.title}...`);
    try {
      const response = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", showSlug: activeShowSlug, status }),
      });
      const result = (await response.json()) as { show?: ManagedShow; error?: string };
      if (!response.ok || !result.show) {
        throw new Error(result.error || "Could not update show status.");
      }
      setShows((current) =>
        current.map((show) => (show.slug === result.show!.slug ? result.show! : show)),
      );
      setNotice(
        status === "published"
          ? `${activeShow.title} is public at its saved share link.`
          : `${activeShow.title} is archived. Its public share link is now closed.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update show status.");
    } finally {
      setStatusChanging(null);
    }
  }

  if (loading) {
    return <main className={styles.controlShell}><div className={styles.loadingCard}>Loading official sets...</div></main>;
  }

  if (!showVerified) {
    return (
      <main className={styles.accessPage} data-show-control="unverified">
        <section className={styles.loadFailureCard} role="alert">
          <span>Verified show required</span>
          <h1>SHOW CONTROL COULD NOT VERIFY THIS SHOW.</h1>
          <p>{notice || "The owner show payload did not load."}</p>
          <p>No Add, Save, Publish, or Archive action is available from fallback data.</p>
          <div>
            <button type="button" onClick={() => window.location.reload()}>
              Retry verified load
            </button>
            <Link href="/">Back to the public show</Link>
          </div>
        </section>
      </main>
    );
  }

  const recoveryLifecycleBlock = saving || checkingSet || Object.keys(saveHolds).length || Object.keys(setReviews).length
    ? "Finish the saved-list check or review before changing this show's public link." : null;
  const publishBlock = recoveryLifecycleBlock || showStatusChangeBlockReason({
    currentStatus: activeShow.status,
    targetStatus: "published",
    isDefault: activeShow.isDefault,
    dirtySetCount: dirtySets.size,
  });
  const archiveBlock = recoveryLifecycleBlock || showStatusChangeBlockReason({
    currentStatus: activeShow.status,
    targetStatus: "archived",
    isDefault: activeShow.isDefault,
    dirtySetCount: dirtySets.size,
  });
  const lifecycleHint = showOwnerLifecycleHint({
    currentStatus: activeShow.status,
    isDefault: activeShow.isDefault,
    dirtySetCount: dirtySets.size,
  });
  const shareHref = `/?show=${encodeURIComponent(activeShowSlug)}`;
  const shareLabel = showShareLinkLabel(activeShow.status);
  const controlPosture = buildShowControlPosture({
    status: activeShow.status,
    sets: showSets.map((set) => ({
      slug: set.slug,
      title: set.title,
      time: set.time,
      songCount: songsBySet[set.slug].length,
    })),
    dirtySetSlugs: [...dirtySets],
    heldSetSlugs: (Object.keys(saveHolds) as SetSlug[]).filter((slug) => saveHolds[slug]),
    nightHours: activeShow.hours ?? "",
    savePending: saving,
  });
  const activeSaveHold = saveHolds[activeSet] ?? null;
  const activeReview = setReviews[activeSet];
  const removedRows = activeReview ? removedDraftSongs(activeSongs, activeReview.songs) : [];
  const runShowHref = `${shareHref}&practice=1#official-sets`;

  function reviewActionLabel(action: ShowControlNextAction | ShowControlLeftoverAction) {
    return action.kind === "check-saved-set" && action.setSlug && setReviews[action.setSlug]
      && !reviewReadFailed[action.setSlug]
      ? `Review saved ${SET_DEFINITIONS.find((set) => set.slug === action.setSlug)?.title ?? "set"}`
      : action.label;
  }

  function runControlAction(action: ShowControlNextAction | ShowControlLeftoverAction) {
    if (action.kind === "check-saved-set" && action.setSlug) {
      if (setReviews[action.setSlug] && !reviewReadFailed[action.setSlug]) {
        setActiveSet(action.setSlug);
        window.requestAnimationFrame(() => { reviewRef.current?.focus({ preventScroll: true }); reviewRef.current?.scrollIntoView({ block: "start" }); });
        return;
      }
      void checkSavedSet(action.setSlug);
      return;
    }
    if (action.kind === "save-set" && action.setSlug) {
      void saveSet(action.setSlug);
      return;
    }
    if (action.kind === "add-song" && action.setSlug) {
      setActiveSet(action.setSlug);
      setDeleted(null);
      window.requestAnimationFrame(() => {
        draftTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        draftTitleRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    if (action.kind === "publish-show") {
      void changeShowStatus("published");
    }
  }

  return (
    <main className={styles.controlShell}>
      <header className={styles.controlTopbar}>
        <Link className={styles.controlBrand} href="/">
          <span>RD</span>
          <div><strong>SHOW CONTROL</strong><small>RAD DAD + FRIENDS</small></div>
        </Link>
        <div className={styles.ownerStrip}>
          <span className={styles.privateBadge}>Owner only</span>
          <span className={styles.ownerName}>{userName}</span>
          <a href={shareHref} target="_blank" rel="noreferrer">{shareLabel}</a>
          <a href={signOutHref}>Sign out</a>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.controlIntro}>
          <div>
            <p className={styles.controlKicker}>
              {activeShow.showDate} / {activeShow.venue}
            </p>
            <p
              className={styles.showHours}
              data-show-hours={activeShow.hours ? "set" : "unset"}
            >
              {activeShow.hours
                ? showHoursLabel(activeShow.hours)
                : "Hours not set for this night. Another show's start or wrap will not appear here."}
            </p>
            <h1>BUILD THE NIGHT.</h1>
            <p>
              Reorder by dragging or using Move. Open Details for keys, cues,
              a YouTube link, and rehearsal notes. Saving a set writes this
              show&apos;s official list. Publishing is what opens the public
              share link.
            </p>
          </div>
          <div className={styles.controlStats}>
            <div><strong>{totalSongs}</strong><span>Total songs</span></div>
            <div><strong>{dirtySets.size}</strong><span>Sets changed</span></div>
          </div>
        </section>

        <section className={styles.showManager}>
          <div className={styles.showSelect}>
            <label htmlFor="show-picker">Editing show</label>
            <select
              id="show-picker"
              value={activeShowSlug}
              disabled={Boolean(statusChanging) || saving || Boolean(checkingSet)}
              onChange={(event) => void switchShow(event.target.value)}
            >
              {shows.map((show) => (
                <option value={show.slug} key={show.id}>
                  {show.showDate} - {show.venue} ({showStatusBadge(show.status, show.isDefault)})
                </option>
              ))}
            </select>
          </div>
          <span className={styles.showStatus} data-status={activeShow.status}>
            {showStatusBadge(activeShow.status, activeShow.isDefault)}
          </span>
          <div className={styles.showActions}>
            <a
              href={shareHref}
              target="_blank"
              rel="noreferrer"
              data-share-open={activeShow.status === "published" ? "true" : "false"}
            >
              {shareLabel}
            </a>
            <button
              type="button"
              onClick={() => { setCloneHoursError(""); setCloneOpen((value) => !value); }}
              disabled={Boolean(statusChanging)}
            >
              Clone show
            </button>
            {activeShow.status !== "published" ? (
              <button
                type="button"
                onClick={() => void changeShowStatus("published")}
                disabled={Boolean(publishBlock) || Boolean(statusChanging)}
                aria-describedby="show-lifecycle-hint"
                title={publishBlock || "Open this show's saved public share link"}
              >
                {statusChanging === "published" ? "Publishing..." : "Publish saved show"}
              </button>
            ) : null}
            {activeShow.status !== "archived" ? (
              <button
                type="button"
                onClick={() => void changeShowStatus("archived")}
                disabled={Boolean(archiveBlock) || Boolean(statusChanging)}
                aria-describedby="show-lifecycle-hint"
                title={archiveBlock || "Close this show's public share link"}
              >
                {statusChanging === "archived" ? "Archiving..." : "Archive show"}
              </button>
            ) : null}
          </div>
          <p className={styles.lifecycleHint} id="show-lifecycle-hint" role="status">
            {lifecycleHint}
          </p>
        </section>

        <section
          className={styles.postureDeck}
          aria-labelledby="show-posture-title"
          data-next-action={controlPosture.nextAction.kind}
        >
          <header className={styles.postureHeader}>
            <div>
              <span>Show status at a glance</span>
              <h2 id="show-posture-title">KNOW WHAT IS LIVE. DO ONE NEXT THING.</h2>
            </div>
            <small>{activeShow.title} · {activeShow.showDate}</small>
          </header>
          <div className={styles.postureGrid}>
            {[controlPosture.publicLink, controlPosture.setPlan, controlPosture.booking].map((item) => (
              <article className={styles.postureItem} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
            <article className={styles.nextActionCard}>
              <span>One next step</span>
              <strong>{controlPosture.nextAction.title}</strong>
              <p>{controlPosture.nextAction.detail}</p>
              {controlPosture.nextAction.kind === "run-show" ? (
                <a className={styles.nextActionControl} href={runShowHref} target="_blank" rel="noreferrer">
                  Open band run mode
                </a>
              ) : controlPosture.nextAction.kind === "none" ? (
                <span className={styles.noSafeAction}>No safe action until the set plan verifies</span>
              ) : (
                <button
                  className={styles.nextActionControl}
                  type="button"
                  onClick={() => runControlAction(controlPosture.nextAction)}
                  disabled={
                    saving ||
                    Boolean(checkingSet) ||
                    Boolean(statusChanging) ||
                    (controlPosture.nextAction.kind === "publish-show" && Boolean(publishBlock))
                  }
                >
                  {checkingSet && controlPosture.nextAction.kind === "check-saved-set"
                    ? "Checking..."
                    : saving && controlPosture.nextAction.kind === "save-set"
                      ? "Saving..."
                      : reviewActionLabel(controlPosture.nextAction)}
                </button>
              )}
              {controlPosture.nextAction.kind !== "none" ? (
                <div
                  className={styles.leftoverWork}
                  data-leftover-count={controlPosture.leftoverActions.length}
                  aria-labelledby="leftover-work-title"
                >
                  <span id="leftover-work-title">Leftover on this show</span>
                  {controlPosture.leftoverActions.length ? (
                    <>
                      <p>
                        Remaining work on this verified night. Another show&apos;s
                        songs or times will not be borrowed.
                      </p>
                      <ul className={styles.leftoverList} data-leftover-list="true">
                        {controlPosture.leftoverActions.map((action) => (
                          <li
                            key={`${action.kind}-${action.setSlug ?? action.label}`}
                            data-leftover-kind={action.kind}
                            data-leftover-set={action.setSlug ?? ""}
                          >
                            <strong>{action.title}</strong>
                            <p>{action.detail}</p>
                            {action.kind === "see-share-link" ? (
                              <a
                                className={styles.leftoverControl}
                                href={shareHref}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {action.label}
                              </a>
                            ) : (
                              <button
                                className={styles.leftoverControl}
                                type="button"
                                onClick={() => runControlAction(action)}
                                disabled={saving || Boolean(checkingSet) || Boolean(statusChanging)}
                              >
                                {checkingSet === action.setSlug && action.kind === "check-saved-set"
                                  ? "Checking leftover..."
                                  : saving && action.kind === "save-set"
                                    ? "Saving leftover..."
                                    : reviewActionLabel(action)}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p data-leftover-empty="true">No leftover work on this verified show.</p>
                  )}
                </div>
              ) : null}
            </article>
          </div>
        </section>

        {cloneOpen ? (
          <form className={styles.clonePanel} onSubmit={cloneShow} onInput={() => setCloneHoursError("")}>
            <div>
              <strong>Clone this show</strong>
              <span>The original show is unchanged. The new draft stays private until you publish. Uncheck the box to start an empty night that does not inherit songs, set times, or night hours. Enter both start and end to set this night&apos;s hours, or leave both blank.</span>
            </div>
            <input name="title" defaultValue={activeShow.title} aria-label="New show title" required />
            <input name="venue" defaultValue={activeShow.venue} aria-label="New show venue" required />
            <input name="showDate" type="date" aria-label="New show date" required />
            <button type="submit" disabled={cloning}>{cloning ? "Cloning..." : "Create draft"}</button>
            <div className={styles.cloneHours}>
              <input name="startTime" aria-label="New show start time" placeholder="Start time (optional)" autoComplete="off" />
              <input name="endTime" aria-label="New show end time" placeholder="End time (optional)" autoComplete="off" />
            </div>
            {cloneHoursError ? <p role="alert">{cloneHoursError}</p> : null}
            <label className={styles.cloneCopyChoice}>
              <input name="copySongs" type="checkbox" defaultChecked />
              <span>Copy official songs and set times into the draft</span>
            </label>
          </form>
        ) : null}

        <nav className={styles.setTabs} aria-label="Choose a set to edit">
          {SET_DEFINITIONS.map((set) => {
            const liveTime = showSets.find((item) => item.slug === set.slug)?.time;
            return (
            <button
              className={activeSet === set.slug ? styles.activeTab : ""}
              data-accent={set.accent}
              data-leftover={
                dirtySets.has(set.slug)
                  ? "unsaved"
                  : songsBySet[set.slug].length === 0
                    ? "empty"
                    : undefined
              }
              type="button"
              disabled={saving || Boolean(checkingSet)}
              key={set.slug}
              onClick={() => {
                setActiveSet(set.slug);
                setDeleted(null);
                setNotice("");
              }}
            >
              <span>{set.kicker}</span>
              <strong>{set.title}</strong>
              <small>
                {songsBySet[set.slug].length} songs
                {liveTime ? ` / ${liveTime}` : ""}
                {dirtySets.has(set.slug) ? " / unsaved" : ""}
              </small>
            </button>
            );
          })}
        </nav>

        <div className={styles.controlGrid}>
          <section className={styles.editorPanel}>
            <header className={styles.editorHeader}>
              <div>
                <span>{activeSetTime}</span>
                <h2>{activeDefinition.title}</h2>
              </div>
              <span className={styles.liveState} data-status={activeShow.status}>
                {showEditorLiveState({
                  status: activeShow.status,
                  setDirty: dirtySets.has(activeSet),
                })}
              </span>
            </header>

            {activeReview ? (
              <section className={styles.setReview} aria-label="Saved set comparison" tabIndex={-1}
                ref={reviewRef} data-testid="owner-set-review" data-review-set={activeSet}>
                <h3>Review saved {activeDefinition.title}</h3>
                <p className={styles.reviewIntro}>
                  The saved list differs from your browser draft. Both are shown in order; differing cues and resources appear below each song.
                  Nothing has been overwritten. Your edits below stay in this browser until a separate Save.
                </p>
                {reviewReadFailed[activeSet] ? <p className={styles.reviewWarning} role="alert">The latest check was not verified. This earlier comparison is not current. Check again before choosing.</p> : null}
                <div className={styles.reviewColumns}>
                  <ReviewSongList label="Checked saved list" songs={activeReview.songs} otherSongs={activeSongs} />
                  <ReviewSongList label="Your browser draft" songs={activeSongs} otherSongs={activeReview.songs} />
                </div>
                <p className={styles.reviewWarning}>
                  <strong>Keep my draft is a whole-set replacement, not a merge.</strong> A later Save replaces the checked saved order and removes songs that are only in that saved list.
                  {activeShow.status === "published" ? " This show is published, so that later Save changes its public set." : " This show remains private unless separately published."}
                </p>
                {removedRows.length ? <p className={styles.reviewWarning} data-testid="owner-recreate-warning">
                  These draft songs no longer exist in the saved list: <strong>{removedRows.map((song) => song.title).join("; ")}</strong>.
                  Keeping your draft will stage them as new songs for the later Save. Their old song identities and run positions cannot be restored.
                </p> : null}
                <p className={styles.reviewHint}>Use saved list discards this set&apos;s browser edits. Neither choice writes anything; keeping a different draft still requires Save.</p>
                <div className={styles.reviewActions}>
                  <button type="button" disabled={Boolean(checkingSet) || saving || Boolean(reviewReadFailed[activeSet])} onClick={() => chooseReviewedSet("saved")}>Use saved list</button>
                  <button type="button" disabled={Boolean(checkingSet) || saving || Boolean(reviewReadFailed[activeSet])} onClick={() => chooseReviewedSet("draft")}>Keep my draft</button>
                  <button type="button" disabled={Boolean(checkingSet) || saving} onClick={() => void checkSavedSet(activeSet)}>{checkingSet === activeSet ? "Checking..." : `Check saved ${activeDefinition.title}`}</button>
                </div>
              </section>
            ) : null}

            <form className={styles.composer} onSubmit={addFromComposer}>
              <div className={styles.composerTitle}>
                <span>+</span>
                <div><strong>Add a song</strong><small>It goes to the bottom and finds YouTube.</small></div>
              </div>
              <input
                id="new-song-title"
                ref={draftTitleRef}
                aria-label="New song title"
                placeholder="Song title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                required
              />
              <input
                aria-label="New song artist"
                placeholder="Artist"
                value={draftArtist}
                onChange={(event) => setDraftArtist(event.target.value)}
              />
              <button type="submit">Add + find</button>
            </form>

            <SetCoach
              showId={activeShow.id}
              showSlug={activeShowSlug}
              showTitle={`${activeShow.title} at ${activeShow.venue}`}
              setSlug={activeSet}
              setTitle={activeDefinition.title}
              setTime={activeCoachSets.length === 1 ? activeCoachSets[0].time : ""}
              songs={activeSongs}
            />

            <section className={styles.publicSetReview} aria-label="Public list review" data-testid="owner-public-set-review">
              <span>Public list for this draft</span>
              <strong>{activeDefinition.title}</strong>
              <p>{ownerPublicSetReview(activeSongs).summary}</p>
            </section>

            <div className={styles.songEditorList}>
              {activeSongs.map((song, index) => {
                const searches = buildSongResourceLinks(song.title, song.artist);
                const publicReview = ownerPublicSongReview(song);
                const videoId = song.youtubeVideoId || getYouTubeVideoId(song.youtubeUrl);
                const isEnriching = enriching === String(song.id);
                return (
                  <article
                    className={styles.songEditorCard}
                    data-transition={song.transition ? "true" : "false"}
                    key={song.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex.current !== null) moveSong(dragIndex.current, index);
                      dragIndex.current = null;
                    }}
                  >
                    <div
                      className={styles.dragHandle}
                      draggable
                      onDragStart={() => { dragIndex.current = index; }}
                      onDragEnd={() => { dragIndex.current = null; }}
                      title="Drag to reorder"
                    >
                      ||
                    </div>
                    <span className={styles.editorPosition}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.songEditorMain}>
                      <div className={styles.primaryFields}>
                        <label>
                          <span>Song</span>
                          <input value={song.title} onChange={(event) => updateSong(song.id, { title: event.target.value })} />
                        </label>
                        <label>
                          <span>Artist</span>
                          <input value={song.artist} onChange={(event) => updateSong(song.id, { artist: event.target.value })} />
                        </label>
                      </div>

                      <div className={styles.quickTools}>
                        <button type="button" onClick={() => moveSong(index, index - 1)} disabled={index === 0}>Move up</button>
                        <button type="button" onClick={() => moveSong(index, index + 1)} disabled={index === activeSongs.length - 1}>Move down</button>
                        <label className={styles.flowToggle}>
                          <input type="checkbox" checked={song.transition} onChange={(event) => updateSong(song.id, { transition: event.target.checked })} />
                          <span>Flows to next {"\u2192"}</span>
                        </label>
                        <label className={styles.flowToggle}>
                          <input
                            type="checkbox"
                            checked={song.isOriginal}
                            onChange={(event) =>
                              updateSong(song.id, {
                                isOriginal: event.target.checked,
                                youtubeUrl: event.target.checked ? "" : song.youtubeUrl,
                                youtubeVideoId: event.target.checked ? "" : song.youtubeVideoId,
                                lyricsUrl: event.target.checked ? "" : song.lyricsUrl,
                              })
                            }
                          />
                          <span>Original / hide resources</span>
                        </label>
                        {!song.isOriginal && videoId ? <button type="button" onClick={() => setPreview({ ...song, youtubeVideoId: videoId })}>Preview video</button> : null}
                        {publicReview.youtubeOwnerLabel ? <a href={publicReview.youtubeOwnerHref} target="_blank" rel="noreferrer">{publicReview.youtubeOwnerLabel}</a> : null}
                        {publicReview.lyricsOwnerLabel ? <a href={publicReview.lyricsOwnerHref} target="_blank" rel="noreferrer">{publicReview.lyricsOwnerLabel}</a> : null}
                      </div>
                      <p className={styles.publicSongReview} data-kind={publicReview.kind} data-testid="owner-public-song-review">
                        {publicReview.summary}
                      </p>

                      <details className={styles.songDetailsEditor}>
                        <summary>Details, song resources, and rehearsal notes</summary>
                        <div className={styles.detailGrid}>
                          <label className={styles.wideField}>
                            <span>Performance cue</span>
                            <input value={song.performanceNote} onChange={(event) => updateSong(song.id, { performanceNote: event.target.value })} placeholder="Guest vocal, guitar handoff, count-in, ending..." />
                          </label>
                          <label>
                            <span>Key</span>
                            <input value={song.songKey} onChange={(event) => updateSong(song.id, { songKey: event.target.value })} placeholder="e.g. E major" />
                          </label>
                          <label>
                            <span>Tuning</span>
                            <input value={song.tuning} onChange={(event) => updateSong(song.id, { tuning: event.target.value })} placeholder="e.g. Eb standard" />
                          </label>
                          <label>
                            <span>Estimated minutes</span>
                            <input
                              type="number"
                              min="0.5"
                              max="20"
                              step="0.25"
                              value={Math.round((song.durationSeconds / 60) * 100) / 100}
                              onChange={(event) =>
                                updateSong(song.id, {
                                  durationSeconds: Math.round(Number(event.target.value) * 60),
                                })
                              }
                            />
                          </label>
                          {!song.isOriginal ? (
                            <>
                              <label className={styles.wideField}>
                                <span>YouTube video</span>
                                <div className={styles.urlField}>
                                  <input value={song.youtubeUrl} onChange={(event) => updateSong(song.id, { youtubeUrl: event.target.value, youtubeVideoId: getYouTubeVideoId(event.target.value) })} placeholder="Paste a YouTube link" />
                                  <button type="button" onClick={() => findResources(song)} disabled={isEnriching}>{isEnriching ? "Finding..." : "Find resources"}</button>
                                  {!videoId ? <a href={searches.youtubeSearchUrl} target="_blank" rel="noreferrer">Search</a> : null}
                                </div>
                              </label>
                              <label className={styles.wideField}>
                                <span>Lyrics link</span>
                                <input value={song.lyricsUrl} onChange={(event) => updateSong(song.id, { lyricsUrl: event.target.value })} placeholder="Paste the preferred lyrics page" />
                              </label>
                            </>
                          ) : null}
                          <label className={styles.wideField}>
                            <span>Our rehearsal notes</span>
                            <textarea rows={4} value={song.rehearsalNotes} onChange={(event) => updateSong(song.id, { rehearsalNotes: event.target.value })} placeholder="Structure, stops, harmony, solo length, special ending..." />
                          </label>
                        </div>
                      </details>
                    </div>
                    <button className={styles.deleteButton} type="button" onClick={() => removeSong(index)}>Remove</button>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.suggestionInbox} aria-label="Suggestion inbox">
            <div className={styles.inboxHeader}>
              <span>Suggestion inbox</span>
              <strong>{suggestionsVerified ? suggestions.length : "—"}</strong>
            </div>
            <p>Ideas from the public board. Adding one only changes your draft until you save.</p>
            <div className={styles.inboxList}>
              {suggestionsLoading ? <span className={styles.inboxEmpty}>Loading ideas...</span> : null}
              {suggestionsError ? (
                <p className={styles.inboxEmpty} role="status">
                  Suggestion inbox unavailable. {suggestionsVerified ? "Keeping the last checked ideas. Refresh before adding one." : "We cannot check whether there are new ideas yet."}
                </p>
              ) : null}
              {!suggestionsLoading && !suggestionsError && suggestionsVerified && !suggestions.length ? <span className={styles.inboxEmpty}>No suggestions yet.</span> : null}
              <button className={styles.inboxRefresh} type="button" disabled={suggestionsLoading} onClick={() => {
                setSuggestionsLoading(true);
                setSuggestionsRefresh((version) => version + 1);
              }}>Refresh suggestions</button>
              {suggestions.slice(0, 12).map((song) => (
                <article className={styles.inboxSong} key={song.id}>
                  <div><strong>{song.title}</strong><span>{song.artist || "Artist not listed"}{song.isOriginal ? " / Original" : ""}</span></div>
                  <p>By {song.addedBy}{song.notes ? ` / ${song.notes}` : ""}</p>
                  <button type="button" disabled={suggestionsLoading || suggestionsError} onClick={() => addSuggestion(song)}>Add to {activeDefinition.title}</button>
                </article>
              ))}
            </div>
            <div className={styles.ownerNote}>
              <strong>Signed in as</strong>
              <span>{userEmail}</span>
            </div>
          </aside>
        </div>
      </div>

      <div
        className={styles.saveDock}
        data-save-hold={activeSaveHold ?? ""}
        data-save-hold-set={activeSaveHold ? activeSet : ""}
      >
        <div>
          <span className={dirtySets.has(activeSet) || activeSaveHold ? styles.unsavedDot : styles.savedDot} />
          <p>{notice || showOwnerReadyNotice(activeShow.status)}</p>
        </div>
        <div className={styles.saveActions}>
          {canApplyUndoRemove(deleted, activeShowSlug, activeSet) ? (
            <button type="button" onClick={undoDelete}>Undo remove</button>
          ) : null}
          {activeSaveHold ? (
            <button
              className={styles.checkSavedButton}
              type="button"
              onClick={() => void checkSavedSet(activeSet)}
              disabled={Boolean(checkingSet) || saving}
            >
              {checkingSet === activeSet ? "Checking..." : `Check saved ${activeDefinition.title}`}
            </button>
          ) : null}
          <button
            className={styles.saveButton}
            type="button"
            onClick={saveActiveSet}
            disabled={saving || Boolean(checkingSet) || Boolean(activeSaveHold) || !dirtySets.has(activeSet)}
          >
            {saving ? "Saving..." : `Save ${activeDefinition.title}`}
          </button>
        </div>
      </div>

      {preview?.youtubeVideoId ? (
        <div className={styles.previewBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`${preview.title} video preview`}>
            <div className={styles.previewTop}><div><span>Video preview</span><strong>{preview.title}</strong></div><button type="button" onClick={() => setPreview(null)}>Close</button></div>
            <div className={styles.previewFrame}><iframe src={getYouTubeEmbedUrl(preview.youtubeVideoId)} title={`${preview.title} video`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ReviewSongList({ label, songs, otherSongs }: { label: string; songs: ShowSong[]; otherSongs: ShowSong[] }) {
  return <section className={styles.reviewList} aria-label={label}>
    <h4>{label}</h4>
    {!songs.length ? <p>No songs in this list.</p> : <ol>{songs.map((song) => {
      const other = otherSongs.find((row) => row.id === song.id);
      const details = ownerSongReviewDetails(song, other);
      return <li key={song.id}>
        <strong>{song.title}</strong><span>{song.artist || "Artist not recorded"}</span>
        {!other ? <small>Only in this list</small> : null}
        <small>{ownerPublicSongReview(song).summary}</small>
        {details.length ? <dl>{details.map(({ label: fieldLabel, text }) => <div key={fieldLabel}><dt>{fieldLabel}</dt><dd>{text}</dd></div>)}</dl> : <small>Other details match</small>}
      </li>;
    })}</ol>}
  </section>;
}
