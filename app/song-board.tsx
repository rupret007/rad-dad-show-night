"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./song-board.module.css";

const FALLBACK_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/viewform";

export type Suggestion = {
  id: string;
  title: string;
  artist: string;
  addedBy: string;
  notes: string;
  submittedAt: string;
};

export default function SongBoard() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/suggestions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { suggestions?: Suggestion[] }) => {
        if (active) setSuggestions(data.suggestions ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        suggestion?: Suggestion;
      };
      if (!response.ok) throw new Error(result.error || "Could not add that song.");
      if (result.suggestion) {
        setSuggestions((current) => [result.suggestion!, ...current]);
      }
      form.reset();
      setMessage("Added to the suggestion board. The official set did not change.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add that song.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.board}>
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>04 / Open suggestion board</p>
          <h2 className={styles.title}>WHAT SHOULD WE LEARN NEXT?</h2>
        </div>
        <p className={styles.intro}>
          Add an idea for a future show. Suggestions stay here for the band to
          review; they never alter the official running order.
        </p>
      </div>

      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={submitSuggestion}>
          <div className={styles.formTop}>
            <span className={styles.formNumber}>ADD ONE</span>
            <strong>Song suggestion</strong>
          </div>
          <label className={styles.field}>
            <span>Song title *</span>
            <input name="title" required maxLength={140} placeholder="e.g. My Own Worst Enemy" />
          </label>
          <label className={styles.field}>
            <span>Artist</span>
            <input name="artist" maxLength={140} placeholder="e.g. Lit" />
          </label>
          <label className={styles.field}>
            <span>Your name *</span>
            <input name="addedBy" required maxLength={100} placeholder="Who added it?" />
          </label>
          <label className={styles.field}>
            <span>Why this one?</span>
            <textarea name="notes" maxLength={500} rows={3} placeholder="Singer, version, key, or why it would crush." />
          </label>
          <label className={styles.honeypot} aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button className={styles.submitButton} type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add suggestion"}
          </button>
          {message ? <p className={styles.message}>{message}</p> : null}
          <a className={styles.fallbackLink} href={FALLBACK_FORM} target="_blank" rel="noreferrer">
            Trouble submitting? Open the backup form
          </a>
        </form>

        <div className={styles.feedCard}>
          <div className={styles.feedHeader}>
            <div>
              <span className={styles.feedLabel}>Community queue</span>
              <strong>{suggestions.length} ideas</strong>
            </div>
            <span className={styles.feedStatus}>Live</span>
          </div>
          <div className={styles.feed} aria-live="polite">
            {loading ? <p className={styles.empty}>Loading suggestions...</p> : null}
            {!loading && !suggestions.length ? (
              <p className={styles.empty}>No suggestions yet. Be the first one on the board.</p>
            ) : null}
            {suggestions.map((song, index) => (
              <article className={styles.suggestion} key={song.id}>
                <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{song.title}</h3>
                  {song.artist ? <p className={styles.artist}>{song.artist}</p> : null}
                  {song.notes ? <p className={styles.notes}>{song.notes}</p> : null}
                  <p className={styles.byline}>
                    Added by <strong>{song.addedBy}</strong>
                    {song.submittedAt ? ` / ${formatDate(song.submittedAt)}` : ""}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

