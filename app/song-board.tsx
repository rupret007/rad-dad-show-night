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
  pending?: boolean;
};

type SubmitState = "idle" | "sending" | "success" | "error";

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

function sameSuggestion(left: Suggestion, right: Suggestion) {
  return (
    left.song.toLowerCase() === right.song.toLowerCase() &&
    left.artist.toLowerCase() === right.artist.toLowerCase()
  );
}

export default function SongBoard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/suggestions", { cache: "no-store" });
      const data = await response.json();
      const remote = Array.isArray(data.suggestions) ? data.suggestions : [];

      setSuggestions((current) => {
        const pending = current.filter(
          (item) => item.pending && !remote.some((saved: Suggestion) => sameSuggestion(item, saved)),
        );
        return [...pending, ...remote];
      });
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "sending") return;

    const data = new FormData(event.currentTarget);
    const payload = {
      song: String(data.get("song") ?? "").trim(),
      artist: String(data.get("artist") ?? "").trim(),
      addedBy: String(data.get("addedBy") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
      website: String(data.get("website") ?? ""),
    };

    setSubmitState("sending");
    setStatus("Checking the board and adding your song...");

    try {
      const response = await fetch("/api/suggestions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "The song could not be added.");
      }

      const pending: Suggestion = {
        id: `pending-${Date.now()}`,
        timestamp: new Date().toISOString(),
        song: payload.song,
        artist: payload.artist,
        addedBy: payload.addedBy,
        notes: payload.notes,
        pending: true,
      };

      setSuggestions((current) => [pending, ...current]);
      formRef.current?.reset();
      setSubmitState("success");
      setStatus("Added to the board. The shared list is syncing now.");
      window.setTimeout(() => void refresh(), 3500);
      window.setTimeout(() => void refresh(), 8000);
    } catch (error) {
      setSubmitState("error");
      setStatus(error instanceof Error ? error.message : "The song could not be added.");
    }
  }

  const statusClass = [
    styles.status,
    submitState === "success" ? styles.statusSuccess : "",
    submitState === "error" ? styles.statusError : "",
  ]
    .filter(Boolean)
    .join(" ");

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
        <form ref={formRef} className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formHeading}>
            <span className={styles.step}>01</span>
            <div>
              <h3>ADD ONE TO THE BOARD</h3>
              <p>We check for duplicates and confirm that every submission was accepted.</p>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label>
              <span>Song title</span>
              <input
                name="song"
                type="text"
                maxLength={120}
                placeholder="e.g. Dammit"
                autoComplete="off"
                required
              />
            </label>

            <label>
              <span>Artist</span>
              <input
                name="artist"
                type="text"
                maxLength={120}
                placeholder="e.g. blink-182"
                autoComplete="off"
                required
              />
            </label>
          </div>

          <label>
            <span>Added by</span>
            <input
              name="addedBy"
              type="text"
              maxLength={80}
              placeholder="Your name"
              autoComplete="name"
              required
            />
          </label>

          <label>
            <span>Why this one? <em>Optional</em></span>
            <textarea
              name="notes"
              maxLength={400}
              rows={3}
              placeholder="Key, singer, arrangement idea, or why it would crush..."
            />
          </label>

          <label className={styles.honeypot} aria-hidden="true">
            Website
            <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          </label>

          <button className={styles.submit} type="submit" disabled={submitState === "sending"}>
            <span>{submitState === "sending" ? "ADDING..." : "ADD SONG"}</span>
            <b aria-hidden="true">{submitState === "sending" ? "..." : "+"}</b>
          </button>

          <p className={statusClass} aria-live="polite">{status}</p>
          <a className={styles.fallback} href={PUBLIC_FORM} target="_blank" rel="noreferrer">
            Backup option: open the simple Google form
          </a>
        </form>

        <div className={styles.feed}>
          <div className={styles.feedHeading}>
            <div>
              <span className={styles.step}>02</span>
              <h3>THE BOARD</h3>
              <span className={styles.count}>
                {suggestions.length} {suggestions.length === 1 ? "SONG" : "SONGS"}
              </span>
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
              <div className={styles.ideaTags} aria-label="Suggestion inspiration">
                <i>CROWD SINGALONG</i>
                <i>DEEP CUT</i>
                <i>GUILTY PLEASURE</i>
              </div>
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
                    {suggestion.pending && <b className={styles.syncing}>SYNCING</b>}
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
    </section>
  );
}
