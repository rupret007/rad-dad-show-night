"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { SET_DEFINITIONS, type ShowSong } from "../lib/show-data";
import {
  isSearchResourceUrl,
  publicSongResourceActions,
} from "../lib/song-resources";
import {
  createStoredShowSnapshot,
  formatShowTimestamp,
  offlineReadyKey,
  parseStoredShowSnapshot,
  shouldReplaceDisplayedSongs,
  showSnapshotKey,
  type ShowDataSource,
  type ShowDisplaySource,
} from "../lib/show-read-integrity";
import styles from "./show-page.module.css";

export function SharePageButton({ label = "Share this page" }: { label?: string }) {
  const [status, setStatus] = useState("");

  async function sharePage() {
    const details = {
      title: "Rad Dad + Friends Show Night",
      text: "Run of show and live set lists for September 19, 2026.",
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

export default function LiveSetLists({
  initialSongs,
  initialDataSource,
  showSlug,
  practiceMode = false,
}: {
  initialSongs: ShowSong[];
  initialDataSource: ShowDataSource;
  showSlug: string;
  practiceMode?: boolean;
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
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
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [updatedAt, setUpdatedAt] = useState(
    initialSongs.reduce(
      (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
      "",
    ),
  );

  useEffect(() => {
    let active = true;

    function markLiveDataUnavailable() {
      if (!active) return;
      setLiveDataAvailable(false);
      setDisplaySource((current) =>
        current === "confirmed-fallback" ? current : "saved-snapshot",
      );
    }

    async function refresh() {
      try {
        const response = await fetch(
          `/api/show?show=${encodeURIComponent(showSlug)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          markLiveDataUnavailable();
          return;
        }
        const data = (await response.json()) as {
          songs?: ShowSong[];
          updatedAt?: string;
          dataSource?: ShowDataSource;
        };
        if (!active) return;

        const servedOffline = response.headers.get("x-rad-dad-offline") === "1";
        setIsOnline(navigator.onLine && !servedOffline);
        if (
          data.songs &&
          data.dataSource &&
          shouldReplaceDisplayedSongs(data.dataSource)
        ) {
          setSongs(data.songs);
          setUpdatedAt(data.updatedAt ?? "");
          setLiveDataAvailable(!servedOffline);
          setDisplaySource(servedOffline ? "saved-snapshot" : "database");
        } else {
          markLiveDataUnavailable();
        }
      } catch {
        // Keep the last verified set visible if a refresh is interrupted.
        if (active) {
          setIsOnline(navigator.onLine);
          markLiveDataUnavailable();
        }
      }
    }

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
      window.clearTimeout(firstRefresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [showSlug]);

  useEffect(() => {
    const positionKey = `rad-dad-practice-position:${showSlug}`;
    const initializeClientState = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setShowInstallHint(
        /iPhone|iPad|iPod/i.test(navigator.userAgent) && !standalone,
      );
      setOfflineReady(
        Boolean(localStorage.getItem(offlineReadyKey(showSlug))),
      );
      const savedPosition = localStorage.getItem(positionKey);
      if (savedPosition) setCurrentSongId(savedPosition);

      const snapshot = parseStoredShowSnapshot(
        localStorage.getItem(showSnapshotKey(showSlug)),
        showSlug,
      );
      if ((!online || initialDataSource === "confirmed-fallback") && snapshot) {
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
  }, [initialDataSource, showSlug]);

  useEffect(() => {
    if (!clientReady || !liveDataAvailable || displaySource !== "database") return;
    try {
      localStorage.setItem(
        showSnapshotKey(showSlug),
        JSON.stringify(createStoredShowSnapshot(showSlug, songs, updatedAt)),
      );
    } catch {
      // Safari can evict storage under pressure; the service worker remains primary.
    }
  }, [clientReady, displaySource, liveDataAvailable, showSlug, songs, updatedAt]);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        SET_DEFINITIONS.map((set) => [
          set.slug,
          songs
            .filter((song) => song.setSlug === set.slug)
            .sort((a, b) => a.position - b.position),
        ]),
      ) as Record<string, ShowSong[]>,
    [songs],
  );

  const orderedSongs = useMemo(
    () =>
      SET_DEFINITIONS.flatMap((set) => grouped[set.slug] ?? []),
    [grouped],
  );
  const currentSongIndex = orderedSongs.findIndex(
    (song) => String(song.id) === currentSongId,
  );
  const currentSong = currentSongIndex >= 0 ? orderedSongs[currentSongIndex] : null;

  useEffect(() => {
    return () => {
      void wakeLockRef.current?.release();
    };
  }, []);

  function selectSong(songId: string, scroll = false) {
    setCurrentSongId(songId);
    try {
      localStorage.setItem(`rad-dad-practice-position:${showSlug}`, songId);
    } catch {
      // Remembering position is a convenience, not required for rehearsal.
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
    if (!orderedSongs.length) return;
    const nextIndex = Math.min(
      orderedSongs.length - 1,
      Math.max(0, (currentSongIndex >= 0 ? currentSongIndex : 0) + offset),
    );
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
      {practiceMode ? (
        <div className={styles.practiceToolbar} aria-label="Practice controls">
          <div className={styles.practiceSetNav} aria-label="Jump to a set">
            {SET_DEFINITIONS.map((set) => (
              <a href={`#set-${set.slug}`} key={set.slug}>
                {set.title}
              </a>
            ))}
          </div>
          <div className={styles.nowPlaying} aria-live="polite">
            <div className={styles.nowPlayingCopy}>
              <span>{currentSong ? "Current song" : "Choose your place"}</span>
              <strong>
                {currentSong
                  ? `${String(currentSong.position).padStart(2, "0")} / ${currentSong.title}`
                  : "Tap any song below"}
              </strong>
            </div>
            <div className={styles.practiceControls}>
              <button
                type="button"
                onClick={() => moveCurrent(-1)}
                disabled={currentSongIndex <= 0}
                aria-label="Previous song"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => moveCurrent(1)}
                disabled={currentSongIndex < 0 || currentSongIndex >= orderedSongs.length - 1}
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

      {SET_DEFINITIONS.map((set) => {
        const setSongs = grouped[set.slug] ?? [];
        return (
          <article
            className={styles.setBlock}
            data-accent={set.accent}
            id={`set-${set.slug}`}
            key={set.slug}
          >
            <header className={styles.setHeader}>
              <div>
                <p className={styles.setKicker}>{set.kicker}</p>
                <h3 className={styles.setTitle}>{set.title}</h3>
              </div>
              <div className={styles.setMeta}>
                <strong className={styles.setTime}>{set.time}</strong>
                <span className={styles.songCount}>{setSongs.length} songs</span>
                <span className={styles.songCount}>
                  ~{Math.round(setSongs.reduce((total, song) => total + (song.durationSeconds || 180), 0) / 60)} min
                </span>
              </div>
            </header>

            <ol className={styles.songList}>
              {setSongs.map((song) => {
                const resources = publicSongResourceActions(song);
                const chordsUrl =
                  practiceMode && song.chordsUrl && !isSearchResourceUrl(song.chordsUrl)
                    ? song.chordsUrl
                    : "";
                return (
                  <li
                    className={`${styles.songRow} ${
                      song.transition ? styles.flowSong : ""
                    } ${currentSongId === String(song.id) ? styles.currentSong : ""}`}
                    id={practiceMode ? `practice-song-${song.id}` : undefined}
                    key={song.id}
                  >
                    <span className={styles.songNumber}>
                      {String(song.position).padStart(2, "0")}
                    </span>
                    <button
                      className={`${styles.songMain} ${styles.songPick}`}
                      type="button"
                      onClick={() => practiceMode && selectSong(String(song.id))}
                      aria-pressed={practiceMode ? currentSongId === String(song.id) : undefined}
                      aria-label={practiceMode ? `Mark ${song.title} as current song` : undefined}
                      tabIndex={practiceMode ? 0 : -1}
                    >
                      <div className={styles.songTitleLine}>
                        <strong className={styles.songTitle}>{song.title}</strong>
                        {practiceMode && currentSongId === String(song.id) ? (
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
