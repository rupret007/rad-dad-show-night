"use client";

import { useEffect, useMemo, useState } from "react";
import { SET_DEFINITIONS, type ShowSong } from "../lib/show-data";
import { buildSongResourceLinks } from "../lib/song-resources";
import styles from "./show-page.module.css";

export function SharePageButton() {
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
      {status || "Share this page"}
    </button>
  );
}

export default function LiveSetLists({
  initialSongs,
}: {
  initialSongs: ShowSong[];
}) {
  const [songs, setSongs] = useState(initialSongs);
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
        const response = await fetch("/api/show", { cache: "no-store" });
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
  }, []);

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

  return (
    <div className={styles.livePanel}>
      {SET_DEFINITIONS.map((set) => {
        const setSongs = grouped[set.slug] ?? [];
        return (
          <article
            className={styles.setBlock}
            data-accent={set.accent}
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
              </div>
            </header>

            <ol className={styles.songList}>
              {setSongs.map((song) => {
                const searches = buildSongResourceLinks(song.title, song.artist);
                return (
                  <li
                    className={`${styles.songRow} ${
                      song.transition ? styles.flowSong : ""
                    }`}
                    key={song.id}
                  >
                    <span className={styles.songNumber}>
                      {String(song.position).padStart(2, "0")}
                    </span>
                    <div className={styles.songMain}>
                      <div className={styles.songTitleLine}>
                        <strong className={styles.songTitle}>{song.title}</strong>
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
                    </div>
                    <div className={styles.resourceBar} aria-label={`${song.title} resources`}>
                      <a
                        className={styles.resourceLink}
                        href={song.youtubeUrl || searches.youtubeSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {song.youtubeUrl ? "YouTube" : "Find on YouTube"}
                      </a>
                    </div>
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
