"use client";

import { type FormEvent, useCallback, useEffect, useReducer, useRef } from "react";
import { sanitizePublicSuggestion } from "../lib/public-suggestion";
import {
  isPublicSuggestion, isSuggestionFields, parseSuggestionFeedPayload,
  sameSuggestionSong, sameSuggestionSubmission,
  type PublicSuggestion, type SuggestionFields,
} from "../lib/suggestion-board";
import styles from "./song-board.module.css";

const FALLBACK_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSe93ppe0NaWrOBKyfIuuWyMRQrNWpwdwYq8dpTGb0yCnEhjDA/viewform";
const EMPTY_DRAFT: Draft = { title: "", artist: "", addedBy: "", notes: "", isOriginal: false, website: "" };
export type Suggestion = PublicSuggestion;
type Draft = SuggestionFields & { website: string };
type Attempt = { fields: SuggestionFields; attempt: number };
type Delivery =
  | { kind: "idle" }
  | (Attempt & { kind: "sending" })
  | (Attempt & { kind: "not-sent"; message: string })
  | (Attempt & { kind: "awaiting" | "unknown"; afterReadId: number; retryReady: boolean })
  | (Attempt & { kind: "duplicate" | "confirmed"; existing: PublicSuggestion });
type BoardState = {
  rows: PublicSuggestion[] | null;
  feed: "loading" | "ready" | "unavailable";
  readId: number;
  draft: Draft;
  delivery: Delivery;
  query: string;
  visibleCount: number;
  retryAcknowledged: boolean;
  confirmNewIdea: boolean;
  knownDuplicate: PublicSuggestion | null;
};
type Action =
  | { type: "edit"; patch: Partial<Draft> }
  | { type: "search"; query: string }
  | { type: "more" }
  | { type: "read-start"; id: number }
  | { type: "read-success"; id: number; rows: PublicSuggestion[] }
  | { type: "read-failed"; id: number }
  | { type: "delivery"; value: Delivery }
  | { type: "retry-acknowledged"; checked: boolean }
  | { type: "confirm-new"; value: boolean }
  | { type: "new-idea" };

function unresolved(delivery: Delivery): delivery is Attempt & { kind: "awaiting" | "unknown"; afterReadId: number; retryReady: boolean } {
  return delivery.kind === "awaiting" || delivery.kind === "unknown";
}

function canonicalDraft(draft: Draft): SuggestionFields {
  // Reuse the application sanitizer, keeping the honeypot in the actual POST.
  const sanitized = sanitizePublicSuggestion({ ...draft, website: "" });
  if (sanitized.kind !== "suggestion") throw new Error("Cannot prepare this suggestion.");
  return sanitized.suggestion;
}

function reduceBoard(state: BoardState, action: Action): BoardState {
  if (action.type === "edit") {
    if (state.delivery.kind === "sending" || unresolved(state.delivery)) return state;
    return { ...state, draft: { ...state.draft, ...action.patch }, delivery: { kind: "idle" }, confirmNewIdea: false };
  }
  if (action.type === "search") return { ...state, query: action.query, visibleCount: 5 };
  if (action.type === "more") return { ...state, visibleCount: state.visibleCount + 10 };
  if (action.type === "read-start") return { ...state, readId: action.id, feed: "loading", retryAcknowledged: false };
  if (action.type === "read-failed") {
    if (action.id !== state.readId) return state;
    const delivery = unresolved(state.delivery) ? { ...state.delivery, retryReady: false } : state.delivery;
    return { ...state, feed: "unavailable", delivery, retryAcknowledged: false };
  }
  if (action.type === "read-success") {
    if (action.id !== state.readId) return state;
    let delivery = state.delivery;
    let draft = state.draft;
    // A late initial GET cannot prove arrival or authorize a retry. Only reads
    // STARTED after this attempt settled can reconcile its separate receipt.
    if (unresolved(delivery) && action.id > delivery.afterReadId) {
      const attempt = delivery;
      const exact = action.rows.find((row) => sameSuggestionSubmission(row, attempt.fields));
      if (exact) {
        delivery = { kind: "confirmed", fields: attempt.fields, attempt: attempt.attempt, existing: exact };
        if (sameSuggestionSubmission(canonicalDraft(draft), attempt.fields)) draft = { ...EMPTY_DRAFT };
      } else {
        delivery = { ...attempt, retryReady: !action.rows.some((row) => sameSuggestionSong(row, attempt.fields)) };
      }
    }
    return { ...state, feed: "ready", rows: action.rows, draft, delivery, retryAcknowledged: false, knownDuplicate: null };
  }
  if (action.type === "delivery") {
    if (action.value.kind !== "idle" && action.value.kind !== "sending" && state.delivery.kind === "sending" && action.value.attempt !== state.delivery.attempt) return state;
    return { ...state, delivery: action.value, retryAcknowledged: false, confirmNewIdea: false, knownDuplicate: action.value.kind === "duplicate" ? action.value.existing : state.knownDuplicate };
  }
  if (action.type === "retry-acknowledged") return { ...state, retryAcknowledged: action.checked };
  if (action.type === "confirm-new") return { ...state, confirmNewIdea: action.value };
  if (state.delivery.kind === "sending" || (unresolved(state.delivery) && !state.confirmNewIdea)) return state;
  return { ...state, draft: { ...EMPTY_DRAFT }, delivery: { kind: "idle" }, retryAcknowledged: false, confirmNewIdea: false };
}

/** Bound headers and body reads, releasing the UI even if a transport stalls. */
async function beforeAbort<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Request interrupted"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal.aborted) throw new Error("Request interrupted");
        return request();
      }),
      interrupted,
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export default function SongBoard() {
  const [state, dispatch] = useReducer(reduceBoard, {
    rows: null, feed: "loading", readId: 0, draft: { ...EMPTY_DRAFT }, delivery: { kind: "idle" },
    query: "", visibleCount: 5, retryAcknowledged: false, confirmNewIdea: false, knownDuplicate: null,
  });
  const sequence = useRef(0);
  const mounted = useRef(false);
  const activeRead = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const pendingRequests = useRef(new Map<AbortController, ReturnType<typeof setTimeout>>());
  const titleInput = useRef<HTMLInputElement>(null);
  const focusNewIdea = useRef(false);

  const beginRequest = useCallback((timeout: number) => {
    const controller = new AbortController();
    pendingRequests.current.set(controller, setTimeout(() => controller.abort(), timeout));
    return controller;
  }, []);
  const finishRequest = useCallback((controller: AbortController) => {
    clearTimeout(pendingRequests.current.get(controller));
    pendingRequests.current.delete(controller);
  }, []);

  const refreshBoard = useCallback(async () => {
    if (activeRead.current && !activeRead.current.signal.aborted) return;
    const id = ++sequence.current;
    const controller = beginRequest(10_000);
    activeRead.current = controller;
    dispatch({ type: "read-start", id });
    try {
      const rows = await beforeAbort(controller.signal, async () => {
        const response = await fetch("/api/suggestions", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Board unavailable");
        return parseSuggestionFeedPayload(await response.json());
      });
      if (mounted.current && activeRead.current === controller) dispatch({ type: "read-success", id, rows });
    } catch {
      if (mounted.current && activeRead.current === controller) dispatch({ type: "read-failed", id });
    } finally {
      finishRequest(controller);
      if (activeRead.current === controller) activeRead.current = null;
    }
  }, [beginRequest, finishRequest]);

  useEffect(() => {
    mounted.current = true;
    void refreshBoard();
    const requests = pendingRequests.current;
    return () => {
      mounted.current = false;
      activeRead.current = null;
      for (const [controller, timer] of requests) {
        clearTimeout(timer);
        controller.abort();
      }
      requests.clear();
    };
  }, [refreshBoard]);

  useEffect(() => {
    if (state.delivery.kind === "idle" && focusNewIdea.current) {
      focusNewIdea.current = false;
      titleInput.current?.focus();
    }
  }, [state.delivery.kind]);

  function startDifferentIdea() {
    focusNewIdea.current = true;
    dispatch({ type: "new-idea" });
  }

  async function sendSuggestion(retry = false) {
    if (sending.current || state.delivery.kind === "sending") return;
    if (unresolved(state.delivery) && (!retry || !state.delivery.retryReady || !state.retryAcknowledged || state.feed !== "ready")) return;
    if (!unresolved(state.delivery) && retry) return;
    const fields = canonicalDraft(state.draft);
    if (!fields.title || !fields.addedBy) return;
    const existing = state.rows?.find((row) => sameSuggestionSong(row, fields))
      ?? (state.knownDuplicate && sameSuggestionSong(state.knownDuplicate, fields) ? state.knownDuplicate : null);
    if (existing) {
      dispatch({ type: "delivery", value: { kind: "duplicate", fields, attempt: ++sequence.current, existing } });
      return;
    }
    sending.current = true;
    const attempt = ++sequence.current;
    const controller = beginRequest(20_000);
    dispatch({ type: "delivery", value: { kind: "sending", fields, attempt } });
    try {
      const { status, result } = await beforeAbort(controller.signal, async () => {
        const response = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, website: state.draft.website }),
          signal: controller.signal,
        });
        return { status: response.status, result: await response.json() as unknown };
      });
      if (!mounted.current) return;
      const body = result !== null && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
      let delivery: Delivery;
      if (status === 202 && body?.delivery === "awaiting-board" && isSuggestionFields(body.submission) && sameSuggestionSubmission(body.submission, fields)) {
        delivery = { kind: "awaiting", fields, attempt, afterReadId: sequence.current, retryReady: false };
      } else if (status === 409 && body?.delivery === "already-present" && isPublicSuggestion(body.existing) && sameSuggestionSong(body.existing, fields)) {
        delivery = { kind: "duplicate", fields, attempt, existing: body.existing };
      } else if ((status === 400 || status === 503) && body?.delivery === "not-sent") {
        delivery = { kind: "not-sent", fields, attempt, message: typeof body.error === "string" && body.error.trim() && body.error.length <= 500 ? body.error : "Check your details and refresh the board, then try Add suggestion when ready." };
      } else {
        delivery = { kind: "unknown", fields, attempt, afterReadId: sequence.current, retryReady: false };
      }
      dispatch({ type: "delivery", value: delivery });
    } catch {
      if (mounted.current) dispatch({ type: "delivery", value: { kind: "unknown", fields, attempt, afterReadId: sequence.current, retryReady: false } });
    } finally {
      finishRequest(controller);
      sending.current = false;
    }
  }

  function submitSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendSuggestion();
  }

  const waiting = unresolved(state.delivery);
  const submitting = state.delivery.kind === "sending";
  const fields = canonicalDraft(state.draft);
  const knownMatch = fields.title ? state.rows?.find((row) => sameSuggestionSong(row, fields))
    ?? (state.knownDuplicate && sameSuggestionSong(state.knownDuplicate, fields) ? state.knownDuplicate : null) : null;
  const search = state.query.trim().replace(/\s+/g, " ").toLowerCase();
  const results = (state.rows ?? []).filter((row) => (row.title + " " + row.artist).replace(/\s+/g, " ").toLowerCase().includes(search));
  const visible = results.slice(0, state.visibleCount);
  const receiptFields = unresolved(state.delivery) ? state.delivery.fields : null;
  const receiptMatch = receiptFields ? state.rows?.find((row) => sameSuggestionSong(row, receiptFields)) : null;

  return (
    <div className={styles.board}>
      <div className={styles.heading}>
        <div><p className={styles.kicker}>04 / Open suggestion board</p><h2 className={styles.title}>WHAT SHOULD WE LEARN NEXT?</h2></div>
        <p className={styles.intro}>Find an idea already on the board, or add something new. These are community ideas for future shows—not requests that change tonight’s official running order.</p>
      </div>
      <div className={styles.layout}>
        <section className={styles.feedCard} aria-label="Community suggestions">
          <div className={styles.feedHeader}>
            <div><span className={styles.feedLabel}>Community ideas · not the set order</span><strong>{state.rows === null ? "Find your song" : state.rows.length + " idea" + (state.rows.length === 1 ? "" : "s")}</strong></div>
            <a className={styles.addIdeaLink} href="#suggestion-form">Add a new idea ↓</a>
          </div>
          <div className={styles.discovery}>
            <label className={styles.field}><span>Find a song or artist</span><input type="search" value={state.query} onChange={(event) => dispatch({ type: "search", query: event.target.value })} maxLength={280} placeholder="Search before adding yours" /></label>
            <div className={styles.feedTools}>
              <p className={styles.feedStatus} data-testid="suggestion-feed-status" role="status">
                {state.feed === "loading" ? state.rows === null ? "Loading the board…" : "Checking for updates…" : state.feed === "unavailable" ? state.rows === null ? "Board unavailable. We cannot tell whether it is empty." : "Updates unavailable. Showing the last loaded ideas." : "Board loaded. Refresh to check for new ideas."}
              </p>
              <button className={styles.secondaryButton} type="button" disabled={state.feed === "loading"} onClick={() => void refreshBoard()}>Refresh board</button>
            </div>
          </div>
          <div className={styles.feed}>
            {state.rows !== null && results.length === 0 ? <p className={styles.empty}>{search ? "No matching ideas in this loaded board. Try the artist name or add a new idea." : state.feed === "ready" ? "No ideas in this verified board yet. Add the first one." : "The last loaded board was empty. Refresh before assuming it still is."}</p> : null}
            {search && results.length ? <p className={styles.resultCount} role="status">{results.length} matching idea{results.length === 1 ? "" : "s"}</p> : null}
            {visible.map((song) => <SuggestionCard key={song.id} song={song} />)}
            {results.length > visible.length ? <button className={styles.moreButton} type="button" onClick={() => dispatch({ type: "more" })}>Show more ideas ({results.length - visible.length} remaining)</button> : null}
          </div>
        </section>

        <form className={styles.formCard} id="suggestion-form" onSubmit={submitSuggestion}>
          <div className={styles.formTop}><span className={styles.formNumber}>ADD ONE</span><strong>Song suggestion</strong></div>
          <p className={styles.formHint}>Not on the board? Tell us what to learn. Originals are welcome; no YouTube link is required.</p>
          {state.delivery.kind !== "idle" ? (
            <div className={styles.delivery} data-testid="suggestion-delivery" role="status" aria-live="polite">
              <strong>{submitting ? "Sending your suggestion…" : state.delivery.kind === "awaiting" ? "Sent to form; waiting for board confirmation" : state.delivery.kind === "unknown" ? "Delivery not confirmed. Your draft is kept." : state.delivery.kind === "not-sent" ? "Not sent. Your draft is kept." : state.delivery.kind === "duplicate" ? "This song is already on the board." : "Confirmed on the board."}</strong>
              <p>{submitting ? "Please wait. Nothing changes the official set." : waiting ? "The response sheet may take time to update. Refresh the board before deciding to send again; another submission could create a duplicate." : state.delivery.kind === "not-sent" ? state.delivery.message : state.delivery.kind === "duplicate" ? "No new suggestion was added from this attempt. Review the existing idea below; it does not confirm your separate notes were submitted." : "The loaded board matches your song, artist, name, notes, and original-song choice. The official set did not change."}</p>
              {state.delivery.kind === "duplicate" ? <SuggestionCard song={state.delivery.existing} compact /> : null}
              {state.delivery.kind === "confirmed" ? <p>Confirmed idea: <strong>{state.delivery.existing.title}</strong>{state.delivery.existing.artist ? " — " + state.delivery.existing.artist : ""}</p> : null}
              {waiting ? <>
                <button className={styles.secondaryButton} type="button" disabled={state.feed === "loading"} onClick={() => void refreshBoard()}>Refresh board to check delivery</button>
                {receiptMatch ? <p>This song appears in the loaded ideas, but your complete submission has not been verified. Do not add it again just to change the notes.</p> : null}
                {unresolved(state.delivery) && state.delivery.retryReady && state.feed === "ready" ? <div className={styles.retryChoice}>
                  <p>Your complete idea was not found in that fresh read. It could still appear later. Waiting and checking again is safest.</p>
                  <label className={styles.checkChoice}><input type="checkbox" checked={state.retryAcknowledged} onChange={(event) => dispatch({ type: "retry-acknowledged", checked: event.target.checked })} /><span>I understand another submission may create a duplicate</span></label>
                  <button className={styles.secondaryButton} type="button" disabled={!state.retryAcknowledged} onClick={() => void sendSuggestion(true)}>Retry suggestion</button>
                </div> : null}
              </> : null}
              {!submitting ? <div className={styles.newIdea}>
                {state.confirmNewIdea && waiting ? <>
                  <p>Your earlier suggestion may still arrive. This clears only this draft and its delivery check; it does not cancel a submission.</p>
                  <button className={styles.secondaryButton} type="button" onClick={startDifferentIdea}>Yes, start a different idea</button>
                  <button className={styles.textButton} type="button" onClick={() => dispatch({ type: "confirm-new", value: false })}>Keep checking this idea</button>
                </> : <button className={styles.textButton} type="button" onClick={() => { if (waiting) dispatch({ type: "confirm-new", value: true }); else startDifferentIdea(); }}>Start a different idea</button>}
              </div> : null}
            </div>
          ) : null}
          {knownMatch && !waiting && state.delivery.kind !== "duplicate" ? <div className={styles.knownMatch} role="status"><strong>Already suggested — no need to send it twice.</strong><SuggestionCard song={knownMatch} compact /><p>{state.feed === "ready" ? "Your draft is kept if you want to suggest a different song." : "This match is from the last loaded board. Refresh to verify the current list."}</p></div> : null}
          <fieldset className={styles.fields} disabled={submitting || waiting}>
            <label className={styles.field}><span>Song title *</span><input ref={titleInput} name="title" required maxLength={140} value={state.draft.title} onChange={(event) => dispatch({ type: "edit", patch: { title: event.target.value } })} placeholder="e.g. My Own Worst Enemy" /></label>
            <label className={styles.field}><span>Artist</span><input name="artist" maxLength={140} value={state.draft.artist} onChange={(event) => dispatch({ type: "edit", patch: { artist: event.target.value } })} placeholder="e.g. Lit" /></label>
            <label className={styles.field}><span>Your name *</span><input name="addedBy" required maxLength={100} value={state.draft.addedBy} onChange={(event) => dispatch({ type: "edit", patch: { addedBy: event.target.value } })} placeholder="Who added it?" /></label>
            <label className={styles.field}><span>Why this one?</span><textarea name="notes" maxLength={500} rows={3} value={state.draft.notes} onChange={(event) => dispatch({ type: "edit", patch: { notes: event.target.value } })} placeholder="Singer, version, key, or why it would crush." /></label>
            <label className={styles.originalChoice}><input aria-label="This is an original or unreleased song" name="isOriginal" type="checkbox" value="true" checked={state.draft.isOriginal} onChange={(event) => dispatch({ type: "edit", patch: { isOriginal: event.target.checked } })} /><span><strong>This is an original / unreleased song</strong><small>Skip automatic YouTube and lyrics lookup.</small></span></label>
            <div className={styles.honeypot} aria-hidden="true"><input aria-label="Website" id="suggestion-website" name="website" tabIndex={-1} autoComplete="off" value={state.draft.website} onChange={(event) => dispatch({ type: "edit", patch: { website: event.target.value } })} /></div>
            <button className={styles.submitButton} type="submit" disabled={Boolean(knownMatch) || !fields.title || !fields.addedBy}>{submitting ? "Sending…" : "Add suggestion"}</button>
          </fieldset>
          <p className={styles.draftHint}>Drafts stay only in this open page. Reloading or closing it clears them.</p>
          {state.delivery.kind === "idle" || state.delivery.kind === "not-sent" ? <a className={styles.fallbackLink} href={FALLBACK_FORM} target="_blank" rel="noreferrer">Use the backup Google Form instead</a> : null}
        </form>
      </div>
    </div>
  );
}

function SuggestionCard({ song, compact = false }: { song: PublicSuggestion; compact?: boolean }) {
  return <article className={styles.suggestion + (compact ? " " + styles.compactSuggestion : "")}>
    <h3>{song.title}</h3>
    {song.isOriginal ? <span className={styles.originalTag}>Original</span> : null}
    {song.artist ? <p className={styles.artist}>{song.artist}</p> : null}
    {song.notes ? <p className={styles.notes}>{song.notes}</p> : null}
    <p className={styles.byline}>Added by <strong>{song.addedBy}</strong>{song.submittedAt ? " / " + formatDate(song.submittedAt) : ""}</p>
  </article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
