"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { parseCoachResult, type CoachInput, type CoachResult } from "../../lib/set-coach";
import styles from "./show-control.module.css";

type CoachDraft = Omit<CoachInput, "requestId"> & { setTitle: string };
type Review = { context: string } & (
  | { phase: "pending" | "changed" }
  | { phase: "ready"; result: CoachResult }
  | { phase: "error"; message: string }
);
type Operation = { controller: AbortController; timer: ReturnType<typeof setTimeout> };

const DEADLINE_MS = 10_000;
const TIMEOUT_MESSAGE = "The review timed out. Your draft is kept. Retry when you are ready.";

// Include response-body reading in the deadline, even if a late response ignores abort.
function withinDeadline<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error(TIMEOUT_MESSAGE));
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export default function SetCoach(draft: CoachDraft) {
  // Full draft identity includes order, cues, resources, timing and show identity.
  const context = JSON.stringify(draft);
  const [review, setReview] = useState<Review | null>(null);
  const operation = useRef<Operation | null>(null);
  const currentContext = useRef(context);

  // Discard the old result, including when the owner later returns to identical
  // content. A set/show round trip must never resurrect a retired response.
  if (review && review.context !== context) {
    setReview({ context, phase: "changed" });
  }
  useLayoutEffect(() => {
    currentContext.current = context;
    return () => {
      const retired = operation.current;
      operation.current = null;
      if (retired) {
        clearTimeout(retired.timer);
        retired.controller.abort();
      }
    };
  }, [context]);

  const currentReview = review?.context === context ? review : null;
  const pending = currentReview?.phase === "pending";
  const result = currentReview?.phase === "ready" ? currentReview.result : null;
  const changed = Boolean(review && (review.context !== context || review.phase === "changed"));
  const label = `${draft.showTitle} · ${draft.setTitle} · ${draft.songs.length} songs in this browser draft`;

  async function runCoach() {
    if (operation.current || !draft.songs.length) return;
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const ownOperation = {
      controller,
      timer: setTimeout(() => controller.abort(), DEADLINE_MS),
    };
    operation.current = ownOperation;
    const isCurrent = () => operation.current === ownOperation && currentContext.current === context;
    setReview({ context, phase: "pending" });
    try {
      const result = await withinDeadline((async () => {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            requestId, showId: draft.showId, showSlug: draft.showSlug,
            showTitle: draft.showTitle, setSlug: draft.setSlug,
            setTime: draft.setTime, songs: draft.songs,
          }),
        });
        if (response.status !== 200) throw new Error("The review is unavailable. Your draft is kept. Retry when you are ready.");
        const checked = parseCoachResult(await response.json().catch(() => null), requestId);
        if (!checked) throw new Error("The review could not be verified. Your draft is kept. Retry when you are ready.");
        return checked;
      })(), controller.signal);
      if (isCurrent() && !controller.signal.aborted) setReview({ context, phase: "ready", result });
    } catch (error) {
      if (isCurrent()) setReview({
        context,
        phase: "error",
        message: controller.signal.aborted ? TIMEOUT_MESSAGE
          : error instanceof Error && !(error instanceof TypeError) ? error.message
          : "The review is unavailable. Your draft is kept. Retry when you are ready.",
      });
    } finally {
      clearTimeout(ownOperation.timer);
      if (operation.current === ownOperation) operation.current = null;
    }
  }

  return (
    <>
      <section className={styles.coachPanel} aria-label="Set Coach">
        <div>
          <span>SET COACH</span>
          <strong>Timing, pacing, and readiness</strong>
          <p className={styles.coachContext}>{label}</p>
          <p>Reviews this browser draft. It does not save or publish the set.</p>
          <p role="status" aria-live="polite">
            {pending ? "Reviewing this draft..."
              : changed ? "The show, set, or draft changed. Review this set again for current advice."
              : currentReview?.phase === "error" ? currentReview.message
              : result ? "Review ready for the draft shown here."
              : !draft.songs.length ? "Add a song to this set before reviewing."
              : "Ready to review this set."}
          </p>
        </div>
        <button type="button" onClick={() => void runCoach()} disabled={pending || !draft.songs.length}>
          {pending ? "Reviewing..." : currentReview?.phase === "error" ? "Retry review"
            : changed ? "Review this set again" : "Review this set"}
        </button>
      </section>

      {result ? (
        <section className={styles.coachResult} aria-label="Set Coach review">
          <p className={styles.coachContext}>Reviewed: {label}</p>
          <header>
            <strong>{result.score === null ? "Timing not scored" : `${result.score}/100`}</strong>
            <span>{result.estimatedMinutes} estimated minutes
              {result.scheduledMinutes === null ? " / Scheduled window unknown" : ` / ${result.scheduledMinutes} scheduled minutes`}
            </span>
            <small>{result.source === "openai" ? "AI review" : "Smart set check"}</small>
          </header>
          <div className={styles.coachFindings}>
            {result.findings.map((finding, index) => (
              <article data-tone={finding.tone} key={index}>
                <strong>{finding.title}</strong>
                <p>{finding.detail}</p>
              </article>
            ))}
          </div>
          {result.aiNotes ? <p className={styles.aiNotes}>{result.aiNotes}</p> : null}
        </section>
      ) : null}
    </>
  );
}
