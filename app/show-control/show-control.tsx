"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  SET_DEFINITIONS,
  SHOW_DETAILS,
  type ManagedShow,
  type SetSlug,
  type ShowSong,
} from "../../lib/show-data";
import { showPayloadBelongsToShow, type ShowSetDefinition } from "../../lib/show-read-integrity";
import {
  buildSongResourceLinks,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  savedOfficialMediaUrl,
} from "../../lib/song-resources";
import {
  showEditorLiveState,
  showOwnerDirtyNotice,
  showOwnerLifecycleHint,
  showOwnerReadyNotice,
  showOwnerSavedNotice,
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
import type { Suggestion } from "../song-board";
import { parseSuggestionFeedPayload } from "../../lib/suggestion-board";
import styles from "./show-control.module.css";

type SongMap = Record<SetSlug, ShowSong[]>;
type DeletedSong = { song: ShowSong; index: number } | null;
type CoachResult = {
  source: "smart-check" | "openai";
  score: number;
  estimatedMinutes: number;
  scheduledMinutes: number;
  findings: Array<{
    tone: "good" | "watch" | "action";
    title: string;
    detail: string;
  }>;
  aiNotes: string;
};

const emptySongMap = (): SongMap => ({
  "jeff-story-friends": [],
  stalemate: [],
  "rad-dad": [],
});

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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsVerified, setSuggestionsVerified] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsRefresh, setSuggestionsRefresh] = useState(0);
  const [shows, setShows] = useState<ManagedShow[]>([]);
  const [activeShowSlug, setActiveShowSlug] = useState<string>(SHOW_DETAILS.slug);
  const [showSets, setShowSets] = useState<ShowSetDefinition[]>([...SET_DEFINITIONS]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coaching, setCoaching] = useState(false);
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
      fetch(`/api/show?show=${encodeURIComponent(requestedShow)}`, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Could not load the official sets.");
        return response.json() as Promise<{
          songs: ShowSong[];
          show: ManagedShow;
          sets?: ShowSetDefinition[];
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
        setSongsBySet(groupSongs(showData.songs));
        setShows(showList.shows ?? [showData.show]);
        setActiveShowSlug(showData.show.slug);
        if (showData.sets?.length) setShowSets(showData.sets);
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
    setDeleted({ song, index });
    replaceSet(
      activeSet,
      activeSongs.filter((_, songIndex) => songIndex !== index),
    );
  }

  function undoDelete() {
    if (!deleted) return;
    const restored = [...activeSongs];
    restored.splice(Math.min(deleted.index, restored.length), 0, deleted.song);
    replaceSet(activeSet, restored);
    setDeleted(null);
  }

  async function saveSet(setSlug: SetSlug) {
    const setDefinition =
      showSets.find((set) => set.slug === setSlug) ??
      SET_DEFINITIONS.find((set) => set.slug === setSlug)!;
    setSaving(true);
    setNotice(showOwnerSavingNotice(setDefinition.title, activeShow.status));
    try {
      const response = await fetch("/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showSlug: activeShowSlug,
          setSlug,
          songs: songsBySet[setSlug],
        }),
      });
      const result = (await response.json()) as { error?: string; songs?: ShowSong[] };
      if (!response.ok || !result.songs) {
        throw new Error(result.error || "The set could not be saved.");
      }
      setSongsBySet((current) => ({ ...current, [setSlug]: result.songs! }));
      setDirtySets((current) => {
        const next = new Set(current);
        next.delete(setSlug);
        return next;
      });
      if (setSlug === activeSet) setDeleted(null);
      setNotice(showOwnerSavedNotice(setDefinition.title, activeShow.status));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The set could not be saved.");
    } finally {
      setSaving(false);
    }
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
    if (dirtySets.size && !window.confirm("Switch shows and discard unsaved changes?")) return;
    setLoading(true);
    setNotice("");
    setCoach(null);
    try {
      const response = await fetch(`/api/show?show=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load that show.");
      const data = (await response.json()) as {
        songs: ShowSong[];
        show: ManagedShow;
        sets?: ShowSetDefinition[];
      };
      if (!showPayloadBelongsToShow(data, slug)) {
        throw new Error("That show's set could not be verified.");
      }
      setSongsBySet(groupSongs(data.songs));
      setActiveShowSlug(data.show.slug);
      setShowSets(data.sets?.length ? data.sets : [...SET_DEFINITIONS]);
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
    setCloning(true);
    setNotice("Cloning the show plan...");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const response = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          sourceSlug: activeShowSlug,
          title: data.title,
          venue: data.venue,
          showDate: data.showDate,
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
          : "New empty draft created. It does not inherit another show's songs or set times. The public share link stays closed until you publish.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not clone the show.");
    } finally {
      setCloning(false);
    }
  }

  async function changeShowStatus(status: ManagedShow["status"]) {
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

  async function runCoach() {
    setCoaching(true);
    setNotice("Set Coach is reviewing the active set...");
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showTitle: `${activeShow.title} at ${activeShow.venue}`,
          setSlug: activeSet,
          songs: activeSongs,
        }),
      });
      const result = (await response.json()) as CoachResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "Set Coach could not run.");
      setCoach(result);
      setNotice(
        result.source === "openai"
          ? "AI Set Coach review is ready."
          : "Set timing and readiness check is ready.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Set Coach could not run.");
    } finally {
      setCoaching(false);
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

  const publishBlock = showStatusChangeBlockReason({
    currentStatus: activeShow.status,
    targetStatus: "published",
    isDefault: activeShow.isDefault,
    dirtySetCount: dirtySets.size,
  });
  const archiveBlock = showStatusChangeBlockReason({
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
  });
  const runShowHref = `${shareHref}&practice=1#official-sets`;

  function runControlAction(action: ShowControlNextAction | ShowControlLeftoverAction) {
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
              disabled={Boolean(statusChanging) || saving}
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
              onClick={() => setCloneOpen((value) => !value)}
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
                    Boolean(statusChanging) ||
                    (controlPosture.nextAction.kind === "publish-show" && Boolean(publishBlock))
                  }
                >
                  {saving && controlPosture.nextAction.kind === "save-set"
                    ? "Saving..."
                    : controlPosture.nextAction.label}
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
                                disabled={saving || Boolean(statusChanging)}
                              >
                                {saving && action.kind === "save-set"
                                  ? "Saving leftover..."
                                  : action.label}
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
          <form className={styles.clonePanel} onSubmit={cloneShow}>
            <div>
              <strong>Clone this show</strong>
              <span>The original show is unchanged. The new draft stays private until you publish. Uncheck the box to start an empty night that does not inherit songs or set times.</span>
            </div>
            <input name="title" defaultValue={activeShow.title} aria-label="New show title" required />
            <input name="venue" defaultValue={activeShow.venue} aria-label="New show venue" required />
            <input name="showDate" type="date" aria-label="New show date" required />
            <button type="submit" disabled={cloning}>{cloning ? "Cloning..." : "Create draft"}</button>
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
              disabled={saving}
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

            <section className={styles.coachPanel}>
              <div>
                <span>SET COACH</span>
                <strong>Timing, pacing, and readiness</strong>
                <p>Reviews only this active set and never changes the order.</p>
              </div>
              <button type="button" onClick={runCoach} disabled={coaching || !activeSongs.length}>
                {coaching ? "Reviewing..." : "Review this set"}
              </button>
            </section>

            {coach ? (
              <section className={styles.coachResult}>
                <header>
                  <strong>{coach.score}/100</strong>
                  <span>
                    {coach.estimatedMinutes} estimated / {coach.scheduledMinutes} scheduled minutes
                  </span>
                  <small>{coach.source === "openai" ? "AI review" : "Smart set check"}</small>
                </header>
                <div className={styles.coachFindings}>
                  {coach.findings.map((finding) => (
                    <article data-tone={finding.tone} key={finding.title}>
                      <strong>{finding.title}</strong>
                      <p>{finding.detail}</p>
                    </article>
                  ))}
                </div>
                {coach.aiNotes ? <p className={styles.aiNotes}>{coach.aiNotes}</p> : null}
              </section>
            ) : null}

            <div className={styles.songEditorList}>
              {activeSongs.map((song, index) => {
                const searches = buildSongResourceLinks(song.title, song.artist);
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
                        {!song.isOriginal ? <a href={song.youtubeUrl || searches.youtubeSearchUrl} target="_blank" rel="noreferrer">Open YouTube</a> : null}
                        {!song.isOriginal ? <a href={song.lyricsUrl || searches.lyricsSearchUrl} target="_blank" rel="noreferrer">Open lyrics</a> : null}
                      </div>

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

      <div className={styles.saveDock}>
        <div>
          <span className={dirtySets.has(activeSet) ? styles.unsavedDot : styles.savedDot} />
          <p>{notice || showOwnerReadyNotice(activeShow.status)}</p>
        </div>
        <div className={styles.saveActions}>
          {deleted ? <button type="button" onClick={undoDelete}>Undo remove</button> : null}
          <button className={styles.saveButton} type="button" onClick={saveActiveSet} disabled={saving || !dirtySets.has(activeSet)}>
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

function groupSongs(songs: ShowSong[]): SongMap {
  const grouped = emptySongMap();
  for (const song of songs) grouped[song.setSlug].push(song);
  for (const key of Object.keys(grouped) as SetSlug[]) {
    grouped[key].sort((a, b) => a.position - b.position);
  }
  return grouped;
}
