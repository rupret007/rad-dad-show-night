"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SET_DEFINITIONS, type ShowSong } from "../lib/show-data";
import { buildSongResourceLinks } from "../lib/song-resources";
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
  showSlug,
  practiceMode = false,
}: {
  initialSongs: ShowSong[];
  showSlug: string;
  practiceMode?: boolean;
}) {
  const [songs, setSongs] = useState(initialSongs);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [wakeStatus, setWakeStatus] = useState<"off" | "on" | "unsupported">("off");
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [updatedAt, setUpdatedAt] = useState(
    initialSongs.reduce(
      (latest, song) => (song.updatedAt > latest ? song.updatedAt : latest),
      "",
    ),
  );

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(
          `/api/show?show=${encodeURIComponent(showSlug)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          songs?: ShowSong[];
          updatedAt?: string;
        };
        if (active && data.songs) {
          setSongs(data.songs);
          setUpdatedAt(data.updatedAt ?? "");
        }
      } catch {
        // Keep the last good set visible if the refresh is interrupted.
      }
    }

    const interval = window.setInterval(refresh, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [showSlug]);

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
                const searches = buildSongResourceLinks(song.title, song.artist);
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
                    {!song.isOriginal ? (
                      <div className={styles.resourceBar} aria-label={`${song.title} resources`}>
                        <a
                          className={styles.resourceLink}
                          href={song.lyricsUrl || searches.lyricsSearchUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {practiceMode ? "Open lyrics" : "Lyrics"}
                        </a>
                        <a
                          className={styles.resourceLink}
                          href={song.youtubeUrl || searches.youtubeSearchUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {song.youtubeUrl ? "YouTube" : "YouTube search"}
                        </a>
                        {practiceMode && song.chordsUrl ? (
                          <a
                            className={styles.resourceLink}
                            href={song.chordsUrl}
                            target="_blank"
                            rel="noreferrer"
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
        Live list{updatedAt ? ` / updated ${formatUpdated(updatedAt)}` : ""}
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

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
