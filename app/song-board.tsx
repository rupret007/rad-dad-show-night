"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./song-board.module.css";

type Suggestion = {
  id: string;
  timestamp: string;
  song: string;
  artist: string;
  addedBy: string;
  notes: string;
};

const FORM_ACTION =
  "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/formResponse";

const PUBLIC_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/viewform";

function displayTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "Just added";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function SongBoard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/suggestions", { cache: "no-store" });
      const data = await response.json();
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setUnavailable(Boolean(data.unavailable));
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (data.get("website")) {
      event.preventDefault();
      return;
    }

    setStatus("Sending your suggestion...");
    window.setTimeout(() => {
      formRef.current?.reset();
      setStatus("Suggestion added. It may take a few seconds to appear.");
      void refresh();
      window.setTimeout(() => void refresh(), 4000);
    }, 1200);
  }

  return (
    <section className={styles.board} id="suggestions" aria-labelledby="song-board-title">
      <div className={styles.checker} aria-hidden="true" />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPEN TO THE CREW</p>
          <h2 id="song-board-title">SONG SUGGESTIONS</h2>
          <p className={styles.intro}>
            Hear something we should learn, rehearse, or keep in the back pocket?
            Put it on the board.
          </p>
        </div>
        <div className={styles.lockNote}>
          <strong>THE SHOW SETS STAY LOCKED.</strong>
          <span>These are ideas only, not changes to September 19.</span>
        </div>
      </header>

      <div className={styles.layout}>
        <form
          ref={formRef}
          className={styles.form}
          action={FORM_ACTION}
          method="POST"
          target="song-board-submit"
          onSubmit={handleSubmit}
        >
          <div className={styles.formHeading}>
            <span className={styles.step}>01</span>
            <div>
              <h3>ADD ONE TO THE BOARD</h3>
              <p>No account needed. Your name and timestamp will appear below.</p>
            </div>
          </div>

          <label>
            <span>Song title</span>
            <input
              name="entry.988161673"
              type="text"
              maxLength={120}
              placeholder="e.g. Dammit"
              required
            />
          </label>

          <label>
            <span>Artist</span>
            <input
              name="entry.515724080"
              type="text"
              maxLength={120}
              placeholder="e.g. blink-182"
              required
            />
          </label>

          <label>
            <span>Added by</span>
            <input
              name="entry.1834262230"
              type="text"
              maxLength={80}
              placeholder="Your name"
              required
            />
          </label>

          <label>
            <span>Why this one? <em>Optional</em></span>
            <textarea
              name="entry.286610891"
              maxLength={400}
              rows={3}
              placeholder="Key, singer, arrangement idea, or why it would crush..."
            />
          </label>

          <label className={styles.honeypot} aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          </label>

          <button className={styles.submit} type="submit">
            <span>ADD SONG</span>
            <b aria-hidden="true">+</b>
          </button>

          <p className={styles.status} aria-live="polite">{status}</p>
          <a className={styles.fallback} href={PUBLIC_FORM} target="_blank" rel="noreferrer">
            Having trouble? Open the simple form
          </a>
        </form>

        <div className={styles.feed}>
          <div className={styles.feedHeading}>
            <div>
              <span className={styles.step}>02</span>
              <h3>THE BOARD</h3>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading}>
              {loading ? "CHECKING..." : "REFRESH"}
            </button>
          </div>

          {loading && suggestions.length === 0 ? (
            <p className={styles.empty}>Loading the board...</p>
          ) : suggestions.length === 0 ? (
            <div className={styles.empty}>
              <strong>THE BOARD IS WIDE OPEN.</strong>
              <span>Be the first to throw a song into the ring.</span>
            </div>
          ) : (
            <ol className={styles.list}>
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <div className={styles.songLine}>
                    <strong>{suggestion.song}</strong>
                    {suggestion.artist && <span>{suggestion.artist}</span>}
                  </div>
                  {suggestion.notes && <p>{suggestion.notes}</p>}
                  <div className={styles.meta}>
                    <span>ADDED BY {suggestion.addedBy}</span>
                    <time>{displayTimestamp(suggestion.timestamp)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {unavailable && (
            <p className={styles.notice}>
              The live board is taking a minute. Suggestions can still be submitted.
            </p>
          )}
        </div>
      </div>

      <iframe
        className={styles.submitFrame}
        name="song-board-submit"
        title="Song suggestion submission"
      />
    </section>
  );
}
