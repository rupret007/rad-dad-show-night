"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { type ShowSong } from "../lib/show-data";
import {
  isSearchResourceUrl,
  publicSongResourceActions,
} from "../lib/song-resources";
import {
  canAcceptVerifiedShowPayload,
  createStoredShowSnapshot,
  formatShowTimestamp,
  offlineReadyKey,
  parseShowSets,
  parseStoredShowSnapshot,
  showSnapshotKey,
  songsBelongToShow,
  type ShowDataSource,
  type ShowDisplaySource,
  type ShowSetDefinition,
} from "../lib/show-read-integrity";
import { practicePositionKey } from "../lib/show-night-use";
import { resolveRunPosition } from "../lib/run-position";
import { visibleOfficialSets } from "../lib/show-public";
import styles from "./show-page.module.css";

export function SharePageButton({
  label = "Share this page",
  title = "Rad Dad + Friends Show Night",
  text = "Run of show and live set lists for September 19, 2026.",
}: {
  label?: string;
  title?: string;
  text?: string;
}) {
  const [status, setStatus] = useState("");

  async function sharePage() {
    const details = {
      title,
      text,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(details);
        setStatus("Shared");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setStatus("Link copied");
      }
    } catch {
      setStatus("");
    }
    window.setTimeout(() => setStatus(""), 2200);
  }

  return (
    <button className={styles.secondaryAction} type="button" onClick={sharePage}>
      {status || label}
    </button>
  );
}

type LiveSetListsProps = {
  initialSongs: ShowSong[];
  initialSets: ShowSetDefinition[];
  initialDataSource: ShowDataSource;
  showSlug: string;
  showId?: string;
  practiceMode?: boolean;
};

// A client navigation to another night must retire the old read and position,
// including when the router reuses this component without supplying a key.
export default function LiveSetLists(props: LiveSetListsProps) {
  return <ShowLiveSetLists key={JSON.stringify([props.showSlug, props.showId ?? null])} {...props} />;
}

const LIVE_READ_DEADLINE_MS = 10_000;

async function readBeforeAbort<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new Error("Read interrupted");
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Read interrupted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // Includes the response body. An ignored abort cannot leave the UI stuck
    // or allow its eventual completion to replace a later verified list.
    return await Promise.race([read(), interrupted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function ShowLiveSetLists({
  initialSongs,
  initialSets,
  initialDataSource,
  showSlug,
  showId,
  practiceMode = false,
}: LiveSetListsProps) {
  const [songs, setSongs] = useState(initialSongs);
  const [sets, setSets] = useState(initialSets);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [requiresManualChoice, setRequiresManualChoice] = useState(false);
  const [wakeStatus, setWakeStatus] = useState<"off" | "on" | "unsupported">("off");
  const [isOnline, setIsOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const [liveDataAvailable, setLiveDataAvailable] = useState(
    initialDataSource === "database",
  );
  const [displaySource, setDisplaySource] =
    useState<ShowDisplaySource>(initialDataSource);
  const [resourceNotice, setResourceNotice] = useState("");
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshSavedList = useRef<() => void>(() => undefined);
  const verifiedReadReceived = useRef(initialDataSource === "database");
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [updatedAt, setUpdatedAt] = useState(
    initialSongs.reduce(
      (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
      "",
    ),
  );

  useEffect(() => {
    let active = true;
    let inFlight: { controller: AbortController; deadline: ReturnType<typeof setTimeout> } | null = null;

    function markLiveDataUnavailable() {
      if (!active) return;
      setLiveDataAvailable(false);
      setDisplaySource((current) =>
        current === "confirmed-fallback" ? current : "saved-snapshot",
      );
    }

    async function refresh() {
      if (!active || inFlight) return;
      const controller = new AbortController();
      const request = {
        controller,
        deadline: setTimeout(() => controller.abort(), LIVE_READ_DEADLINE_MS),
      };
      inFlight = request;
      setRefreshing(true);
      try {
        const { data, servedOffline } = await readBeforeAbort(controller.signal, async () => {
          const response = await fetch(
            `/api/show?show=${encodeURIComponent(showSlug)}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error("The saved set is unavailable");
          const data = (await response.json()) as {
            songs?: ShowSong[];
            updatedAt?: string;
            dataSource?: ShowDataSource;
            show?: { slug?: string; id?: string };
            sets?: unknown;
          };
          return { data, servedOffline: response.headers.get("x-rad-dad-offline") === "1" };
        });
        if (!active || inFlight !== request || controller.signal.aborted) return;

        setIsOnline(navigator.onLine && !servedOffline);
        const responseShowId = typeof data?.show?.id === "string" ? data.show.id : "";
        const nextSets = parseShowSets(data?.sets);
        const normalized = data && Array.isArray(data.songs)
          && data.songs.every((song) => song && typeof song === "object"
            && typeof song.isOriginal === "boolean" && typeof song.transition === "boolean")
          && responseShowId
          && (!showId || responseShowId === showId)
          && canAcceptVerifiedShowPayload(data, showSlug)
          ? parseStoredShowSnapshot(JSON.stringify(createStoredShowSnapshot(
            showSlug, data.songs, data.updatedAt ?? "", new Date().toISOString(), responseShowId,
          )), showSlug)
          : null;
        const setSlugs = new Set(nextSets?.map((set) => set.slug));
        if (!normalized || !nextSets || setSlugs.size !== nextSets.length
          || normalized.showId !== responseShowId
          || normalized.songs.some((song) => song.showId !== responseShowId || !setSlugs.has(song.setSlug))) {
          markLiveDataUnavailable();
          return;
        }
        if (servedOffline && verifiedReadReceived.current) {
          // A cached response is useful at first open, but must never rewind
          // a fresher live list already accepted in this page session.
          markLiveDataUnavailable();
          return;
        }
        if (!servedOffline) verifiedReadReceived.current = true;
        setSongs(normalized.songs);
        setSets(nextSets);
        setUpdatedAt(normalized.updatedAt);
        setLiveDataAvailable(!servedOffline);
        setDisplaySource(servedOffline ? "saved-snapshot" : "database");
      } catch {
        // Keep the last verified set visible if a refresh is interrupted.
        if (active && inFlight === request) {
          setIsOnline(navigator.onLine);
          markLiveDataUnavailable();
        }
      } finally {
        clearTimeout(request.deadline);
        if (inFlight === request) {
          inFlight = null;
          if (active) setRefreshing(false);
        }
      }
    }

    const manualRefresh = () => { void refresh(); };
    refreshSavedList.current = manualRefresh;
    const firstRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(refresh, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      if (inFlight) {
        clearTimeout(inFlight.deadline);
        inFlight.controller.abort();
        inFlight = null;
      }
      if (refreshSavedList.current === manualRefresh) refreshSavedList.current = () => undefined;
      window.clearTimeout(firstRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [showId, showSlug]);

  useEffect(() => {
    const positionKey = practicePositionKey(showSlug);
    const initializeClientState = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setShowInstallHint(
        /iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone,
      );
      const readStorage = (key: string) => {
        try {
          return localStorage.getItem(key);
        } catch {
          setStorageUnavailable(true);
          return null;
        }
      };
      setOfflineReady(Boolean(readStorage(offlineReadyKey(showSlug))));
      const savedPosition = readStorage(positionKey);
      if (savedPosition) setCurrentSongId(savedPosition);

      const snapshot = parseStoredShowSnapshot(
        readStorage(showSnapshotKey(showSlug)),
        showSlug,
      );
      const snapshotBelongs = Boolean(
        snapshot &&
          songsBelongToShow(snapshot.songs, {
            id: showId || snapshot.showId || "",
          }),
      );
      if (
        snapshotBelongs &&
        snapshot &&
        !verifiedReadReceived.current &&
        (!online || initialDataSource === "confirmed-fallback")
      ) {
        setSongs(snapshot.songs);
        setUpdatedAt(snapshot.updatedAt);
        setDisplaySource("saved-snapshot");
        setLiveDataAvailable(false);
      } else if (!online) {
        setLiveDataAvailable(false);
      }
      setClientReady(true);
    };
    const initialize = window.setTimeout(initializeClientState, 0);

    const onOnline = () => {
      setIsOnline(true);
      setResourceNotice("");
    };
    const onOffline = () => {
      setIsOnline(false);
      setLiveDataAvailable(false);
      setDisplaySource((current) =>
        current === "confirmed-fallback" ? current : "saved-snapshot",
      );
    };
    const onOfflineReady = (event: Event) => {
      const detail = (event as CustomEvent<{ showSlug?: string }>).detail;
      if (detail?.showSlug === showSlug) setOfflineReady(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("rad-dad-offline-ready", onOfflineReady);
    return () => {
      window.clearTimeout(initialize);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("rad-dad-offline-ready", onOfflineReady);
    };
  }, [initialDataSource, showId, showSlug]);

  useEffect(() => {
    if (!clientReady || !liveDataAvailable || displaySource !== "database") return;
    if (showId && !songsBelongToShow(songs, { id: showId })) return;
    try {
      const publicSnapshot = parseStoredShowSnapshot(
        JSON.stringify(createStoredShowSnapshot(
            showSlug,
            songs,
            updatedAt,
            new Date().toISOString(),
            showId,
          )),
        showSlug,
      );
      if (!publicSnapshot) return;
      localStorage.setItem(showSnapshotKey(showSlug), JSON.stringify(publicSnapshot));
    } catch {
      // Safari can evict storage under pressure; the service worker remains primary.
      const reportStorageFailure = window.setTimeout(() => setStorageUnavailable(true), 0);
      return () => window.clearTimeout(reportStorageFailure);
    }
  }, [clientReady, displaySource, liveDataAvailable, showId, showSlug, songs, updatedAt]);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        sets.map((set) => [
          set.slug,
          songs
            .filter((song) => song.setSlug === set.slug)
            .sort((a, b) => a.position - b.position),
        ]),
      ) as Record<string, ShowSong[]>,
    [sets, songs],
  );

  const orderedSongs = useMemo(
    () =>
      sets.flatMap((set) => grouped[set.slug] ?? []),
    [grouped, sets],
  );
  const resolvedPosition = resolveRunPosition(orderedSongs, currentSongId);
  // React retries this component before committing the render. Once a missing
  // identity is observed, replaying an older list cannot silently resume it.
  // Only a deliberate song tap below clears this page-local hold.
  if (resolvedPosition.kind === "missing" && displaySource === "database" && !requiresManualChoice) setRequiresManualChoice(true);
  const runPosition = requiresManualChoice && resolvedPosition.kind === "selected"
    ? { ...resolvedPosition, kind: "missing" as const, currentIndex: -1, currentSong: null, previousSong: null, nextSong: null }
    : resolvedPosition;
  const { currentIndex: currentSongIndex, currentSong, nextSong } = runPosition;
  const placeLost = runPosition.kind === "missing" || runPosition.kind === "ambiguous";
  const hasVerifiedList = orderedSongs.length > 0;
  const listedSets = visibleOfficialSets(sets, songs);

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release();
    };
  }, []);

  function selectSong(songId: string, scroll = false) {
    if (resolveRunPosition(orderedSongs, songId).kind !== "selected") return;
    setCurrentSongId(songId);
    setRequiresManualChoice(false);
    try {
      localStorage.setItem(practicePositionKey(showSlug), songId);
    } catch {
      // Remembering position is a convenience, not required for rehearsal.
      setStorageUnavailable(true);
    }
    if (scroll) {
      window.requestAnimationFrame(() => {
        document.getElementById(`practice-song-${songId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
  }

  function moveCurrent(offset: number) {
    if (runPosition.kind !== "selected") return;
    const nextIndex = currentSongIndex + offset;
    if (nextIndex < 0 || nextIndex >= orderedSongs.length) return;
    selectSong(String(orderedSongs[nextIndex].id), true);
  }

  async function toggleWakeLock() {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeStatus("off");
      return;
    }

    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) {
      setWakeStatus("unsupported");
      return;
    }

    try {
      const lock = await wakeLock.request("screen");
      wakeLockRef.current = lock;
      setWakeStatus("on");
      lock.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeStatus("off");
      });
    } catch {
      setWakeStatus("unsupported");
    }
  }

  function handleExternalResource(event: MouseEvent<HTMLAnchorElement>) {
    if (isOnline && navigator.onLine) return;
    event.preventDefault();
    setResourceNotice(
      "The set is saved offline. Lyrics and YouTube are external services and need a connection.",
    );
  }

  return (
    <div className={`${styles.livePanel} ${practiceMode ? styles.practiceLivePanel : ""}`}>
      {practiceMode && (hasVerifiedList || placeLost) ? (
        <div className={styles.practiceToolbar} aria-label="Practice controls">
          <div className={styles.practiceSetNav} aria-label="Jump to a set">
            {sets
              .filter((set) => (grouped[set.slug] ?? []).length > 0)
              .map((set) => (
              <a href={`#set-${set.slug}`} key={set.slug}>
                {set.title}
              </a>
            ))}
          </div>
          <div className={styles.nowPlaying} aria-live="polite" data-testid="run-position-status" data-run-position={runPosition.kind}>
            <div className={styles.nowPlayingCopy}>
              <span>
                {currentSong
                  ? `Song ${currentSongIndex + 1} of ${orderedSongs.length}`
                  : placeLost ? "Choose your place again" : "Choose your place"}
              </span>
              <strong>
                {currentSong
                  ? `${String(currentSong.position).padStart(2, "0")} / ${currentSong.title}`
                  : runPosition.kind === "missing"
                    ? "Your place is no longer in this saved set"
                    : runPosition.kind === "ambiguous"
                      ? "Song identities need verification"
                      : "Tap any song below"}
              </strong>
              {nextSong ? (
                <small className={styles.practiceNextLine}>
                  Next / {nextSong.title}
                </small>
              ) : null}
            </div>
            <div className={styles.practiceControls}>
              <button
                type="button"
                onClick={() => moveCurrent(-1)}
                disabled={runPosition.kind !== "selected" || !runPosition.previousSong}
                aria-label="Previous song"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => moveCurrent(1)}
                disabled={runPosition.kind !== "selected" || !nextSong}
                aria-label="Next song"
              >
                Next
              </button>
              <button
                className={wakeStatus === "on" ? styles.wakeActive : ""}
                type="button"
                onClick={toggleWakeLock}
              >
                {wakeStatus === "on"
                  ? "Screen stays awake"
                  : wakeStatus === "unsupported"
                    ? "Wake lock unavailable"
                    : "Keep screen awake"}
              </button>
            </div>
          </div>
          {placeLost ? <div className={styles.runRecovery} role="status">
            <p>{runPosition.kind === "ambiguous"
              ? "This saved list has conflicting song identities. Refresh before choosing your place."
              : !hasVerifiedList
                ? "This saved list is empty. Refresh after the owner adds a song, then choose your place. We won’t advance for you."
              : "The selected song was removed or replaced. Choose a song below to continue; we won’t advance for you."}</p>
            <button type="button" onClick={() => refreshSavedList.current()} disabled={refreshing}>Refresh saved list</button>
          </div> : null}
          <p className={styles.runLocalNote}>{storageUnavailable
            ? "Device storage is unavailable. Your place works in this open page but may not return after reload."
            : "Your place on this device — not a shared stage cue."}</p>
        </div>
      ) : null}

      <div
        className={styles.offlineStatus}
        data-state={
          !isOnline
            ? "offline"
            : !liveDataAvailable
              ? "degraded"
              : offlineReady
                ? "ready"
                : "preparing"
        }
        role="status"
        aria-live="polite"
      >
        <span className={styles.offlineDot} aria-hidden="true" />
        <strong>
          {!isOnline
            ? displaySource === "confirmed-fallback"
              ? "Offline / showing confirmed baseline"
              : "Offline / showing last verified set"
            : !liveDataAvailable
              ? displaySource === "confirmed-fallback"
                ? "Live updates paused / confirmed baseline"
                : "Live updates paused / last verified set"
            : offlineReady
              ? "Offline copy ready on this device"
              : "Preparing this device for offline use"}
        </strong>
        <span>
          {!isOnline
            ? "Set order, details, and your current-song marker remain available."
            : !liveDataAvailable
              ? displaySource === "confirmed-fallback"
                ? "This reviewed baseline belongs to this event, but it is not a live database response."
                : "The last verified official set stays visible and will not be replaced by fallback data."
            : storageUnavailable
              ? "The set and your place work in this open page. Device storage could not be verified; don’t rely on them after reload."
            : showInstallHint
              ? "For best iPhone reliability: tap Share, then Add to Home Screen."
              : "Open this page once before practice and it can reload without service."}
        </span>
      </div>
      {resourceNotice ? (
        <p className={styles.offlineNotice} role="alert">
          {resourceNotice}
        </p>
      ) : null}

      {!hasVerifiedList ? (
        <p className={styles.emptyVerifiedList} role="status">
          This show does not have a verified list yet. Another show&apos;s set
          will not appear here.
        </p>
      ) : null}

      {listedSets.map((set) => {
        const setSongs = grouped[set.slug] ?? [];
        const setMinutes = Math.round(
          setSongs.reduce((total, song) => total + (song.durationSeconds || 180), 0) / 60,
        );
        return (
          <article
            className={styles.setBlock}
            data-accent={set.accent}
            id={`set-${set.slug}`}
            key={set.slug}
            data-empty={setSongs.length ? "false" : "true"}
          >
            <header className={styles.setHeader}>
              <div>
                <p className={styles.setKicker}>{set.kicker}</p>
                <h3 className={styles.setTitle}>{set.title}</h3>
              </div>
              <div className={styles.setMeta}>
                <strong className={styles.setTime}>{set.time || "This show"}</strong>
                {setSongs.length ? (
                  <>
                    <span className={styles.songCount}>
                      {setSongs.length} song{setSongs.length === 1 ? "" : "s"}
                    </span>
                    <span className={styles.songCount}>~{setMinutes} min</span>
                  </>
                ) : (
                  <span className={styles.songCount}>
                    No verified songs on this set yet
                  </span>
                )}
              </div>
            </header>

            {setSongs.length === 0 ? (
              <p className={styles.emptySet}>
                No verified songs on this set yet. This show will not borrow
                another night&apos;s list.
              </p>
            ) : (
            <ol className={styles.songList}>
              {setSongs.map((song, songIndex) => {
                const resources = publicSongResourceActions(song);
                const chordsUrl =
                  practiceMode && song.chordsUrl && !isSearchResourceUrl(song.chordsUrl)
                    ? song.chordsUrl
                    : "";
                return (
                  <li
                    className={`${styles.songRow} ${
                      song.transition ? styles.flowSong : ""
                    } ${runPosition.kind === "selected" && currentSongId === String(song.id) ? styles.currentSong : ""}`}
                    id={practiceMode && runPosition.kind !== "ambiguous" ? `practice-song-${song.id}` : undefined}
                    key={runPosition.kind === "ambiguous" ? `${set.slug}:${songIndex}` : song.id}
                  >
                    <span className={styles.songNumber}>
                      {String(song.position).padStart(2, "0")}
                    </span>
                    <button
                      className={`${styles.songMain} ${styles.songPick}`}
                      type="button"
                      onClick={() => practiceMode && selectSong(String(song.id))}
                      disabled={practiceMode && runPosition.kind === "ambiguous"}
                      aria-pressed={practiceMode ? runPosition.kind === "selected" && currentSongId === String(song.id) : undefined}
                      aria-label={practiceMode ? `Mark ${song.title} as current song` : undefined}
                      tabIndex={practiceMode ? 0 : -1}
                    >
                      <div className={styles.songTitleLine}>
                        <strong className={styles.songTitle}>{song.title}</strong>
                        {practiceMode && runPosition.kind === "selected" && currentSongId === String(song.id) ? (
                          <span className={styles.currentFlag}>Current</span>
                        ) : null}
                        {song.transition ? (
                          <span className={styles.flowArrow} title="Flows into next song">
                            {"\u2192"}
                          </span>
                        ) : null}
                      </div>
                      {song.artist ? (
                        <span className={styles.songArtist}>{song.artist}</span>
                      ) : null}
                      {song.performanceNote ? (
                        <span className={styles.songNote}>{song.performanceNote}</span>
                      ) : null}
                      {song.songKey || song.tuning ? (
                        <span className={styles.songDetails}>
                          {song.songKey ? `Key: ${song.songKey}` : ""}
                          {song.songKey && song.tuning ? " / " : ""}
                          {song.tuning ? `Tuning: ${song.tuning}` : ""}
                        </span>
                      ) : null}
                      {song.isOriginal ? (
                        <span className={styles.songDetails}>Original</span>
                      ) : null}
                    </button>
                    {!song.isOriginal &&
                    (resources.lyricsUrl || resources.youtubeUrl || chordsUrl) ? (
                      <div className={styles.resourceBar} aria-label={`${song.title} resources`}>
                        {resources.lyricsUrl ? (
                          <a
                            className={styles.resourceLink}
                            href={resources.lyricsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={handleExternalResource}
                          >
                            {practiceMode ? "Open lyrics" : "Lyrics"}
                          </a>
                        ) : null}
                        {resources.youtubeUrl ? (
                          <a
                            className={styles.resourceLink}
                            href={resources.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={handleExternalResource}
                          >
                            YouTube
                          </a>
                        ) : null}
                        {chordsUrl ? (
                          <a
                            className={styles.resourceLink}
                            href={chordsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={handleExternalResource}
                          >
                            Chords
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            )}
          </article>
        );
      })}

      <p className={styles.updatedLine}>
        {displaySource === "database"
          ? "Verified live list"
          : displaySource === "saved-snapshot"
            ? "Last verified live list"
            : "Confirmed code baseline"}
        {updatedAt ? ` / updated ${formatShowTimestamp(updatedAt)}` : ""}
      </p>

    </div>
  );
}

type WakeLockHandle = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockHandle>;
  };
};
